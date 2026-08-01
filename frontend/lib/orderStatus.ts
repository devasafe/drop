import type { StoreStatus } from '../components/ui/StatusPill';

export type OrderTone = 'pending' | 'active' | 'done' | 'cancelled';

/** Mapeia o status do pedido para o `StatusPill` do design system. */
const PILL: Record<string, StoreStatus> = {
  entregue: 'entregue', delivered: 'entregue',
  cancelado: 'cancelado', cancelled: 'cancelado', rejeitado: 'cancelado',
};
export function orderStatusPill(status: string): StoreStatus {
  return PILL[status] ?? 'em_entrega';
}

const LABEL: Record<string, string> = {
  criado: 'Aguardando aceite',
  created: 'Aguardando aceite',
  pago: 'Aguardando aceite',
  paid: 'Aguardando aceite',
  aguardando_motoboy: 'Aguardando motoboy',
  assigned: 'Motoboy a caminho',
  picked: 'Pedido retirado',
  enviado: 'A caminho',
  shipped: 'A caminho',
  aguardando_confirmacao: 'Aguardando confirmação',
  entregue: 'Entregue',
  delivered: 'Entregue',
  cancelado: 'Cancelado',
  cancelled: 'Cancelado',
  rejeitado: 'Rejeitado',
};

const TONE: Record<string, OrderTone> = {
  criado: 'pending', created: 'pending', pago: 'pending', paid: 'pending',
  aguardando_motoboy: 'active', assigned: 'active', picked: 'active',
  enviado: 'active', shipped: 'active', aguardando_confirmacao: 'active',
  entregue: 'done', delivered: 'done',
  cancelado: 'cancelled', cancelled: 'cancelled', rejeitado: 'cancelled',
};

/** Rótulo legível (pt-BR) para o status do pedido. Desconhecido → o próprio status. */
export function orderStatusLabel(status: string): string {
  return LABEL[status] ?? status;
}

/** Tom/cor do status: pending (âmbar) / active (roxo) / done (verde) / cancelled (vermelho). */
export function orderStatusTone(status: string): OrderTone {
  return TONE[status] ?? 'pending';
}
