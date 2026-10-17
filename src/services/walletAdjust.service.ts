import { AdminMoneyAction, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import walletService from './wallet.prisma.service';
import { AdminMoneyActor, MoneyActionError, recordAdminMoneyAction } from './adminMoneyAction.service';

/**
 * D3b-3 · spec 5 — Ajustar saldo: crédito ou débito auditado (só CEO), idempotente pela chave
 * que o painel gera ao abrir o painel lateral. Saldo, lançamento e linha wallet_adjust numa
 * transação só. A unique de AdminMoneyAction.idempotencyKey é a última palavra em corrida.
 */

export const WALLET_ADJUST_REASON_PREFIX = 'Ajuste da plataforma: ';

export interface WalletAdjustInput {
  direction: 'credit' | 'debit';
  amount: number;
  reason: string;
  idempotencyKey: string;
}

export interface WalletAdjustment {
  actionId: string;
  walletId: string;
  direction: 'credit' | 'debit';
  amount: number;
  reason: string;
  balanceBefore: number;
  balanceAfter: number;
  walletEntryId: string;
  createdAt: string;
}

export interface WalletAdjustResult {
  replayed: boolean;
  adjustment: WalletAdjustment;
}

const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 };

function directionOf(row: AdminMoneyAction, after: Record<string, unknown>): 'credit' | 'debit' {
  if (after.direction === 'credit' || after.direction === 'debit') return after.direction;
  // Nunca presumir: uma linha sem direção não pode virar "crédito" num replay.
  throw new Error(`walletAdjust: linha ${row.id} sem direção gravada`);
}

function fromAction(row: AdminMoneyAction): WalletAdjustment {
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  return {
    actionId: row.id,
    walletId: row.targetId,
    direction: directionOf(row, after),
    amount: Number(row.amount),
    reason: row.reason ?? '',
    balanceBefore: Number(before.balance),
    balanceAfter: Number(after.balance),
    walletEntryId: String(after.walletEntryId ?? ''),
    createdAt: row.createdAt.toISOString(),
  };
}

const toCents = (v: unknown) => Math.round(Number(v) * 100);

/**
 * A mesma chave só pode repetir o MESMO pedido (direção, valor em centavos, motivo). Se vier com
 * outros valores, devolver o ajuste antigo como "já registrado" esconderia que o pedido novo não
 * foi feito: responde 409 IDEMPOTENCY_KEY_REUSED e o saldo não muda. A carteira também entra na
 * comparação: a mesma chave em outra carteira (em sequência ou na corrida decidida pela unique)
 * é 409, nunca "já registrado" para uma carteira que não foi ajustada.
 */
function replayOf(row: AdminMoneyAction, walletId: string, input: WalletAdjustInput): WalletAdjustResult {
  const adjustment = fromAction(row);
  const same = row.targetId === walletId
    && adjustment.direction === input.direction
    && toCents(adjustment.amount) === toCents(input.amount)
    && adjustment.reason === input.reason.trim();
  if (!same) {
    throw new MoneyActionError(
      409,
      'IDEMPOTENCY_KEY_REUSED',
      'Esta chave já foi usada em outro ajuste. Confira o extrato antes de tentar de novo.',
      { actionId: row.id },
    );
  }
  return { replayed: true, adjustment };
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export async function adjustWalletBalance(
  walletId: string,
  actor: AdminMoneyActor,
  input: WalletAdjustInput,
): Promise<WalletAdjustResult | null> {
  // A rota valida a chave como uuid; chave vazia aqui seria erro de programação, nunca "sem chave".
  if (!input.idempotencyKey?.trim()) throw new Error('adjustWalletBalance: chave de idempotência vazia');
  try {
    return await prisma.$transaction(async (tx) => {
      // Trava a carteira: ajustes concorrentes na mesma carteira entram em fila, e a releitura
      // da chave logo abaixo já enxerga o ajuste de quem passou na frente.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;

      const previous = await tx.adminMoneyAction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (previous) return replayOf(previous, walletId, input);
      if (locked.length === 0) return null;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
      const amount = new Prisma.Decimal(input.amount);
      if (input.direction === 'debit' && wallet.balance.lessThan(amount)) {
        throw new MoneyActionError(409, 'INSUFFICIENT_BALANCE', 'Saldo insuficiente para este débito', {
          available: Number(wallet.balance),
        });
      }

      const reference = `ADMIN_ADJUST:${actor.id}:${input.idempotencyKey}`;
      const params = {
        owner: wallet.owner,
        ownerType: wallet.ownerType,
        amount,
        reason: `${WALLET_ADJUST_REASON_PREFIX}${input.reason}`,
        category: 'adjustment' as const,
        reference,
      };
      const updated = input.direction === 'credit'
        ? await walletService.credit(params, tx)
        : await walletService.debit(params, tx);
      const entry = await tx.walletEntry.findFirstOrThrow({ where: { walletId, reference }, orderBy: { createdAt: 'desc' } });

      const row = await recordAdminMoneyAction(tx, {
        actor,
        type: 'wallet_adjust',
        targetType: 'wallet',
        targetId: walletId,
        amount: input.amount,
        reason: input.reason,
        before: { balance: Number(wallet.balance) },
        after: {
          balance: Number(updated.balance),
          direction: input.direction,
          walletEntryId: entry.id,
          owner: wallet.owner,
          ownerType: wallet.ownerType,
        },
        idempotencyKey: input.idempotencyKey,
      });
      return { replayed: false, adjustment: fromAction(row) };
    }, TX_OPTIONS);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Mesma chave ao mesmo tempo sem trava em comum: a unique decidiu e esta transação foi desfeita
    // inteira (saldo e lançamento). Mesma carteira e valores → replay; senão 409 IDEMPOTENCY_KEY_REUSED.
    const winner = await prisma.adminMoneyAction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!winner) throw err;
    return replayOf(winner, walletId, input);
  }
}
