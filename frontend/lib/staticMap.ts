/**
 * Monta URLs da MapTiler Static Maps API — usado nos thumbnails de rota dentro
 * dos cards de aceitar (motoboy e loja). Imagem estática (sem WebGL), leve o
 * suficiente pra várias aparecerem numa lista. Estilo dark p/ chegar perto da
 * identidade do Drop Maps. A chave é a mesma pública do NEXT_PUBLIC_MAPTILER_KEY.
 */

export interface RoutePoint {
  lat: number;
  lng: number;
}

interface ThumbOpts {
  store?: RoutePoint | null;
  customer?: RoutePoint | null;
  motoboy?: RoutePoint | null;
  /** Polyline codificada (Google) da rota loja→cliente, se houver. */
  polyline?: string | null;
  width?: number;
  height?: number;
  /** Chave MapTiler; sem ela retorna null (não dá pra montar a imagem). */
  key?: string;
  /** Estilo do mapa (map id do MapTiler). */
  style?: string;
}

const STROKE = '%238b5cf6'; // #8b5cf6 (roxo da marca), '#' url-encoded

const isPoint = (p?: RoutePoint | null): p is RoutePoint =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** `lng,lat` (ordem da MapTiler), com precisão enxuta pra encurtar a URL. */
const lngLat = (p: RoutePoint) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

/**
 * Retorna a URL do thumbnail estático da rota, ou `null` quando não há chave ou
 * dados insuficientes (menos de 2 pontos e sem polyline) — o chamador deve
 * tratar `null` não renderizando nada.
 */
export function buildRouteThumbnailUrl(opts: ThumbOpts): string | null {
  const { store, customer, motoboy, polyline, key } = opts;
  if (!key) return null;

  const width = opts.width ?? 640;
  const height = opts.height ?? 180;
  const style = opts.style ?? 'streets-v2-dark';

  const markers = [store, customer, motoboy].filter(isPoint) as RoutePoint[];
  const hasPolyline = typeof polyline === 'string' && polyline.length > 0;

  // Precisa de ao menos a polyline OU 2 pontos pra desenhar algo útil.
  if (!hasPolyline && markers.length < 2) return null;

  // Rota: usa a polyline real quando existe; senão, liga loja→cliente em linha.
  let path: string | null = null;
  if (hasPolyline) {
    path = `stroke:${STROKE}|width:5|enc:${encodeURIComponent(polyline as string)}`;
  } else if (isPoint(store) && isPoint(customer)) {
    path = `stroke:${STROKE}|width:5|${lngLat(store)}|${lngLat(customer)}`;
  }

  const params: string[] = [`key=${encodeURIComponent(key)}`];
  if (path) params.push(`path=${path}`);
  if (markers.length) params.push(`markers=${markers.map(lngLat).join('|')}`);

  // `auto` enquadra a imagem na rota + marcadores automaticamente.
  return `https://api.maptiler.com/maps/${style}/static/auto/${width}x${height}@2x.png?${params.join('&')}`;
}
