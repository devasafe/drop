import type { CustomerOrderStatus } from '../components/drop/OrderStatusBadge';
import type { TimelineStep } from '../components/drop/OrderTimeline';

const hhmm = (d?: string | null) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined);
export const shortOrderCode = (id: string) => String(id || '').slice(-6).toUpperCase();

/** Plano 1: sem entrega, sem taxa e fora do modo direto (liquidação na loja). */
export function isPlan1Order(order: any): boolean {
  return !order?.deliveryId && !(Number(order?.deliveryFee) > 0) && order?.paymentProvider !== 'asaas_loja';
}

/** Status que o cliente vê, a partir de pedido + entrega (primeira regra que vale). */
export function customerOrderStatus(order: any, delivery?: any): CustomerOrderStatus {
  const os = order?.status;
  const ds = delivery?.status;
  if (os === 'cancelado' || os === 'rejeitado') return 'cancelled';
  if (os === 'entregue' || ds === 'delivered') return 'delivered';
  if (os === 'criado') return order?.paymentStatus === 'paid' ? 'awaiting_store' : 'awaiting_payment';
  if (ds === 'cancelled') return 'problem';
  if (ds === 'picked' || os === 'enviado') return 'out_for_delivery';
  if (ds === 'assigned') return 'preparing';
  if (ds === 'pending' || os === 'aguardando_motoboy') return 'finding_courier';
  if (isPlan1Order(order)) return 'in_progress';
  return 'preparing';
}

/** Fase atual → índice do passo (com motoboy: 0..5; Plano 1: 0..4). */
function phaseIndex(status: CustomerOrderStatus): number {
  switch (status) {
    case 'awaiting_payment': return 1;
    case 'awaiting_store': return 2;
    case 'finding_courier':
    case 'preparing':
    case 'in_progress': return 3;
    case 'out_for_delivery': return 4;
    default: return 2;
  }
}

/** Passos da timeline. Hora só onde o backend tem (não há pickedAt/deliveredAt). */
export function orderTimelineSteps(order: any, delivery?: any): TimelineStep[] {
  const plan1 = isPlan1Order(order) && !delivery;
  const status = customerOrderStatus(order, delivery);
  const mb = delivery?.motoboyObj;
  const courierFound = ['assigned', 'picked', 'delivered'].includes(delivery?.status);
  const labels: Array<Pick<TimelineStep, 'label' | 'time' | 'detail'>> = plan1
    ? [
        { label: 'Pedido feito', time: hhmm(order?.createdAt) },
        { label: 'Pagamento confirmado' },
        { label: 'Loja aceitou', time: hhmm(order?.acceptedAt) },
        { label: 'Combine a entrega com a loja' },
        { label: 'Recebido' },
      ]
    : [
        { label: 'Pedido feito', time: hhmm(order?.createdAt) },
        { label: 'Pagamento confirmado' },
        { label: 'Loja aceitou', time: hhmm(order?.acceptedAt) },
        courierFound
          ? { label: 'Entregador a caminho da loja', detail: mb ? [mb.name, mb.plate].filter(Boolean).join(' · ') : undefined }
          : { label: 'Procurando entregador' },
        { label: 'Saiu para entrega' },
        { label: 'Entregue' },
      ];

  if (status === 'delivered') return labels.map((s) => ({ ...s, state: 'done' as const }));
  if (status === 'cancelled' || status === 'problem') {
    const reached = order?.acceptedAt || ['pago', 'aguardando_motoboy', 'enviado'].includes(order?.status) || delivery ? 3 : order?.paymentStatus === 'paid' ? 2 : 1;
    return [
      ...labels.slice(0, reached).map((s) => ({ ...s, state: 'done' as const })),
      {
        label: status === 'problem' ? 'Problema na entrega' : order?.status === 'rejeitado' ? 'Recusado pela loja' : 'Cancelado',
        time: hhmm(order?.cancelledAt),
        state: 'error' as const,
      },
    ];
  }
  const current = phaseIndex(status);
  return labels.map((s, i) => ({ ...s, state: i < current ? ('done' as const) : i === current ? ('current' as const) : ('upcoming' as const) }));
}
