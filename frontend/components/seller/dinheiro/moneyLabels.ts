import type { StageTone } from '../../../lib/sellerOrders';

/** Login do Asaas (a loja do modo direto confere saldo e extrato lá). */
export const ASAAS_URL = 'https://www.asaas.com/login';

/** Payout da custódia no vocabulário da loja. */
export const PAYOUT_LABEL: Record<string, string> = {
  pending: 'A receber',
  released: 'Liberado',
  requested: 'Saque pedido',
  paid: 'Sacado',
  cancelled: 'Cancelado',
};
export const PAYOUT_TONE: Record<string, StageTone> = {
  pending: 'warning',
  released: 'success',
  requested: 'info',
  paid: 'neutral',
  cancelled: 'neutral',
};

/** Saque em conferência (resposta incerta do gateway): bloqueia novo saque até o admin resolver. */
export const isUncertainWithdrawal = (w: any): boolean =>
  !!w?.uncertainAt && w?.status !== 'processed' && w?.status !== 'rejected';

export function withdrawalView(w: any): { label: string; tone: StageTone } {
  if (w?.status === 'processed') return { label: 'Pago', tone: 'success' };
  if (w?.status === 'rejected') return { label: 'Recusado', tone: 'danger' };
  if (isUncertainWithdrawal(w)) return { label: 'Em conferência', tone: 'warning' };
  if (w?.status === 'approved') return { label: 'Aprovado', tone: 'info' };
  return { label: 'Pedido', tone: 'info' };
}
