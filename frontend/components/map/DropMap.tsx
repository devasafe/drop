import { useEffect, useRef, useState, ReactNode } from 'react';
import { Map as MaplibreMap, AttributionControl } from 'maplibre-gl';
import { DropMapContext } from './DropMapContext';
import { buildDropDarkStyle } from './style/dropDark';
import { mapConfig, hasMapKey } from '../../lib/mapConfig';
import styles from './DropMap.module.css';

export interface DropMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** Camadas de negócio + overlays (só montam depois que o mapa carrega). */
  children?: ReactNode;
  onReady?: (map: MaplibreMap) => void;
}

/**
 * MOTOR do Drop Maps (camada 1). Cria a instância do MapLibre UMA vez, guarda em
 * ref e a disponibiliza via context. Não re-monta por mudança de dados — as
 * camadas de negócio atualizam o mapa imperativamente (setData/addLayer).
 *
 * ⚠️ Carregue esta página/componente com `dynamic(..., { ssr: false })`: o MapLibre
 * usa WebGL/`window` e não roda no servidor.
 */
export default function DropMap({ center, zoom, className, children, onReady }: DropMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasMapKey()) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: buildDropDarkStyle(mapConfig.maptilerKey),
      center: center ?? mapConfig.defaultCenter,
      zoom: zoom ?? mapConfig.defaultZoom,
      attributionControl: false, // adicionada manualmente abaixo (compacta, exigida por ToS)
      dragRotate: false,          // delivery não precisa de rotação/tilt
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true }));

    map.on('load', () => {
      setReady(true);
      onReady?.(map);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`${styles.wrap} ${className || ''}`}>
      <div ref={containerRef} className={styles.canvas} />

      {!hasMapKey() && (
        <div className={styles.notice}>
          <strong>Drop Maps</strong>
          <span>
            Configure <code>NEXT_PUBLIC_MAPTILER_KEY</code> no <code>.env</code> do frontend
            para carregar o mapa.
          </span>
        </div>
      )}

      {ready && mapRef.current && (
        <DropMapContext.Provider value={mapRef.current}>{children}</DropMapContext.Provider>
      )}
    </div>
  );
}
