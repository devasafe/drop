import { haversineKm, parseCoords, LatLng } from './geo';

export const RADIUS_KM_DEFAULT = 20;

export const isPremium = (store: any): boolean => Number(store?.plan) === 3;

/** true se sem coords do usuário (não filtra) OU sem coords da loja (não filtra) OU dentro do raio. */
function inRadius(userCoords: LatLng | null, lat: any, lng: any, radiusKm: number): boolean {
  if (!userCoords) return true;
  const c = parseCoords(lat, lng);
  if (!c) return true;
  return haversineKm(userCoords, c) <= radiusKm;
}

/** Filtra por proximidade (quando há coords) e ordena premium primeiro,
 * preservando a ordem de entrada (vendas) dentro de cada tier.
 * `premiumOnly` deixa passar só loja Plano 3 (vitrine premium). */
export function rankStores(
  stores: any[],
  userCoords: LatLng | null,
  opts: { radiusKm?: number; premiumOnly?: boolean } = {},
): any[] {
  const radiusKm = opts.radiusKm ?? RADIUS_KM_DEFAULT;
  const kept = (stores || []).filter(
    (s) => (!opts.premiumOnly || isPremium(s)) && inRadius(userCoords, s?.latitude, s?.longitude, radiusKm),
  );
  return kept
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (Number(isPremium(b.s)) - Number(isPremium(a.s))) || (a.i - b.i))
    .map((x) => x.s);
}

/** Junta várias listas ranqueadas em ordem, dedup por _id, até `n` itens.
 * Camadas anteriores têm prioridade (ex.: perto antes de longe). */
export function take<T>(sources: T[][], n: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of sources) {
    for (const x of list) {
      const id = (x as any)?._id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(x);
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** Produtos de lojas premium (storePlan===3), dentro do raio (coords da loja via
 * `coordsByStoreId`), preservando a ordem de entrada (vendas). */
export function rankPremiumProducts(
  products: any[],
  coordsByStoreId: Map<string, any> | null,
  userCoords: LatLng | null,
  opts: { radiusKm?: number } = {},
): any[] {
  const radiusKm = opts.radiusKm ?? RADIUS_KM_DEFAULT;
  return (products || []).filter((p) => {
    if (Number(p?.storePlan) !== 3) return false;
    const sc = coordsByStoreId?.get(p?.storeId);
    return inRadius(userCoords, sc?.latitude, sc?.longitude, radiusKm);
  });
}
