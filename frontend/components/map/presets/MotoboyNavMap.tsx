import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MaplibreMap } from 'maplibre-gl';
import DropMap from '../DropMap';
import { RouteLayer } from '../layers/RouteLayer';
import { MarkersLayer, LatLng } from '../layers/MarkersLayer';
import { MapControls } from '../ui/MapControls';
import { NavCard } from '../ui/NavCard';
import { parseCoords, haversineKm } from '../../../lib/geo';
import api from '../../../lib/api';
import styles from './MotoboyNavMap.module.css';

interface Props {
  delivery: any;
  self?: LatLng | null;
  onClose: () => void;
  /** Confirma a entrega com o PIN digitado (do cliente). Só na perna de entrega. */
  onFinalize?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
}

interface NavRoute {
  target: 'store' | 'customer';
  polyline: string | null;
  distanceMeters: number;
  durationSeconds: number;
}

const fmtEta = (sec: number) => (sec > 0 ? `${Math.max(1, Math.round(sec / 60))} min` : '—');
const fmtDist = (m: number) => (m <= 0 ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/**
 * Experiência do MOTOBOY (preset): navegação até a perna atual (loja se 'assigned',
 * cliente se 'picked'). Mostra a posição do motoboy seguindo o GPS, a rota até o
 * alvo (RouteService, via /deliveries/:id/route) e o NavCard com PIN + atalho pro
 * Google Maps/Waze. Fullscreen via portal (fora do PageTransition).
 */
export function MotoboyNavMap({ delivery, self, onClose, onFinalize }: Props) {
  const [mounted, setMounted] = useState(false);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const followRef = useRef(true);
  const lastFrom = useRef<LatLng | null>(null);
  const lastLeg = useRef<string | undefined>(undefined);

  useEffect(() => setMounted(true), []);

  const deliveryId = delivery?._id || delivery?.id;
  const goingToCustomer = delivery?.status === 'picked';

  const store = parseCoords(delivery?.storeLatitude, delivery?.storeLongitude);
  const customer = parseCoords(delivery?.customerLatitude, delivery?.customerLongitude);
  const target = goingToCustomer ? customer : store;

  // Busca a rota self→alvo ao trocar de perna OU quando o motoboy anda >150m.
  useEffect(() => {
    if (!deliveryId || !self) return;
    const legChanged = lastLeg.current !== delivery?.status;
    const moved = !lastFrom.current || haversineKm(lastFrom.current, self) > 0.15;
    if (!legChanged && !moved && route) return;
    lastLeg.current = delivery?.status;
    lastFrom.current = self;
    api.get(`/deliveries/${deliveryId}/route`, { params: { fromLat: self.lat, fromLng: self.lng } })
      .then((r) => setRoute(r.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId, delivery?.status, self?.lat, self?.lng]);

  // Segue o motoboy com a câmera (a menos que ele arraste o mapa).
  useEffect(() => {
    if (mapRef.current && self && followRef.current) {
      mapRef.current.easeTo({ center: [self.lng, self.lat], duration: 500 });
    }
  }, [self?.lat, self?.lng]);

  const recenter = useCallback(() => {
    followRef.current = true;
    if (mapRef.current && self) mapRef.current.easeTo({ center: [self.lng, self.lat], zoom: 15, duration: 500 });
  }, [self]);

  if (!mounted) return null;

  const center = self || target || undefined;
  const instruction = goingToCustomer ? 'Vá até o cliente' : 'Vá até a loja';
  const address = goingToCustomer ? delivery?.customerAddress : delivery?.storeAddress;
  const pinLabel = goingToCustomer ? 'PIN de entrega' : 'PIN de retirada';
  // Na retirada, o motoboy MOSTRA o pinRetirada pra loja (exibe). Na entrega, ele
  // DIGITA o PIN do cliente (input) — nunca exibir delivery.pin pro motoboy.
  const pin = goingToCustomer ? undefined : delivery?.pinRetirada;

  const overlay = (
    <div className={styles.overlay}>
      <DropMap
        center={center ? [center.lng, center.lat] : undefined}
        zoom={15}
        onReady={(m) => {
          mapRef.current = m;
          m.on('dragstart', () => { followRef.current = false; });
          if (self) m.easeTo({ center: [self.lng, self.lat], zoom: 15, duration: 0 });
        }}
      >
        {route?.polyline && <RouteLayer polyline={route.polyline} />}
        <MarkersLayer store={store} customer={customer} motoboy={self} storeLabel="Loja" customerLabel="Cliente" />
        <MapControls onRecenter={recenter} />
      </DropMap>

      <button type="button" className={styles.close} onClick={onClose}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Voltar
      </button>

      <div className={styles.navDock}>
        <NavCard
          instruction={instruction}
          etaText={fmtEta(route?.durationSeconds || 0)}
          distanceText={fmtDist(route?.distanceMeters || 0)}
          address={address}
          pinLabel={pinLabel}
          pin={pin}
          onConfirm={goingToCustomer ? onFinalize : undefined}
          target={target}
        />
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export default MotoboyNavMap;
