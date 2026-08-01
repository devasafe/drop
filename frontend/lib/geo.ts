export interface LatLng { lat: number; lng: number; }

/** Faz parse seguro de lat/lng (que vêm como string no backend). 0,0 = inválido. */
export function parseCoords(lat: any, lng: any): LatLng | null {
  const a = Number(lat), b = Number(lng);
  if (!isFinite(a) || !isFinite(b) || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}

/** Distância em km entre dois pontos (haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
