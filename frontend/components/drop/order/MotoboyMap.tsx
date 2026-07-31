import { useMemo } from 'react';
import { Navigation } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import MotoboyRouteMap from '../../MotoboyRouteMap';
import styles from './MotoboyMap.module.css';

export interface MotoboyMapPoint {
  lat: number;
  lng: number;
}

export interface MotoboyMapProps {
  motoboy?: MotoboyMapPoint;
  store?: MotoboyMapPoint;
  customer?: MotoboyMapPoint;
  height?: number;
}

/**
 * Wrapper fino do `MotoboyRouteMap` pra tela de acompanhamento do cliente:
 * traduz `motoboy`/`store`/`customer` (nomes semânticos do domínio) pros
 * `pointA`/`pointB`/`pointC` genéricos do mapa (que já rotula A/B/C nos
 * marcadores). Sem posição do motoboy ainda (aguardando o primeiro
 * `delivery:location_updated`), mostra um placeholder em vez do mapa vazio —
 * o `MotoboyRouteMap` em si já degrada sozinho quando falta o Google Maps.
 */
export function MotoboyMap({ motoboy, store, customer, height = 300 }: MotoboyMapProps) {
  // Memoizados pelas coordenadas NUMÉRICAS (não pelo objeto `motoboy`/
  // `store`/`customer` em si): `MotoboyRouteMap` reconstrói o mapa e refaz a
  // chamada de Directions sempre que a IDENTIDADE de pointA/B/C muda, e sem
  // isso cada render (inclusive o polling de 5s do `useOrderTracking`) criava
  // um objeto novo — mapa piscando e uma chamada à Directions API por poll.
  const pointA = useMemo(
    () => (motoboy ? { ...motoboy, label: 'Motoboy' } : undefined),
    [motoboy?.lat, motoboy?.lng]
  );
  const pointB = useMemo(
    () => (store ? { ...store, label: 'Loja' } : undefined),
    [store?.lat, store?.lng]
  );
  const pointC = useMemo(
    () => (customer ? { ...customer, label: 'Você' } : undefined),
    [customer?.lat, customer?.lng]
  );

  if (!pointA) {
    return (
      <div className={styles.placeholder} style={{ height }}>
        <Navigation size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        <span>Aguardando localização do motoboy...</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <MotoboyRouteMap pointA={pointA} pointB={pointB} pointC={pointC} height={height} />
    </div>
  );
}

export default MotoboyMap;
