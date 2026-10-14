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
}

export type SaasPendingReason = 'owner_document' | null;

/** Aviso ao lojista quando a fatura ainda não pode ser gerada (link para /verificacao na tela). */
export const SAAS_PENDING_MESSAGE: Record<Exclude<SaasPendingReason, null>, string> = {
  owner_document: 'Para gerar sua fatura, conclua a verificação do seu documento',
};

/** Frase em linguagem simples para o lojista. */
export function saasStatusMessage(b: Pick<SaasBillingView, 'status' | 'trialEndsAt' | 'paidUntil'>): string {
  switch (b.status) {
    case 'trialing': return `Teste grátis até ${formatBillingDate(b.trialEndsAt)}`;
    case 'active': return `Em dia — pago até ${formatBillingDate(b.paidUntil)}`;
    case 'past_due': return 'Pagamento atrasado — pague a fatura para a sua loja não ser pausada';
    case 'paused': return 'Loja pausada — pague para voltar a receber pedidos';
    default: return 'Assinatura cancelada';
  }
}
