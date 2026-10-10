-- Busca no servidor (Task 5 DS v2): pg_trgm + unaccent quando o banco permitir.
-- Tolerante a QUALQUER erro de extensão (privilégio, contrib ausente, allow-list do provedor): só avisa e a API usa o fallback
-- (ILIKE sobre translate()). A API detecta as extensões na primeira busca (uma vez por processo).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'busca: extensões indisponíveis (%), usando fallback', SQLERRM;
END $$;

-- Só com as DUAS extensões: função IMMUTABLE (unaccent é STABLE e não entra em índice)
-- e os índices GIN trigram nas expressões que a busca usa.
DO $$
DECLARE
  unaccent_schema text;
BEGIN
  IF (SELECT count(*) FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent')) = 2 THEN
    SELECT n.nspname INTO unaccent_schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'unaccent';

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
         LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
         AS $f$ SELECT %1$I.unaccent(%2$L::regdictionary, $1) $f$',
      unaccent_schema, quote_ident(unaccent_schema) || '.unaccent');

    CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
      ON "Product" USING gin (lower(immutable_unaccent("name")) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "Store_name_trgm_idx"
      ON "Store" USING gin (lower(immutable_unaccent("name")) gin_trgm_ops);
  ELSE
    RAISE NOTICE 'busca: sem pg_trgm/unaccent, índices trigram não criados';
  END IF;
-- Falha ao criar função/índices (permissão em public, gin_trgm_ops fora do search_path, lock)
-- não pode derrubar o `migrate deploy` do boot: o bloco desfaz tudo e a busca usa o fallback.
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'busca: índices não criados (%)', SQLERRM;
END $$;
