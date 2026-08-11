import { useDropMap } from '../DropMapContext';
import styles from './MapControls.module.css';

/**
 * Controles do mapa (camada UI): zoom +/- e "centralizar". Sobrepostos ao mapa,
 * estilo translúcido premium. Operam o motor via context (imperativo).
 */
export function MapControls({ onRecenter }: { onRecenter?: () => void }) {
  const map = useDropMap();
  if (!map) return null;

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.locate}
        onClick={onRecenter}
        aria-label="Centralizar"
        title="Centralizar"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </button>
      <div className={styles.group}>
        <button type="button" className={styles.btn} onClick={() => map.zoomIn()} aria-label="Aproximar">
          +
        </button>
        <button type="button" className={styles.btn} onClick={() => map.zoomOut()} aria-label="Afastar">
          −
        </button>
      </div>
    </div>
  );
}

export default MapControls;
