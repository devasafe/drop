import { useEffect, useRef } from 'react';
import { Marker } from 'maplibre-gl';
import { useDropMap } from '../DropMapContext';
import styles from './MarkersLayer.module.css';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  store?: LatLng | null;
  customer?: LatLng | null;
  motoboy?: LatLng | null;
}

const ICON_STORE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M3 9l1.2-5h15.6L21 9M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9M9 20v-6h6v6"/></svg>';
const ICON_MOTO =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="#7C3AED"><circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/><path d="M14 8h3l2.2 3.3" fill="none" stroke="#7C3AED" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 14.5 8 10h5l1.5 4.5" fill="none" stroke="#7C3AED" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function makeEl(inner: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = styles.marker;
  el.innerHTML = inner;
  return el;
}

/**
 * Camada de negócio: marcadores Loja / Motoboy / Você. São `maplibregl.Marker`
 * (DOM, sem sprite). O motoboy MOVE com tween (requestAnimationFrame) entre a
 * última e a nova posição — não recria o marcador nem re-renderiza o mapa.
 */
export function MarkersLayer({ store, customer, motoboy }: Props) {
  const map = useDropMap();
  const storeRef = useRef<Marker | null>(null);
  const custRef = useRef<Marker | null>(null);
  const motoRef = useRef<Marker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastMoto = useRef<LatLng | null>(null);

  // Loja
  useEffect(() => {
    if (!map || !store) return;
    if (!storeRef.current) {
      storeRef.current = new Marker({
        element: makeEl(`<div class="${styles.badge}">${ICON_STORE}</div><span class="${styles.label}">Loja</span>`),
        anchor: 'bottom',
      })
        .setLngLat([store.lng, store.lat])
        .addTo(map);
    } else {
      storeRef.current.setLngLat([store.lng, store.lat]);
    }
  }, [map, store?.lat, store?.lng]);

  // Cliente (Você)
  useEffect(() => {
    if (!map || !customer) return;
    if (!custRef.current) {
      custRef.current = new Marker({
        element: makeEl(`<div class="${styles.pin}"></div><span class="${styles.label}">Você</span>`),
        anchor: 'bottom',
      })
        .setLngLat([customer.lng, customer.lat])
        .addTo(map);
    } else {
      custRef.current.setLngLat([customer.lng, customer.lat]);
    }
  }, [map, customer?.lat, customer?.lng]);

  // Motoboy (com tween suave)
  useEffect(() => {
    if (!map || !motoboy) return;
    if (!motoRef.current) {
      motoRef.current = new Marker({
        element: makeEl(`<div class="${styles.moto}">${ICON_MOTO}</div>`),
        anchor: 'center',
      })
        .setLngLat([motoboy.lng, motoboy.lat])
        .addTo(map);
      lastMoto.current = motoboy;
      return;
    }
    const from = lastMoto.current || motoboy;
    const to = motoboy;
    const start = performance.now();
    const dur = 800;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const lat = from.lat + (to.lat - from.lat) * k;
      const lng = from.lng + (to.lng - from.lng) * k;
      motoRef.current?.setLngLat([lng, lat]);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else lastMoto.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [map, motoboy?.lat, motoboy?.lng]);

  // Limpeza
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      storeRef.current?.remove();
      custRef.current?.remove();
      motoRef.current?.remove();
    },
    []
  );

  return null;
}

export default MarkersLayer;
