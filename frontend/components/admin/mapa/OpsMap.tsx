/**
 * Mapa do admin em MapLibre (D3b-1, spec 3.4): DropMap (o mesmo motor do app) com os pontos da operação.
 * Só roda no cliente (WebGL): a tela carrega este arquivo com dynamic(..., { ssr: false }) via OpsMapPanel.
 */
import DropMap from '../../map/DropMap';
import { OpsMarkersLayer, type OpsMarkersLayerProps } from './OpsMarkersLayer';
import styles from './OpsMap.module.css';

export type OpsMapProps = OpsMarkersLayerProps;

export default function OpsMap({ motoboys, stores, onSelect }: OpsMapProps) {
  return (
    <DropMap className={styles.map}>
      <OpsMarkersLayer motoboys={motoboys} stores={stores} onSelect={onSelect} />
    </DropMap>
  );
}
