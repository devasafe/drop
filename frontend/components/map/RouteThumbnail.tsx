import { useState } from 'react';
import { buildRouteThumbnailUrl, RoutePoint } from '../../lib/staticMap';
import { MAPTILER_KEY } from '../../lib/mapConfig';
import { decodePolyline } from '../../lib/polyline';
import styles from './RouteThumbnail.module.css';

interface Props {
  store?: RoutePoint | null;
  customer?: RoutePoint | null;
  motoboy?: RoutePoint | null;
  polyline?: string | null;
  height?: number;
}

const isPoint = (p?: RoutePoint | null): p is RoutePoint =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/**
 * Croqui SVG da rota (linha + pins), sem tiles/plano — fallback quando a imagem
 * estática falha (ex.: MapTiler Static Maps não habilitado no plano → 403) ou
 * quando não há chave. É um esquema (fora de escala), não um mapa de ruas.
 */
function RouteSketch({ store, customer, motoboy, polyline, height }: Props) {
  // Linha da rota: polyline real (GeoJSON [lng,lat]) ou reta loja→cliente.
  let line: [number, number][] = [];
  if (polyline) line = decodePolyline(polyline);
  if (line.length < 2 && isPoint(store) && isPoint(customer)) {
    line = [[store.lng, store.lat], [customer.lng, customer.lat]];
  }

  const pins = [
    isPoint(store) ? { p: store, c: 'var(--brand)' } : null,
    isPoint(customer) ? { p: customer, c: 'var(--text-strong)' } : null,
    isPoint(motoboy) ? { p: motoboy, c: 'var(--success)' } : null,
  ].filter(Boolean) as { p: RoutePoint; c: string }[];

  if (line.length < 2 && pins.length < 2) return null;

  const all = [...line, ...pins.map((m) => [m.p.lng, m.p.lat] as [number, number])];
  const lngs = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1e-6;
  const spanLat = maxLat - minLat || 1e-6;

  const VW = 160, VH = 90, pad = 12;
  const px = (lng: number) => pad + ((lng - minLng) / spanLng) * (VW - 2 * pad);
  const py = (lat: number) => pad + (1 - (lat - minLat) / spanLat) * (VH - 2 * pad); // lat p/ cima → y menor

  const d = line.map((c, i) => `${i ? 'L' : 'M'}${px(c[0]).toFixed(1)},${py(c[1]).toFixed(1)}`).join(' ');

  return (
    <div className={styles.wrap} style={{ height }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className={styles.svg} aria-label="Rota da entrega">
        {d && <path d={d} fill="none" stroke="var(--brand-2)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {pins.map((m, i) => (
          <g key={i}>
            <circle cx={px(m.p.lng)} cy={py(m.p.lat)} r={4.5} fill={m.c} stroke="var(--bg)" strokeWidth={1.5} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Thumbnail da rota loja→cliente para os cards de aceitar. Tenta a imagem
 * estática (MapTiler); se falhar (plano sem Static Maps, rede) ou não houver
 * chave, cai no croqui SVG — nunca mostra imagem quebrada.
 */
export function RouteThumbnail({ store, customer, motoboy, polyline, height = 150 }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const url = buildRouteThumbnailUrl({
    store,
    customer,
    motoboy,
    polyline,
    width: 640,
    height: Math.round(height * 1.2),
    key: MAPTILER_KEY,
  });

  if (!url || imgFailed) {
    return <RouteSketch store={store} customer={customer} motoboy={motoboy} polyline={polyline} height={height} />;
  }

  return (
    <div className={styles.wrap} style={{ height }}>
      <img
        className={styles.img}
        src={url}
        alt="Rota da entrega"
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}

export default RouteThumbnail;
