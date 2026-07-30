import styles from './Logo.module.css';
import { MapPin } from 'lucide-react';

export type LogoSize = 'sm' | 'md';

export interface LogoProps {
  size?: LogoSize;
}

/**
 * Marca do produto: pin em gradiente de marca + wordmark `DROP` em caixa
 * alta, como `.pin`/`.wm` do mock canônico. `size="sm"` reduz o pin e a
 * fonte proporcionalmente (ex.: dentro de contextos mais compactos que o
 * AppHeader), mantendo a mesma composição.
 */
export function Logo({ size = 'md' }: LogoProps) {
  return (
    <span className={[styles.logo, styles[size]].join(' ')}>
      <span className={styles.pin} aria-hidden="true">
        <MapPin size={size === 'sm' ? 14 : 18} strokeWidth={2} />
      </span>
      <span className={styles.wordmark}>DROP</span>
    </span>
  );
}
