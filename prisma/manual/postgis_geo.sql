-- ============================================================================
-- PostGIS — SCRIPT MANUAL (NÃO é uma migração Prisma de propósito)
-- ----------------------------------------------------------------------------
-- ⚠️ Por que manual? O deploy do DROP roda `prisma migrate deploy` no boot do
-- backend. O Postgres do Coolify é `postgres:16-alpine`, que NÃO traz PostGIS —
-- um `CREATE EXTENSION postgis` dentro de uma migração faria o migrate FALHAR e
-- o backend NÃO SUBIR. Então o PostGIS fica fora do caminho automático.
--
-- COMO ATIVAR O DISPATCH GEOGRÁFICO (passo a passo):
--   1. Trocar a imagem do Postgres no Coolify para `postgis/postgis:16`
--      (ou instalar PostGIS na atual) e subir de novo.
--   2. Rodar ESTE script uma vez no banco de produção (Terminal do Coolify / psql).
--   3. Setar a env do backend `GEO_DISPATCH=postgis` e redeploy.
-- Enquanto isso não acontecer, o dispatch usa haversine em JS (comportamento atual).
-- O código (src/services/dispatchGeo.ts) já cai no fallback sozinho se as colunas
-- não existirem, então rodar com a flag ligada sem este script NÃO quebra nada.
-- ============================================================================

-- 1) Extensão
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2) Colunas geography
ALTER TABLE "Store"    ADD COLUMN IF NOT EXISTS "geom"      geography(Point, 4326);
ALTER TABLE "Address"  ADD COLUMN IF NOT EXISTS "geom"      geography(Point, 4326);
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "storeGeom" geography(Point, 4326);

-- 3) Backfill dos registros existentes
-- Store/Address guardam lat/lng como TEXTO — converte só o que for número válido
-- e diferente de 0,0 (sentinela de "sem coordenada").
UPDATE "Store"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
WHERE "latitude"  ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND "longitude" ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND NOT ("latitude"::double precision = 0 AND "longitude"::double precision = 0);

UPDATE "Address"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
WHERE "latitude"  ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND "longitude" ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND NOT ("latitude"::double precision = 0 AND "longitude"::double precision = 0);

-- Delivery guarda storeLatitude/storeLongitude como Float.
UPDATE "Delivery"
SET "storeGeom" = ST_SetSRID(ST_MakePoint("storeLongitude", "storeLatitude"), 4326)::geography
WHERE "storeLatitude" IS NOT NULL AND "storeLongitude" IS NOT NULL
  AND NOT ("storeLatitude" = 0 AND "storeLongitude" = 0);

-- 4) Triggers de sincronia (lat/lng -> geom em todo INSERT/UPDATE)
CREATE OR REPLACE FUNCTION drop_sync_store_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude"  ~ '^-?[0-9]+(\.[0-9]+)?$'
     AND NEW."longitude" ~ '^-?[0-9]+(\.[0-9]+)?$'
     AND NOT (NEW."latitude"::double precision = 0 AND NEW."longitude"::double precision = 0) THEN
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude"::double precision, NEW."latitude"::double precision), 4326)::geography;
  ELSE
    NEW."geom" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION drop_sync_address_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude"  ~ '^-?[0-9]+(\.[0-9]+)?$'
     AND NEW."longitude" ~ '^-?[0-9]+(\.[0-9]+)?$'
     AND NOT (NEW."latitude"::double precision = 0 AND NEW."longitude"::double precision = 0) THEN
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."longitude"::double precision, NEW."latitude"::double precision), 4326)::geography;
  ELSE
    NEW."geom" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION drop_sync_delivery_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."storeLatitude" IS NOT NULL AND NEW."storeLongitude" IS NOT NULL
     AND NOT (NEW."storeLatitude" = 0 AND NEW."storeLongitude" = 0) THEN
    NEW."storeGeom" := ST_SetSRID(ST_MakePoint(NEW."storeLongitude", NEW."storeLatitude"), 4326)::geography;
  ELSE
    NEW."storeGeom" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_geom ON "Store";
CREATE TRIGGER trg_store_geom BEFORE INSERT OR UPDATE OF "latitude", "longitude"
ON "Store" FOR EACH ROW EXECUTE FUNCTION drop_sync_store_geom();

DROP TRIGGER IF EXISTS trg_address_geom ON "Address";
CREATE TRIGGER trg_address_geom BEFORE INSERT OR UPDATE OF "latitude", "longitude"
ON "Address" FOR EACH ROW EXECUTE FUNCTION drop_sync_address_geom();

DROP TRIGGER IF EXISTS trg_delivery_geom ON "Delivery";
CREATE TRIGGER trg_delivery_geom BEFORE INSERT OR UPDATE OF "storeLatitude", "storeLongitude"
ON "Delivery" FOR EACH ROW EXECUTE FUNCTION drop_sync_delivery_geom();

-- 5) Índices espaciais (GiST)
CREATE INDEX IF NOT EXISTS idx_store_geom         ON "Store"    USING GIST ("geom");
CREATE INDEX IF NOT EXISTS idx_address_geom       ON "Address"  USING GIST ("geom");
CREATE INDEX IF NOT EXISTS idx_delivery_storegeom ON "Delivery" USING GIST ("storeGeom");
