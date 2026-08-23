import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LngLatBounds } from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import DropMap from '../DropMap';
import { RouteLayer } from '../layers/RouteLayer';
import { MarkersLayer, LatLng } from '../layers/MarkersLayer';
import { MapControls } from '../ui/MapControls';
import styles from './RouteMapModal.module.css';

interface Props {
  store?: LatLng | null;
  customer?: LatLng | null;
  motoboy?: LatLng | null;
  polyline?: string | null;
  onClose: () => void;
}

/**
 * Rota em tela cheia (INTERATIVA): mapa dark do Drop com a rota + pins de
 * loja/cliente/motoboy. Aberta ao clicar no thumbnail do card de aceitar.
 * Renderiza via portal no <body> (fora do PageTransition) — assim o WebGL não
 * fica preto e o overlay gruda na viewport de verdade.
 */
export function RouteMapModal({ store, customer, motoboy, polyline, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<MaplibreMap | null>(null);
  const pts = [store, customer, motoboy].filter(Boolean) as LatLng[];
  const center = store || customer || motoboy || undefined;

  useEffect(() => setMounted(true), []);

  // Fecha no ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fit = useCallback(() => {
    const m = mapRef.current;
    if (!m || pts.length < 2) return;
    const b = new LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: { top: 90, bottom: 120, left: 60, right: 60 }, maxZoom: 16, duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, customer, motoboy]);

  if (!mounted) return null;

  const overlay = (
    <div className={styles.overlay}>
      <DropMap
        center={center ? [center.lng, center.lat] : undefined}
        zoom={14}
        onReady={(m) => {
          mapRef.current = m;
          fit();
        }}
      >
        <RouteLayer polyline={polyline} />
        <MarkersLayer store={store} customer={customer} motoboy={motoboy} storeLabel="Loja" customerLabel="Cliente" />
        <MapControls onRecenter={fit} />
      </DropMap>

      <button type="button" className={styles.close} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Voltar
      </button>

      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={styles.swRoute} /> Rota</span>
        <span className={styles.legendItem}><span className={styles.swStore} /> Loja</span>
        <span className={styles.legendItem}><span className={styles.swCustomer} /> Cliente</span>
        {motoboy && <span className={styles.legendItem}><span className={styles.swMoto} /> Você</span>}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export default RouteMapModal;
