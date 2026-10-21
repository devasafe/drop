import { prisma } from '../../lib/prisma';
import { notifyUser } from '../storeNotify';
import { brl } from '../adminOps/common';
import { recordAccountAction, AccountActor } from './actions';
import { AccountActionError, parseRequiredReason, userNotFound } from './errors';

/** Onde o cliente vê a pendência: o sino e o push levam para lá. */
export const DEBT_NOTICE_LINK = '/conta/carteira';

export interface ForgivenDebt {
  id: string;
  status: 'forgiven';
  amount: number;
  forgivenAt: string;
}

/**
 * D3b-2a · perdoar a dívida do cliente (spec 5.3): a loja abre mão da multa e nenhum dinheiro se
 * move (carteira, caixa e loja ficam como estão). Só perdoa o que AINDA está `pending`: a escrita
 * é condicional, e a cobrança no próximo pedido também (claimPendingDebt), então só uma vence.
 */
export async function forgiveDebt(
  userId: string,
  debtId: string,
  actor: AccountActor,
  rawReason: unknown,
): Promise<{ debt: ForgivenDebt }> {
  // Ruling de 21/10: ninguém perdoa a própria dívida, nem com a permissão.
  if (String(actor.id) === String(userId)) {
    throw new AccountActionError(403, 'SELF_ACTION_FORBIDDEN', 'Você não pode perdoar a própria dívida.');
  }
  const reason = parseRequiredReason(rawReason);
  const forgivenAt = new Date();

  const debt = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw userNotFound();
    const found = await tx.customerDebt.findUnique({ where: { id: debtId } });
    // Dívida de outra pessoa = não encontrada (não confirma que o id existe).
    if (!found || found.customerId !== userId) {
      throw new AccountActionError(404, 'DEBT_NOT_FOUND', 'Dívida não encontrada.');
    }
    const { count } = await tx.customerDebt.updateMany({
      where: { id: debtId, customerId: userId, status: 'pending' },
      data: { status: 'forgiven', forgivenAt, forgivenBy: actor.id },
    });
    if (count === 0) {
      throw new AccountActionError(409, 'DEBT_NOT_PENDING', 'Esta dívida não está mais pendente: já foi cobrada ou perdoada.');
    }
    const amount = Number(found.amount);
    await recordAccountAction(tx, {
      actor, userId, type: 'debt_forgive', reason,
      meta: { debtId, amount, sourceOrderId: found.sourceOrderId },
    });
    return { id: found.id, status: 'forgiven' as const, amount, forgivenAt: forgivenAt.toISOString() };
  });

  // Depois do commit e best-effort (notifyUser nunca lança).
  await notifyUser(userId, {
    title: 'Pendência perdoada',
    message: `Sua pendência de ${brl(debt.amount)} foi perdoada.`,
    link: DEBT_NOTICE_LINK,
    entityId: debt.id,
    tag: 'pendencia-perdoada',
  });
  return { debt };
}
