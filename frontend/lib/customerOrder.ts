import type { CustomerOrderStatus } from '../components/drop/OrderStatusBadge';
import type { TimelineStep } from '../components/drop/OrderTimeline';

const hhmm = (d?: string | null) => {
  if (!d) return undefined;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
export const shortOrderCode = (id: string) => String(id || '').slice(-6).toUpperCase();

/** Plano 1: sem entrega, sem taxa e fora do modo direto (liquidação na loja). */
export function isPlan1Order(order: any): boolean {
  return !order?.deliveryId && !(Number(order?.deliveryFee) > 0) && order?.paymentProvider !== 'asaas_loja';
}

/** Pacote voltando para a loja (motoboy cancelou depois de retirar), aguardando o código da loja. */
export const isReturning = (delivery: any): boolean => delivery?.statusDevolucao === 'aguardando_confirmacao';

/** Status que o cliente vê, a partir de pedido + entrega (primeira regra que vale). */
export function customerOrderStatus(order: any, delivery?: any): CustomerOrderStatus {
  const os = order?.status;
  const ds = delivery?.status;
  if (os === 'cancelado' || os === 'rejeitado') return 'cancelled';
  if (os === 'entregue' || ds === 'delivered') return 'delivered';
  if (os === 'criado') return order?.paymentStatus === 'paid' ? 'awaiting_store' : 'awaiting_payment';
  if (ds === 'cancelled') return 'problem';
  // O motoboy desistiu com o pacote na mão: ele volta para a loja e o cliente escolhe.
  if (isReturning(delivery)) return 'returning';
  if (ds === 'picked' || os === 'enviado') return 'out_for_delivery';
  if (ds === 'assigned') return 'preparing';
  if (ds === 'pending' || os === 'aguardando_motoboy') return order?.awaitingCustomerPoolDecision ? 'no_courier' : 'finding_courier';
  if (isPlan1Order(order)) return 'in_progress';
  return 'preparing';
}

/** Fase atual → índice do passo (com motoboy: 0..5; Plano 1: 0..4). */
function phaseIndex(status: CustomerOrderStatus): number {
  switch (status) {
    case 'awaiting_payment': return 1;
    case 'awaiting_store': return 2;
    case 'finding_courier':
    case 'no_courier':
    case 'preparing':
    case 'in_progress': return 3;
    case 'out_for_delivery': return 4;
    default: return 2;
  }
}

/** Passos da timeline. Hora só onde o backend grava: createdAt/acceptedAt no pedido e assignedAt/pickedAt/deliveredAt na entrega (pedido antigo não tem, e nada é inventado). */
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
          ? { label: 'Entregador a caminho da loja', time: hhmm(delivery?.assignedAt), detail: mb ? [mb.name, mb.plate].filter(Boolean).join(' · ') : undefined }
          : { label: 'Procurando entregador' },
        { label: 'Saiu para entrega', time: hhmm(delivery?.pickedAt) },
        { label: 'Entregue', time: hhmm(delivery?.deliveredAt) },
      ];

  // Antes do pagamento, o passo em andamento não pode dizer "confirmado".
  if (status === 'awaiting_payment') labels[1] = { label: 'Aguardando pagamento' };

  if (status === 'returning') {
    const courier = String(mb?.name || '').split(' ')[0];
    return [
      ...labels.slice(0, 3).map((s) => ({ ...s, state: 'done' as const })),
      { label: courier ? `${courier} retirou na loja` : 'Retirado na loja', time: hhmm(delivery?.pickedAt), state: 'done' as const },
      { label: 'Entrega interrompida', state: 'error' as const },
      { label: 'Voltando para a loja', detail: 'a loja confirma com um código', state: 'current' as const },
      { label: delivery?.pendingReturnAction === 'reassign' ? 'Nova entrega' : 'Nova entrega ou reembolso', state: 'upcoming' as const },
    ];
  }
  if (status === 'delivered') return labels.map((s) => ({ ...s, state: 'done' as const }));
  if (status === 'cancelled' || status === 'problem') {
    const reached = order?.acceptedAt || ['pago', 'aguardando_motoboy', 'enviado'].includes(order?.status) || delivery ? 3 : ['paid', 'refunded'].includes(order?.paymentStatus) ? 2 : 1;
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
