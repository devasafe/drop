import { ChevronRight } from 'lucide-react';
import { formatMoney } from '../../../lib/money';
import styles from './RefundRequestList.module.css';

export type RefundStatus = 'aguardando_loja' | 'aprovado' | 'recusado' | 'aguardando_pagamento' | 'devolvendo' | 'concluido';

export interface RefundSummary {
  _id: string;
  orderId: string;
  orderCode: string;
  storeName: string;
  status: RefundStatus;
  mode: 'loja' | 'motoboy' | null;
  amount: number;
  createdAt: string;
}

type Tone = 'wait' | 'action' | 'done' | 'denied';

/** A situação do reembolso em palavras do cliente (o detalhe fica na tela do pedido). */
export const REFUND_STATUS: Record<RefundStatus, { label: string; tone: Tone }> = {
  aguardando_loja: { label: 'Em análise pela loja', tone: 'wait' },
  aprovado: { label: 'Aprovado: escolha como devolver', tone: 'action' },
  aguardando_pagamento: { label: 'Falta pagar a corrida de volta', tone: 'action' },
  devolvendo: { label: 'Devolvendo o produto', tone: 'wait' },
  concluido: { label: 'Reembolsado', tone: 'done' },
  recusado: { label: 'Recusado', tone: 'denied' },
};

/** Ainda em andamento (conta no número da aba). */
export const isOpenRefund = (r: RefundSummary) => r.status !== 'concluido' && r.status !== 'recusado';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });

/** Lista dos pedidos de reembolso do cliente: tocar abre o pedido, onde fica o passo a passo. */
export function RefundRequestList({ items, onOpen }: { items: RefundSummary[]; onOpen: (orderId: string) => void }) {
  return (
    <ul className={styles.list}>
      {items.map((r) => {
        const s = REFUND_STATUS[r.status] ?? { label: r.status, tone: 'wait' as Tone };
        return (
          <li key={r._id}>
            <button type="button" className={styles.row} onClick={() => onOpen(r.orderId)}>
              <span className={styles.main}>
                <span className={styles.store}>{r.storeName}</span>
                <span className={styles.meta}>{`Pedido #${r.orderCode} · pedido em ${dateLabel(r.createdAt)} · ${formatMoney(r.amount)}`}</span>
                <span className={`${styles.pill} ${styles[s.tone]}`}>{s.label}</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className={styles.chev} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
