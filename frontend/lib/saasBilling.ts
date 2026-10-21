// Mensalidade SaaS (modo direto): rótulos e formatação num lugar só, reusados pelas telas
// do lojista (/seller/assinatura, banner do painel) e do CEO (/admin/lojas-asaas).

export type SaasBillingStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

/** Rótulo curto (admin). */
export const SAAS_STATUS_LABEL: Record<SaasBillingStatus, string> = {
  trialing: 'Em teste grátis',
  active: 'Em dia',
  past_due: 'Atrasada',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

export function saasStatusLabel(status?: string | null): string {
  if (!status) return 'Sem assinatura';
  return SAAS_STATUS_LABEL[status as SaasBillingStatus] ?? status;
}

/** DD/MM/AAAA a partir de ISO, no fuso de São Paulo; '—' se vazio/inválido. */
export function formatBillingDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

const spDay = (d: Date): number => {
  const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return Date.UTC(y, m - 1, day) / 86400000;
};

/**
 * Dias de calendário (São Paulo) de hoje até o dia do fim do teste, o MESMO dia que
 * formatBillingDate mostra. 0 = último dia; negativo = já encerrou; null = sem data.
 */
export function saasTrialDaysLeft(trialEndsAt?: string | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  return spDay(end) - spDay(now);
}

export function saasTrialLabel(days: number): string {
  if (days < 0) return 'Teste encerrado';
  if (days === 0) return 'Último dia';
  return days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`;
}

export function formatBRL(v?: number | null): string {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;
}

export interface SaasBillingView {
  status: SaasBillingStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  fee: number;
  nextPayment: { dueDate: string; value: number; invoiceUrl: string | null; status: string } | null;
  blocked: boolean;
  /** Sem assinatura com fee > 0: a fatura só sai depois de o dono aprovar o documento. */
  pendingReason?: SaasPendingReason;
  /** Faturas pagas, as 12 mais recentes (D1). */
  payments?: Array<{ id: string; value: number; dueDate: string; paidAt: string | null; invoiceUrl: string | null }>;
  /** A partir de quando a loja é pausada se não pagar (fim do dia, Brasília). D1. */
  blockAt?: string | null;
  /** D3b-2b (P2, nota 5): quando o DROP cancelou a mensalidade. */
  cancelledAt?: string | null;
  /** D3b-2b (P2, nota 5): só na cancelada; o último instante em que a loja vende (formatado em Brasília). */
  sellsUntil?: string | null;
}

export type SaasPendingReason = 'owner_document' | null;

/** Aviso ao lojista quando a fatura ainda não pode ser gerada (link para /verificacao na tela). */
export const SAAS_PENDING_MESSAGE: Record<Exclude<SaasPendingReason, null>, string> = {
  owner_document: 'Para gerar sua fatura, conclua a verificação do seu documento',
};

type CancelFields = Pick<SaasBillingView, 'status' | 'sellsUntil'>;

/** DD/MM no fuso de São Paulo; '' se vazio ou inválido. */
export function formatDayMonth(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

/**
 * Mensalidade cancelada ainda dentro do período (D3b-2b, ruling 8): devolve o `sellsUntil` do servidor (o último
 * instante coberto, a mesma conta do job); fora disso, ou sem o campo, null.
 */
export function saasCancelledSellsUntil(b: CancelFields, now: Date = new Date()): string | null {
  if (b.status !== 'cancelled' || typeof b.sellsUntil !== 'string') return null;
  const t = Date.parse(b.sellsUntil);
  return Number.isFinite(t) && t > now.getTime() ? b.sellsUntil : null;
}

/** Mensalidade cancelada cujo período já acabou: o `sellsUntil` (o "vendeu até"); senão null. */
export function saasCancelledSoldUntil(b: CancelFields, now: Date = new Date()): string | null {
  if (b.status !== 'cancelled' || typeof b.sellsUntil !== 'string') return null;
  const t = Date.parse(b.sellsUntil);
  return Number.isFinite(t) && t <= now.getTime() ? b.sellsUntil : null;
}

/**
 * A mensalidade bloqueia a loja: só pausada. Atrasada ainda não; a cancelada nunca (D3b-2b, onda final): no fim do
 * período o DROP pausa a loja, e quem informa essa pausa é a faixa da pausa pelo DROP.
 */
export function saasStoreBlocked(b: CancelFields): boolean {
  return b.status === 'paused';
}

/** "Mensalidade cancelada · vendeu até DD/MM" (sem a data quando o servidor não mandou). */
export function saasCancelledEndedMessage(b: CancelFields, now: Date = new Date()): string {
  const sold = saasCancelledSoldUntil(b, now);
  return sold ? `Mensalidade cancelada · vendeu até ${formatDayMonth(sold)}` : 'Mensalidade cancelada';
}

/** Frase em linguagem simples para o lojista. */
export function saasStatusMessage(b: Pick<SaasBillingView, 'status' | 'trialEndsAt' | 'paidUntil' | 'sellsUntil'>, now: Date = new Date()): string {
  switch (b.status) {
    case 'trialing': return `Teste grátis até ${formatBillingDate(b.trialEndsAt)}`;
    case 'active': return `Em dia — pago até ${formatBillingDate(b.paidUntil)}`;
    case 'past_due': return 'Pagamento atrasado — pague a fatura para a sua loja não ser pausada';
    case 'paused': return 'Loja pausada — pague para voltar a receber pedidos';
    default: {
      const until = saasCancelledSellsUntil(b, now);
      return until ? `Cancelada · vende até ${formatDayMonth(until)}` : saasCancelledEndedMessage(b, now);
    }
  }
}
