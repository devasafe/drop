import type { Response } from 'express';
import { Prisma, AdminMoneyAction, AdminMoneyActionType } from '@prisma/client';
import { teamRolesOf } from '../controllers/rolePermissionsController';

/**
 * D3b-3 · registro único das ações de dinheiro do admin (spec 3.1).
 *
 * Regra: a linha é gravada NA MESMA transação Prisma da mudança local da ação. Ação local sem
 * linha não pode existir; linha sem ação também não (o rollback leva as duas). Quando a ação
 * tem etapa externa (Asaas), a linha vai na transação da baixa final (sucesso ou incerto);
 * recusa definitiva não grava (nada mudou). Ação automática (sem pessoa) não grava.
 *
 * Este é o ÚNICO lugar que cria AdminMoneyAction. Controllers e serviços chamam
 * recordAdminMoneyAction(tx, input) com o `tx` da própria transação.
 */

export { AdminMoneyActionType };

export const ADMIN_MONEY_TARGET_TYPES = [
  'payout',
  'withdrawal_request',
  'cashbox_withdrawal',
  'cashbox',
  'wallet',
  'plan_commission',
  'motoboy_transfer',
  'direct_refund',
  'verification',
  // D3b-1: cancelamento com estorno feito pelo admin (alvo = o pedido).
  'order',
] as const;
export type AdminMoneyTargetType = (typeof ADMIN_MONEY_TARGET_TYPES)[number];

export interface AdminMoneyActor {
  id: string;
  role: string;
}

export interface AdminMoneyActionInput {
  actor: AdminMoneyActor;
  type: AdminMoneyActionType;
  targetType: AdminMoneyTargetType;
  targetId: string;
  amount?: number | Prisma.Decimal | null;
  reason?: string | null;
  before?: Prisma.InputJsonObject | null;
  after?: Prisma.InputJsonObject | null;
  idempotencyKey?: string | null;
}

export async function recordAdminMoneyAction(
  tx: Prisma.TransactionClient,
  input: AdminMoneyActionInput,
): Promise<AdminMoneyAction> {
  const actorId = String(input.actor?.id ?? '').trim();
  if (!actorId) throw new Error('recordAdminMoneyAction: ação de dinheiro sem autor (actor.id vazio)');
  const targetId = String(input.targetId ?? '').trim();
  if (!targetId) throw new Error('recordAdminMoneyAction: ação de dinheiro sem alvo (targetId vazio)');

  let amount: number | null = null;
  if (input.amount != null) {
    const n = Number(input.amount);
    if (!Number.isFinite(n)) throw new Error('recordAdminMoneyAction: valor inválido');
    amount = Math.round(n * 100) / 100;
  }
  const reason = input.reason == null ? null : String(input.reason).trim().slice(0, 500) || null;

  return tx.adminMoneyAction.create({
    data: {
      actorId,
      actorRole: String(input.actor.role ?? '').trim() || 'desconhecido',
      type: input.type,
      targetType: input.targetType,
      targetId,
      amount,
      reason,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
}

/** Autor da ação a partir do req autenticado (papel ativo primeiro). */
export function actorFromRequest(req: { user?: any }): AdminMoneyActor {
  const id = String(req?.user?.id ?? '').trim();
  if (!id) throw new Error('actorFromRequest: requisição sem autor autenticado');
  const active = String(req.user.activeRole || req.user.role || '');
  // Papel de equipe é acréscimo: quem age com papel ativo de cliente aparece pelo papel de equipe.
  const team = active === 'ceo' ? [] : teamRolesOf(req.user);
  return { id, role: team[0] ?? active };
}

/**
 * Erro de ação de dinheiro: status HTTP + code exato da spec + campos extras do corpo
 * (currentStatus, blocked, plans…). Corpo: { error, code, ...details }.
 */
export class MoneyActionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'MoneyActionError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function moneyActionErrorBody(err: MoneyActionError): { error: string; code: string } & Record<string, unknown> {
  return { error: err.message, code: err.code, ...err.details };
}

export function sendMoneyActionError(res: Response, err: unknown): boolean {
  if (!(err instanceof MoneyActionError)) return false;
  res.status(err.status).json(moneyActionErrorBody(err));
  return true;
}
