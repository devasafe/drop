import { MapPin, ChevronDown } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './AddressBar.module.css';

export interface AddressBarProps {
  label?: string;
  address: string;
  onClick?: () => void;
}

/**
 * Endereço de entrega atual. Replica `.addr` do mock canônico:
 * pin + "Entregar em <endereço>" + chevron, **sem card/borda** — só
 * texto e ícones sobre a superfície do header (spec Regra B).
 */
export function AddressBar({ label = 'Entregar em', address, onClick }: AddressBarProps) {
  return (
    <button
      type="button"
      className={styles.addressBar}
      aria-label={`${label} ${address}`}
      onClick={onClick}
    >
      <MapPin size={15} strokeWidth={ICON_STROKE_WIDTH} className={styles.pin} aria-hidden="true" />
      <span>
        {label} <b className={styles.address}>{address}</b>
      </span>
      <ChevronDown size={15} strokeWidth={ICON_STROKE_WIDTH} className={styles.chevron} aria-hidden="true" />
    </button>
  );
}
