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
  if (!motoboy) {
    return (
      <div className={styles.placeholder} style={{ height }}>
        <Navigation size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        <span>Aguardando localização do motoboy...</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <MotoboyRouteMap
        pointA={{ ...motoboy, label: 'Motoboy' }}
        pointB={store ? { ...store, label: 'Loja' } : undefined}
        pointC={customer ? { ...customer, label: 'Você' } : undefined}
        height={height}
      />
    </div>
  );
}

export default MotoboyMap;
