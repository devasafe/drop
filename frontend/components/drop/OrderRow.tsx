import type { ReactNode } from 'react';
import { Row } from '../ui/List';
import { OrderStatusBadge, type CustomerOrderStatus } from './OrderStatusBadge';
import { formatMoney } from '../../lib/money';
import { paymentMethodLabel } from '../../lib/paymentLabel';
import styles from './OrderRow.module.css';

export interface OrderRowData {
  _id: string;
  /** Status cru do backend (criado, pago, enviado, entregue...). */
  status: string;
  total: number;
  storeName?: string;
  createdAt?: string;
  /** Status do pagamento (distingue "criado" aguardando pagamento de aguardando a loja). */
  paymentStatus?: string;
  /** Código curto do pedido (ex.: "A1B2C3D4"). */
  code?: string;
  /** Resumo dos itens, ex.: "2 itens · Pizza, Refri". */
  itemsLabel?: string;
  paymentMethod?: string | null;
  installmentCount?: number | null;
}

/** Status do backend → vocabulário que o cliente vê (OrderStatusBadge). */
export function toCustomerStatus(status: string, paymentStatus?: string): CustomerOrderStatus {
  switch (status) {
    case 'criado':
    case 'created':
      return paymentStatus && paymentStatus !== 'paid' ? 'awaiting_payment' : 'awaiting_store';
    case 'entregue':
    case 'delivered':
      return 'delivered';
    case 'cancelado':
    case 'cancelled':
    case 'rejeitado':
      return 'cancelled';
    // pago (vale da aceitação da loja até a entrega), aguardando_motoboy e qualquer outro:
    // a lista de pedidos não traz o status da
    // entrega, então não afirmamos uma fase (buscando / a caminho) que pode estar errada.
    default:
      return 'in_progress';
  }
}

interface OrderRowProps {
  order: OrderRowData;
  onClick?: () => void;
  /** Mostra a data de criação (histórico). */
  showDate?: boolean;
  /** Ação secundária no rodapé da linha ("Acompanhar", "De novo"). */
  action?: ReactNode;
}

/** Linha de pedido nas listas do cliente (DS v2): uma `Row` de `List`. */
export function OrderRow({ order, onClick, showDate = false, action }: OrderRowProps) {
  const sub = [order.code ? `#${order.code}` : null, order.itemsLabel].filter(Boolean).join(' · ');
  const installments = order.installmentCount && order.installmentCount > 1 ? order.installmentCount : null;
  const payLabel = order.paymentMethod
    ? paymentMethodLabel(order.paymentMethod) + (installments ? ` · ${installments}x` : '')
    : null;
  const date =
    showDate && order.createdAt
      ? new Date(order.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

  return (
    <Row interactive={!!onClick} onClick={onClick}>
      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.store}>{order.storeName || 'Loja'}</span>
          <OrderStatusBadge status={toCustomerStatus(order.status, order.paymentStatus)} />
        </div>
        {sub && <div className={styles.sub}>{sub}</div>}
        {payLabel && <div className={styles.sub}>{payLabel}</div>}
        <div className={styles.foot}>
          <span className={styles.total}>{formatMoney(order.total)}</span>
          {date && <span className={styles.sub}>{date}</span>}
          {action && (
            // P14: a ação não deixa click nem teclado (Enter/Espaço) subirem até a linha,
            // senão a Row captura o keydown, cancela a ativação do botão e abre o pedido.
            <div
              className={styles.action}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {action}
            </div>
          )}
        </div>
      </div>
    </Row>
  );
}
