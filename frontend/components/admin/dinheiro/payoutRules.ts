/**
 * Regras de tela dos repasses (D3a). Nada aqui muda regra do servidor: só lê o que ele já devolve
 * (src/controllers/payoutController.ts, src/services/asaas/release.ts, src/services/payout.service.ts).
 */
import { formatMoney } from '../../../lib/money';
import type { StatusTone } from '../StatusTag';
import { serverErrorMessage } from './serverError';

export interface PayoutRecipient {
  id: string;
  name: string;
  type: 'store' | 'motoboy';
  email?: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
}

export interface PayoutOrder {
  id: string;
  total?: number;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
}

export interface Payout {
  _id: string;
  recipientType: 'store' | 'motoboy';
  recipientId: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  createdAt: string;
  releasedAt?: string;
  paidAt?: string;
  gatewayProvider?: string;
  gatewayTransferId?: string;
  blocked?: boolean;
  blockReason?: string;
  recipient?: PayoutRecipient | null;
  order?: PayoutOrder | null;
}

const STATUS: Record<Payout['status'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Aguardando liberação', tone: 'warn' },
  released: { label: 'Liberado', tone: 'info' },
  requested: { label: 'Saque pedido', tone: 'info' },
  paid: { label: 'Pago', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function payoutStatus(p: Payout): { label: string; tone: StatusTone } {
  return STATUS[p.status] ?? { label: String(p.status), tone: 'neutral' };
}

/** Pode entrar no lote: pendente e não bloqueado (o servidor recusa bloqueado e não pendente). */
export function isReadyToRelease(p: Payout): boolean {
  return p.status === 'pending' && !p.blocked;
}

export function recipientName(p: Payout): string {
  return p.recipient?.name || (p.recipientType === 'store' ? 'Loja' : 'Motoboy');
}

/** "8 lojas (R$ 1.231,62) · 4 motoboys (R$ 52,68)" (protótipo, tela 3). */
export function releaseSummary(items: Payout[]): string {
  const part = (type: Payout['recipientType'], one: string, many: string) => {
    const list = items.filter((p) => p.recipientType === type);
    if (!list.length) return null;
    const sum = list.reduce((s, p) => s + Number(p.amount), 0);
    return `${list.length} ${list.length === 1 ? one : many} (${formatMoney(sum)})`;
  };
  return [part('store', 'loja', 'lojas'), part('motoboy', 'motoboy', 'motoboys')].filter(Boolean).join(' · ');
}

const ALREADY_RELEASED = /\(status atual: (released|requested|paid)\)/;

/**
 * "Já feito" do lote de liberação. A rota não tem 409 nem código: o único sinal exato é o texto do serviço,
 * "Payout não está pendente (status atual: <status>)", que hoje só chega em 502 (Asaas,
 * releaseSinglePayoutViaAsaas); o 400 é aceito por segurança (o catch geral da rota devolve 400). Só released,
 * requested e paid contam; cancelled e o texto sem status (modo legado) são erro, e o "Tentar de novo"
 * da tela relê a lista antes de reenviar.
 */
export function isPayoutAlreadyReleased(err: unknown): boolean {
  const status = (err as { response?: { status?: number } } | null)?.response?.status;
  if (status !== 400 && status !== 502) return false;
  return ALREADY_RELEASED.test(serverErrorMessage(err, ''));
}
