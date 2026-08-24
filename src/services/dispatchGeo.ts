import { prisma } from '../lib/prisma';
import { DISPATCH_BASE_KM, DISPATCH_STEP_KM, DISPATCH_STEP_MS, DISPATCH_MAX_KM } from './dispatch';

/**
 * Dispatch geográfico via PostGIS (ST_DWithin) — versão em BANCO do motor de raio
 * crescente de `dispatch.ts`. O comportamento é IDÊNTICO ao haversine em JS:
 *
 *   idade 0–10s → 3 km ; 10–20s → 7 km ; 20–30s → 11 km ; 30s+ → visível a todos.
 *
 * A diferença é que a filtragem acontece no Postgres, usando o índice GiST em
 * Delivery.storeGeom — escala muito melhor que buscar 200 linhas e filtrar em JS.
 *
 * SEGURANÇA/GRADUALIDADE: só entra em ação com GEO_DISPATCH='postgis' E com o
 * script manual `prisma/manual/postgis_geo.sql` aplicado (colunas geom + PostGIS).
 * Em QUALQUER erro (extensão ausente, coluna inexistente, etc.) retorna `null` —
 * sinal para o chamador cair no caminho JS legado. Assim nada muda em produção
 * até rodar o script + ligar a flag.
 */

const isEnabled = () => (process.env.GEO_DISPATCH || '').toLowerCase() === 'postgis';

/**
 * IDs das entregas pendentes VISÍVEIS para um motoboy nesta localização, na ordem
 * de criação (mais antigas primeiro), respeitando o raio por idade.
 *
 * Retorna `null` quando o caminho geográfico não deve/não pode ser usado
 * (flag desligada, sem localização do motoboy, ou erro) → usar o filtro JS.
 */
export async function geoVisiblePendingIds(
  motoboy: { lat: number; lng: number } | null | undefined,
): Promise<string[] | null> {
  if (!isEnabled()) return null;
  // Sem localização do motoboy o comportamento legado é "mostra tudo" — deixa o
  // caminho JS decidir (não dá pra rodar ST_DWithin sem um ponto de referência).
  if (!motoboy || !Number.isFinite(motoboy.lat) || !Number.isFinite(motoboy.lng)) return null;

  const base = DISPATCH_BASE_KM;
  const step = DISPATCH_STEP_KM;
  const stepMs = DISPATCH_STEP_MS;
  const maxKm = DISPATCH_MAX_KM;

  try {
    // radius_km(row) = base + step * floor(idadeMs / stepMs). Se >= maxKm → todos.
    // storeGeom nulo (loja sem coordenada) → visível (não dá pra filtrar), igual ao JS.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT d.id
      FROM "Delivery" d
      WHERE d.status = 'pending' AND d."motoboyId" IS NULL
        AND (
          d."storeGeom" IS NULL
          OR (${base}::float8 + ${step}::float8 * floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - d."createdAt")) * 1000) / ${stepMs}::float8)) >= ${maxKm}::float8
          OR ST_DWithin(
               d."storeGeom",
               ST_SetSRID(ST_MakePoint(${motoboy.lng}::float8, ${motoboy.lat}::float8), 4326)::geography,
               (${base}::float8 + ${step}::float8 * floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - d."createdAt")) * 1000) / ${stepMs}::float8)) * 1000
             )
        )
      ORDER BY d."createdAt" ASC
      LIMIT 500
    `;
    return rows.map((r) => r.id);
  } catch (err: any) {
    console.warn('⚠️ [dispatchGeo] ST_DWithin falhou — fallback para filtro JS (haversine):', err?.message);
    return null;
  }
}

export default { geoVisiblePendingIds };
