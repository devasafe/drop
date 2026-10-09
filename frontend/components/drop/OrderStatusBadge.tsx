import styles from './OrderStatusBadge.module.css';

/** Os estados que o cliente vê (spec §7.1). O mapeamento a partir de
 *  status + paymentStatus + delivery.status do backend fica na tela. */
export type CustomerOrderStatus =
  | 'awaiting_payment'
  | 'awaiting_store'
  | 'preparing'
  | 'finding_courier'
  | 'out_for_delivery'
  | 'in_progress'
  | 'delivered'
  | 'cancelled'
  | 'problem';

type Tone = 'warning' | 'info' | 'brand' | 'success' | 'neutral' | 'error';

const VIEW: Record<CustomerOrderStatus, { label: string; tone: Tone }> = {
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'warning' },
  awaiting_store: { label: 'Aguardando a loja', tone: 'warning' },
  preparing: { label: 'Em preparação', tone: 'warning' },
  finding_courier: { label: 'Procurando entregador', tone: 'info' },
  out_for_delivery: { label: 'Saiu para entrega', tone: 'brand' },
  in_progress: { label: 'Em andamento', tone: 'info' },
  delivered: { label: 'Entregue', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  problem: { label: 'Problema na entrega', tone: 'error' },
};

export function orderStatusView(status: CustomerOrderStatus) {
  return VIEW[status];
}

/**
 * Status do pedido para o cliente (DS v2). Mesma família visual do
 * DeliveryBadge: ponto + rótulo na cor do estado, nunca só a cor.
 * "Saiu para entrega" usa a cor de ação — é progresso (Regra D).
 */
export function OrderStatusBadge({ status }: { status: CustomerOrderStatus }) {
  const { label, tone } = VIEW[status];
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}
