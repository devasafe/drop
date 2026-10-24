/**
 * Pontos do Mapa ao vivo (D3b-1, spec 3.4). Cria um marcador por motoboy online, com a cor do estado (Livre,
 * Em entrega, Sem sinal), e um pino por loja com pedido aguardando motoboy (D3b-4b: ou, com o interruptor ligado,
 * um pino de alerta por loja aberta sem motoboy por perto). São marcadores DOM do MapLibre, como
 * os da MarkersLayer do app, atualizados no lugar: posição nova só move, e quem saiu é removido. Nome e texto
 * entram por textContent e aria-label (nunca innerHTML), porque vêm do banco. Enquadra os pontos uma vez só, para
 * não brigar com o zoom de quem está olhando.
 */
import { useEffect, useRef } from 'react';
import { Marker } from 'maplibre-gl';
import { useDropMap } from '../../map/DropMapContext';
import { MAP_STATE_LABEL, type MotoboyMapState } from '../../../lib/adminOps';
import styles from './OpsMap.module.css';

export interface OpsMapPoint { id: string; name: string; lat: number; lng: number; state: MotoboyMapState; detail: string | null }
/** `kind`: 'waiting' (padrão) = loja com pedido aguardando; 'noCourier' = loja aberta sem motoboy por perto. */
export interface OpsStorePin { id: string; name: string; lat: number; lng: number; kind?: StorePinKind }
type StorePinKind = 'waiting' | 'noCourier';
const STORE_PIN_TEXT: Record<StorePinKind, string> = { waiting: 'aguardando motoboy', noCourier: 'sem motoboy por perto' };
export interface OpsMarkersLayerProps { motoboys: OpsMapPoint[]; stores: OpsStorePin[]; onSelect: (id: string) => void }

function paintPoint(el: HTMLButtonElement, p: OpsMapPoint) {
  const label = [p.name, MAP_STATE_LABEL[p.state], p.detail].filter(Boolean).join(' · ');
  // Só as classes de estado: as do MapLibre (maplibregl-marker e a da âncora) precisam sobreviver.
  el.classList.remove(styles.free, styles.delivering, styles.stale);
  el.classList.add(styles.point, styles[p.state]);
  el.dataset.state = p.state;
  el.setAttribute('aria-label', label);
  el.title = label;
}

function storeEl(name: string, kind: StorePinKind): HTMLDivElement {
  const el = document.createElement('div');
  el.classList.add(styles.store);
  el.dataset.kind = kind;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${name} · ${STORE_PIN_TEXT[kind]}`);
  const pin = document.createElement('span');
  pin.className = kind === 'noCourier' ? `${styles.storePin} ${styles.storePinAlert}` : styles.storePin;
  const label = document.createElement('span');
  label.className = styles.storeLabel;
  label.textContent = name;
  el.append(pin, label);
  return el;
}

export function OpsMarkersLayer({ motoboys, stores, onSelect }: OpsMarkersLayerProps) {
  const map = useDropMap();
  const points = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const pins = useRef(new Map<string, Marker>());
  const select = useRef(onSelect);
  const fitted = useRef(false);

  useEffect(() => { select.current = onSelect; });

  useEffect(() => {
    if (!map) return;
    const seen = new Set<string>();
    motoboys.forEach((p) => {
      seen.add(p.id);
      let cur = points.current.get(p.id);
      if (cur) {
        cur.marker.setLngLat([p.lng, p.lat]);
      } else {
        const el = document.createElement('button');
        el.type = 'button';
        el.addEventListener('click', () => select.current(p.id));
        const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        cur = { marker, el };
        points.current.set(p.id, cur);
      }
      paintPoint(cur.el, p);
    });
    points.current.forEach((cur, id) => {
      if (seen.has(id)) return;
      cur.marker.remove();
      points.current.delete(id);
    });
  }, [map, motoboys]);

  useEffect(() => {
    if (!map) return;
    const seen = new Set<string>();
    stores.forEach((s) => {
      seen.add(s.id);
      const cur = pins.current.get(s.id);
      if (cur) {
        cur.setLngLat([s.lng, s.lat]);
        return;
      }
      pins.current.set(s.id, new Marker({ element: storeEl(s.name, s.kind ?? 'waiting'), anchor: 'bottom' }).setLngLat([s.lng, s.lat]).addTo(map));
    });
    pins.current.forEach((marker, id) => {
      if (seen.has(id)) return;
      marker.remove();
      pins.current.delete(id);
    });
  }, [map, stores]);

  useEffect(() => {
    if (!map || fitted.current) return;
    const all = [...motoboys, ...stores];
    if (all.length === 0) return;
    fitted.current = true;
    const lngs = all.map((p) => p.lng);
    const lats = all.map((p) => p.lat);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 48, maxZoom: 14, duration: 0 },
    );
  }, [map, motoboys, stores]);

  useEffect(() => {
    const pts = points.current;
    const pns = pins.current;
    return () => {
      pts.forEach((cur) => cur.marker.remove());
      pns.forEach((marker) => marker.remove());
    };
  }, []);

  return null;
}

export default OpsMarkersLayer;
