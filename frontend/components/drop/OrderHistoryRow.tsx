import { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { Package } from 'lucide-react';
import { historyLine, historyTitle } from '../../lib/orderHistory';
import styles from './OrderHistoryRow.module.css';

export interface OrderHistoryRowProps { order: any; imageUrl?: string; onOpen: () => void; action?: ReactNode }

/** Linha do histórico (protótipo Pedidos). A ação à direita não abre o pedido (clique nem teclado: ruling P14). */
export function OrderHistoryRow({ order, imageUrl, onOpen, action }: OrderHistoryRowProps) {
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
  };
  return (
    <div className={styles.row} role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKey}>
      <span className={styles.thumb} style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined} aria-hidden="true">
        {!imageUrl && <Package size={18} />}
      </span>
      <span className={styles.tx}><b>{historyTitle(order)}</b><span>{historyLine(order)}</span></span>
      {action && <span className={styles.end} onClick={stop} onKeyDown={stop}>{action}</span>}
    </div>
  );
}
