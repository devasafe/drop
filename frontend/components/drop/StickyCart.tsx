import { ArrowRight } from 'lucide-react';
import { formatBRL } from '../ui/PriceTag';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './StickyCart.module.css';

export interface StickyCartProps {
  count: number;
  total: number;
  onOpen: () => void;
}

/**
 * Barra fixa de carrinho, flutuando sobre o conteúdo. Replica `.cart` do
 * mock canônico (fundo `--brand` sólido, `--shadow-float`). A visibilidade
 * fica a cargo de quem consome (renderize só quando `count > 0`).
 */
export function StickyCart({ count, total, onOpen }: StickyCartProps) {
  return (
    <button
      type="button"
      className={styles.cart}
      aria-label={`Ver carrinho, ${count} itens, total ${formatBRL(total)}`}
      onClick={onOpen}
    >
      <span className={styles.left}>
        <span className={styles.count}>{count}</span>
        Ver carrinho
      </span>
      <span className={styles.right}>
        {formatBRL(total)}
        <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
      </span>
    </button>
  );
}
