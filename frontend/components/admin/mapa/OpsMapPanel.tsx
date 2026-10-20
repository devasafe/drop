/**
 * Moldura do Mapa ao vivo (D3b-1, spec 3.4). Se o mapa não carregar, mostra "Mapa indisponível" e a tela continua
 * com as listas. Os casos: sem a chave do MapTiler, WebGL indisponível, exceção dentro do mapa ou o pedaço do
 * MapLibre que não baixou.
 */
import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { Alert } from '../../ui/Alert';
import logger from '../../../lib/logger';
import { hasMapKey } from '../../../lib/mapConfig';
import type { OpsMapProps } from './OpsMap';
import styles from './OpsMap.module.css';

const OpsMap = dynamic<OpsMapProps>(() => import('./OpsMap'), { ssr: false });

function MapUnavailable() {
  return <Alert tone="warning" title="Mapa indisponível">As listas continuam atualizadas.</Alert>;
}

class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    logger.error('[admin/mapa] mapa indisponível', error);
  }

  render() {
    return this.state.failed ? <MapUnavailable /> : this.props.children;
  }
}

export function OpsMapPanel(props: OpsMapProps) {
  if (!hasMapKey()) return <MapUnavailable />;
  return (
    <MapBoundary>
      <div className={styles.box}>
        <OpsMap {...props} />
      </div>
    </MapBoundary>
  );
}

export default OpsMapPanel;
