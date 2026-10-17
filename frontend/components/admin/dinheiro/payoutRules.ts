/**
 * Regras de tela dos repasses (D3a; D3b-3). Nada aqui muda regra do servidor: só lê o que ele devolve
 * (src/controllers/payoutController.ts, src/services/payoutRelease.service.ts, src/services/payout.service.ts).
 */
import { formatMoney } from '../../../lib/money';
import { isConflictWithCode } from '../../../lib/adminErrors';
import type { StatusTone } from '../StatusTag';
import { PAYOUT_DONE_STATUSES } from './moneyErrors';

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
  /** releasing (D3b-3): reivindicado, transferência em voo; só sai pelo "Resolver" ou pela baixa do servidor. */
  status: 'pending' | 'releasing' | 'released' | 'requested' | 'paid' | 'cancelled';
  createdAt: string;
  updatedAt?: string;
  releasedAt?: string;
  paidAt?: string;
  gatewayProvider?: string;
  gatewayTransferId?: string;
  blocked?: boolean;
  blockReason?: string;
  uncertainAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  recipient?: PayoutRecipient | null;
  order?: PayoutOrder | null;
}

/** Repasse em liberação sem marca de incerto só é resolvível depois disso (mesma regra da P1.4, por updatedAt). */
export const PAYOUT_STALE_RELEASING_MS = 10 * 60 * 1000;
/** Motivo do bloqueio (decisão E4): de 3 a 500 caracteres. */
export const BLOCK_REASON_MIN = 3;
export const BLOCK_REASON_MAX = 500;

/** releasing com uncertainAt, ou parado em liberação há mais de 10 min: aparece em "Incertos" e tem "Resolver". */
export function isPayoutResolvable(p: Payout, now = Date.now()): boolean {
  if (p.status !== 'releasing') return false;
  if (p.uncertainAt) return true;
  const at = p.updatedAt ? new Date(p.updatedAt).getTime() : NaN;
  return Number.isFinite(at) && now - at > PAYOUT_STALE_RELEASING_MS;
}

const STATUS: Record<Payout['status'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Aguardando liberação', tone: 'warn' },
  releasing: { label: 'Em liberação', tone: 'info' },
  released: { label: 'Liberado', tone: 'info' },
  requested: { label: 'Saque pedido', tone: 'info' },
  paid: { label: 'Pago', tone: 'ok' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
};

export function payoutStatus(p: Payout, now = Date.now()): { label: string; tone: StatusTone } {
  if (p.status === 'releasing') {
    if (p.uncertainAt) return { label: 'Incerto — conferir no painel Asaas', tone: 'bad' };
    if (isPayoutResolvable(p, now)) return { label: 'Parado em liberação — conferir no painel Asaas', tone: 'bad' };
  }
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

/**
 * "Já feito" do lote de liberação (spec 4.1, D3b-3): só o 409 PAYOUT_NOT_PENDING com currentStatus
 * released|requested|paid e não bloqueado. releasing (em andamento), bloqueado, cancelado, qualquer outro código
 * e o texto antigo "(status atual: …)" são erro; o "Tentar de novo" da tela relê a lista antes de reenviar.
 */
export function isPayoutAlreadyReleased(err: unknown): boolean {
  if (!isConflictWithCode(err, 'PAYOUT_NOT_PENDING')) return false;
  const d = (err as { response?: { data?: { currentStatus?: unknown; blocked?: unknown } } }).response?.data;
  return d?.blocked !== true && typeof d?.currentStatus === 'string' && PAYOUT_DONE_STATUSES.includes(d.currentStatus);
}

/** Id sintético que o "Resolver" grava quando ninguém informou o nº do Asaas (payoutRelease.service.ts). */
export function isManualResolveId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('manual_resolve_');
}
