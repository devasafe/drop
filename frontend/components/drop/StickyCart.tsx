import { ArrowRight } from 'lucide-react';
import { formatBRL } from '../ui/PriceTag';
import styles from './StickyCart.module.css';

export interface StickyCartProps {
  count: number;
  total: number;
  onOpen: () => void;
}

/**
 * Barra fixa da sacola, flutuando sobre o conteúdo ("Ver sacola · N itens" + total).
 * A visibilidade fica a cargo de quem consome (renderize só quando `count > 0`).
 */
export function StickyCart({ count, total, onOpen }: StickyCartProps) {
  const word = count === 1 ? 'item' : 'itens';
  return (
    <button type="button" className={styles.cart} aria-label={`Ver sacola, ${count} ${word}, total ${formatBRL(total)}`} onClick={onOpen}>
      <span className={styles.left} aria-live="polite">Ver sacola · {count} {word}</span>
      <span className={styles.right}>{formatBRL(total)}<ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></span>
    </button>
  );
}
