// Política PURA da mensalidade SaaS (modo direto). Sem banco, sem relógio: tudo recebe `now`.
// A loja é cobrada via assinatura Asaas na conta-mãe da DROP (itens B2/B3 do plano).

type Money = number | string | { toString(): string };

export interface BillingLike {
  status: string;
  trialEndsAt: Date;
  paidUntil?: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Valor da mensalidade da loja: o valor especial (inclusive 0 = isenta) ou o padrão da plataforma. */
export function effectiveFee(
  billing: { customFee?: Money | null } | null | undefined,
  config: { saasMonthlyFee: Money },
): number {
  const custom = billing?.customFee;
  if (custom !== null && custom !== undefined) return Number(custom.toString());
  return Number(config.saasMonthlyFee.toString());
}

/** Até quando a loja está coberta: o maior entre o fim do teste e o fim do período pago. */
export function coveredUntil(billing: Pick<BillingLike, 'trialEndsAt' | 'paidUntil'>): Date {
  const trial = billing.trialEndsAt;
  const paid = billing.paidUntil;
  return paid && paid.getTime() > trial.getTime() ? paid : trial;
}

/**
 * A loja deve ser pausada (sumir da vitrine e não receber pedido novo)?
 * - sem linha de cobrança (billing null): NÃO bloqueia. Fail open proposital: a linha é criada
 *   pelo job de assinatura (B2); até lá a loja não pode ser punida por falta de registro.
 * - cancelled: bloqueada.
 * - demais: bloqueada quando now > coveredUntil + graceDays dias.
 */
export function isBillingBlocked(billing: BillingLike | null | undefined, now: Date, graceDays: number): boolean {
  if (!billing) return false;
  if (billing.status === 'cancelled') return true;
  const limit = coveredUntil(billing).getTime() + Math.max(0, graceDays) * DAY_MS;
  return now.getTime() > limit;
}

type BillingWithFee = BillingLike & { customFee?: Money | null };
type BlockConfig = { saasMonthlyFee: Money; saasGraceDays: number };

/**
 * O job deve pausar a loja (ou mantê-la pausada)? Só olha datas e valor, não o status `paused`.
 * Fee efetivo ≤ 0 (padrão 0 ou valor especial 0 = isenta) → NUNCA: sem valor não há fatura
 * para pagar, então a loja não teria como sair da pausa.
 */
export function shouldPause(billing: BillingWithFee | null | undefined, now: Date, config: BlockConfig): boolean {
  if (!billing) return false;
  if (!(effectiveFee(billing, config) > 0)) return false;
  return isBillingBlocked(billing, now, config.saasGraceDays);
}

/**
 * A loja está bloqueada AGORA pela mensalidade (gate de pedido e visões usam esta)?
 * Sem linha → não; cancelled → sempre; fee ≤ 0 → nunca (mesmo `paused`, que o job despausa);
 * demais → já `paused` ou shouldPause (antes de o job, de 1 em 1 h, gravar a pausa).
 */
export function isStoreBlocked(billing: BillingWithFee | null | undefined, now: Date, config: BlockConfig): boolean {
  if (!billing) return false;
  if (billing.status === 'cancelled') return true;
  if (!(effectiveFee(billing, config) > 0)) return false;
  return billing.status === 'paused' || shouldPause(billing, now, config);
}

/** Soma `n` meses de calendário em UTC; se o dia não existe no mês destino, usa o último dia (31/01 + 1 = 28/02). */
function addMonthsClamped(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

/** Novo fim do período pago ao receber a fatura de `dueDate`: max(atual, dueDate + 1 mês). Nunca regride. */
export function nextPaidUntil(current: Date | null | undefined, dueDate: Date): Date {
  const next = addMonthsClamped(dueDate, 1);
  return current && current.getTime() > next.getTime() ? current : next;
}
