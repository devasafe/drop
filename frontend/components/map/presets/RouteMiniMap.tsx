import { useRef } from 'react';
import { LngLatBounds } from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import DropMap from '../DropMap';
import { RouteLayer } from '../layers/RouteLayer';
import { MarkersLayer, LatLng } from '../layers/MarkersLayer';
import styles from './RouteMiniMap.module.css';

interface Props {
  store?: LatLng | null;
  customer?: LatLng | null;
  motoboy?: LatLng | null;
  polyline?: string | null;
  height?: number;
}

/**
 * Mini-mapa (preset) do Drop Maps para os cards de aceitar: mapa dark real
 * (tiles vetoriais) com a rota + pins de loja/cliente/motoboy, TRAVADO (sem
 * zoom/arrasto/rotação) — é um thumbnail vivo, não um mapa navegável. Carregar
 * via dynamic(..., { ssr:false }) por causa do WebGL.
 */
export function RouteMiniMap({ store, customer, motoboy, polyline, height = 150 }: Props) {
  const fittedRef = useRef(false);
  const pts = [store, customer, motoboy].filter(Boolean) as LatLng[];
  const center = store || customer || motoboy || undefined;

  const lock = (m: MaplibreMap) => {
    m.scrollZoom.disable();
    m.dragPan.disable();
    m.doubleClickZoom.disable();
    m.touchZoomRotate.disable();
    m.keyboard.disable();
    m.boxZoom.disable();
    m.dragRotate.disable();
  };

  const fit = (m: MaplibreMap) => {
    if (pts.length < 2) return;
    const b = new LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: 34, maxZoom: 15, duration: 0 });
  };

  return (
    <div className={styles.wrap} style={{ height }}>
      <DropMap
        center={center ? [center.lng, center.lat] : undefined}
        zoom={13}
        onReady={(m) => {
          lock(m);
          if (!fittedRef.current) {
            fit(m);
            fittedRef.current = true;
          }
        }}
      >
        <RouteLayer polyline={polyline} />
        <MarkersLayer store={store} customer={customer} motoboy={motoboy} storeLabel="Loja" customerLabel="Cliente" />
      </DropMap>
    </div>
  );
}

export default RouteMiniMap;
