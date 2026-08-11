import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LngLatBounds } from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import DropMap from '../DropMap';
import { RouteLayer } from '../layers/RouteLayer';
import { MarkersLayer, LatLng } from '../layers/MarkersLayer';
import { MapControls } from '../ui/MapControls';
import { TrackingCard, TrackingStep } from '../ui/TrackingCard';
import { CourierCard, CourierInfo } from '../ui/CourierCard';
import { useSocket } from '../../../contexts/SocketContext';
import { parseCoords } from '../../../lib/geo';
import api from '../../../lib/api';
import styles from './ClienteTrackingMap.module.css';

interface Props {
  order: any;
  onClose: () => void;
}

/** Passos do progresso (aprox. da referência) derivados de order/delivery. */
function deriveSteps(orderStatus?: string, deliveryStatus?: string, hasDelivery?: boolean): TrackingStep[] {
  const paidOrBeyond = orderStatus === 'pago' || orderStatus === 'enviado' || orderStatus === 'entregue';
  const accepted = hasDelivery || paidOrBeyond;
  const enRoute = deliveryStatus === 'picked' || deliveryStatus === 'delivered' || orderStatus === 'entregue';
  const delivered = deliveryStatus === 'delivered' || orderStatus === 'entregue';
  return [
    { label: 'Confirmado', done: !!orderStatus },
    { label: 'Preparando', done: accepted },
    { label: 'Saiu para entrega', done: enRoute },
    { label: 'Entrega', done: delivered },
  ];
}

function statusBadge(orderStatus?: string, deliveryStatus?: string): string {
  if (orderStatus === 'entregue' || deliveryStatus === 'delivered') return 'Entregue';
  if (deliveryStatus === 'picked') return 'A caminho';
  if (deliveryStatus === 'assigned') return 'Preparando';
  if (orderStatus === 'pago') return 'Preparando';
  return 'Confirmado';
}

function etaText(durationSeconds?: number): string {
  if (!durationSeconds || durationSeconds <= 0) return 'A caminho';
  const min = Math.round(durationSeconds / 60);
  const low = Math.max(1, min - 2);
  const high = min + 3;
  return `${low}–${high} min`;
}

/**
 * Experiência do CLIENTE (preset): rota + motoboy vivo + Loja/Você + cards de ETA
 * e do entregador, tudo sobre a base DropMap. Renderiza fullscreen via portal
 * (fora do PageTransition). Auto-suficiente: busca a entrega e escuta a posição
 * do motoboy por socket.
 */
export function ClienteTrackingMap({ order, onClose }: Props) {
  const { on } = useSocket();
  const [mounted, setMounted] = useState(false);
  const [delivery, setDelivery] = useState<any>(null);
  const [motoboy, setMotoboy] = useState<LatLng | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const deliveryId = order?.deliveryId;

  // Busca a entrega (traz motoboyObj + coords + status).
  useEffect(() => {
    if (!deliveryId) return;
    let cancelled = false;
    api.get(`/deliveries/${deliveryId}`)
      .then((r) => { if (!cancelled) setDelivery(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deliveryId]);

  // Posição do motoboy em tempo real (relay do backend usa `_id` + `location`).
  useEffect(() => {
    if (!deliveryId) return;
    const unsub = on('delivery:location_updated', (data: any) => {
      if (data._id !== deliveryId) return;
      const { latitude, longitude } = data.location || {};
      if (latitude == null || longitude == null) return;
      setMotoboy({ lat: latitude, lng: longitude });
    });
    return unsub;
  }, [on, deliveryId]);

  const store = parseCoords(order?.storeLatitude ?? delivery?.storeLatitude, order?.storeLongitude ?? delivery?.storeLongitude);
  const customer = parseCoords(order?.customerLatitude ?? delivery?.customerLatitude, order?.customerLongitude ?? delivery?.customerLongitude);

  const fit = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const pts = [store, customer, motoboy].filter(Boolean) as LatLng[];
    if (pts.length < 1) return;
    const b = new LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: { top: 110, bottom: 240, left: 90, right: 90 }, maxZoom: 15, duration: 600 });
  }, [store, customer, motoboy]);

  // Enquadra uma vez quando loja+cliente já são conhecidos e o mapa está pronto.
  useEffect(() => {
    if (fittedRef.current) return;
    if (mapRef.current && store && customer) {
      fit();
      fittedRef.current = true;
    }
  }, [store, customer, fit]);

  if (!mounted) return null;

  const mb: CourierInfo = {
    name: delivery?.motoboyObj?.name,
    photo: delivery?.motoboyObj?.photo,
    plate: delivery?.motoboyObj?.plate,
    rating: delivery?.motoboyObj?.rating,
  };
  const hasCourier = !!delivery?.motoboyObj;
  const orderCode = order?._id ? `#${String(order._id).slice(-6).toUpperCase()}` : undefined;
  const distanceText = order?.deliveryDistance ? `${Number(order.deliveryDistance).toFixed(1).replace('.', ',')} km` : undefined;

  const center = store || customer || undefined;

  const overlay = (
    <div className={styles.overlay}>
      <DropMap
        center={center ? [center.lng, center.lat] : undefined}
        zoom={13}
        onReady={(m) => {
          mapRef.current = m;
          if (!fittedRef.current && store && customer) {
            fit();
            fittedRef.current = true;
          }
        }}
      >
        <RouteLayer polyline={order?.routePolyline} />
        <MarkersLayer store={store} customer={customer} motoboy={motoboy} />
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
        <span className={styles.legendItem}><span className={styles.swMoto} /> Motoboy</span>
        <span className={styles.legendItem}><span className={styles.swDot} /> Você / Loja</span>
      </div>

      <TrackingCard
        etaText={etaText(order?.deliveryDuration)}
        statusBadge={statusBadge(order?.status, delivery?.status)}
        steps={deriveSteps(order?.status, delivery?.status, !!delivery)}
        storeName={order?.store?.name || delivery?.storeObj?.name}
        orderCode={orderCode}
        distanceText={distanceText}
      />

      {hasCourier && <CourierCard courier={mb} />}
    </div>
  );

  return createPortal(overlay, document.body);
}

export default ClienteTrackingMap;
