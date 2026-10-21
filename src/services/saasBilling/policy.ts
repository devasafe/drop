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

// Brasília = UTC-3 FIXO: o Brasil não tem horário de verão desde 2019 (Decreto 9.772/2019).
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

/** paidUntil vem do Asaas como DATA ('YYYY-MM-DD' gravada em 00:00Z): o dia em UTC vale inteiro -> D+1 03:00Z. */
function paidEndMs(paidUntil: Date): number {
  return Math.floor(paidUntil.getTime() / DAY_MS) * DAY_MS + DAY_MS + SAO_PAULO_OFFSET_MS;
}

/** trialEndsAt é um instante (now + dias de teste): vale até o fim do dia dele em Brasília -> D+1 03:00Z. */
function trialEndMs(trialEndsAt: Date): number {
  return Math.floor((trialEndsAt.getTime() - SAO_PAULO_OFFSET_MS) / DAY_MS) * DAY_MS + DAY_MS + SAO_PAULO_OFFSET_MS;
}

/**
 * Instante em que termina a cobertura: o maior entre o fim do dia pago e o fim do dia do teste.
 * Ex.: coberto até 10/12 (00:00Z) -> 11/12 03:00Z.
 * D3b-2b: exportado (a cancelada vende até aqui; o job pausa a loja pelo DROP a partir daqui) e
 * calculado como o máximo dos dois fins de dia. A conta anterior (maior data, depois o fuso) só
 * diferia quando paidUntil caía nas 3 h antes de trialEndsAt, e só para menos.
 */
export function coverageEnd(billing: Pick<BillingLike, 'trialEndsAt' | 'paidUntil'>): Date {
  const trial = trialEndMs(billing.trialEndsAt);
  return new Date(billing.paidUntil ? Math.max(trial, paidEndMs(billing.paidUntil)) : trial);
}

/** D3b-2b: último instante em que a loja (cancelada) vende: coverageEnd - 1 ms. O dia dele em Brasília é o "vende até". */
export function sellsUntil(billing: Pick<BillingLike, 'trialEndsAt' | 'paidUntil'>): Date {
  return new Date(coverageEnd(billing).getTime() - 1);
}

/**
 * D3b-2b (ruling 8): a cobertura da mensalidade cancelada acabou (now >= coverageEnd)?
 * Sem tolerância: a carência (saasGraceDays) é de quem ainda vai pagar, e a cancelada não paga mais.
 * NÃO é bloqueio: é o gatilho do passo 0 do job (runCancelledSaasPauses), que pausa a loja pelo DROP.
 * A pausa é o único bloqueio da cancelada, e só o admin a libera (ruling do controlador, spec 9).
 */
export function isCancelledAndExpired(billing: BillingLike | null | undefined, now: Date): boolean {
  return !!billing && billing.status === 'cancelled' && now.getTime() >= coverageEnd(billing).getTime();
}

/**
 * A loja deve ser pausada (sumir da vitrine e não receber pedido novo)?
 * - sem linha de cobrança (billing null): NÃO bloqueia. Fail open proposital: a linha é criada
 *   pelo job de assinatura (B2); até lá a loja não pode ser punida por falta de registro.
 * - cancelled: nunca. No fim da cobertura o job pausa a loja pelo DROP (isCancelledAndExpired), e
 *   essa pausa é o único bloqueio dela: quando o admin libera, a loja volta a vender (D3b-2b).
 * - demais: bloqueada quando now > fim do dia (Brasília) da cobertura + graceDays dias.
 *   Ex.: coberto até 10/12 (00:00Z), tolerância 0 -> bloqueia só depois de 11/12 03:00Z.
 */
export function isBillingBlocked(billing: BillingLike | null | undefined, now: Date, graceDays: number): boolean {
  if (!billing) return false;
  if (billing.status === 'cancelled') return false;
  const limit = coverageEnd(billing).getTime() + Math.max(0, graceDays) * DAY_MS;
  return now.getTime() > limit;
}

type BillingWithFee = BillingLike & { customFee?: Money | null; asaasSubscriptionId?: string | null };
type BlockConfig = { saasMonthlyFee: Money; saasGraceDays: number };

/**
 * O job deve pausar a loja (ou mantê-la pausada)? Só olha datas, valor e assinatura, não o status `paused`.
 * Fee efetivo ≤ 0 (padrão 0 ou valor especial 0 = isenta) → NUNCA: sem valor não há fatura
 * para pagar, então a loja não teria como sair da pausa.
 * Sem assinatura (dono sem documento aprovado / sem CPF/CNPJ válido) → NUNCA, pelo mesmo motivo:
 * não há fatura. Não abre brecha: no modo direto, loja cujo dono não tem documento aprovado já
 * fica fora da vitrine pelo KYC da loja (A1). A tela do lojista mostra pendingReason 'owner_document'.
 */
export function shouldPause(billing: BillingWithFee | null | undefined, now: Date, config: BlockConfig): boolean {
  if (!billing) return false;
  if (!(effectiveFee(billing, config) > 0)) return false;
  if (!billing.asaasSubscriptionId) return false;
  return isBillingBlocked(billing, now, config.saasGraceDays);
}

/**
 * Quando a loja SERÁ pausada pela mensalidade: o instante após o qual `isBillingBlocked`
 * vira true (fim do dia em Brasília da cobertura + graceDays). Mostrado na tela "atrasada".
 * null quando ela nunca será pausada por data: sem linha, `cancelled` (a data dela é a de
 * sellsUntil, que a tela do lojista recebe à parte), fee ≤ 0 (isenta) ou sem assinatura (sem fatura) — as mesmas
 * condições de `shouldPause`.
 */
export function billingBlockAt(billing: BillingWithFee | null | undefined, config: BlockConfig): Date | null {
  if (!billing) return null;
  if (billing.status === 'cancelled') return null;
  if (!(effectiveFee(billing, config) > 0)) return null;
  if (!billing.asaasSubscriptionId) return null;
  return new Date(coverageEnd(billing).getTime() + Math.max(0, config.saasGraceDays) * DAY_MS);
}

/**
 * A loja está bloqueada AGORA pela mensalidade (gate de pedido e visões usam esta)?
 * Sem linha → não; cancelled → nunca (o bloqueio dela é a pausa do DROP, ver isBillingBlocked); fee ≤ 0 → nunca (mesmo `paused`, que o job despausa);
 * demais → já `paused` ou shouldPause (que exige assinatura) (antes de o job, de 1 em 1 h, gravar a pausa).
 */
export function isStoreBlocked(billing: BillingWithFee | null | undefined, now: Date, config: BlockConfig): boolean {
  if (!billing) return false;
  if (billing.status === 'cancelled') return false;
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
