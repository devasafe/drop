import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/**
 * Exclusão de conta pelo próprio usuário (Google Play e Apple 5.1.1(v); LGPD art. 18, VI).
 *
 * Não apaga a linha do User: pedidos, notas e transações referenciam a conta e ficam
 * guardados 5 anos por lei. Os dados pessoais saem (anonimização) e a conta não entra mais.
 */

const OPEN_ORDER_STATUSES = ['criado', 'pago', 'aguardando_motoboy', 'enviado'] as const;
const OPEN_DELIVERY_STATUSES = ['assigned', 'picked'] as const;
const OPEN_RETURN_STATUSES = ['aguardando_loja', 'aprovado', 'aguardando_pagamento', 'devolvendo'] as const;
const OPEN_PAYOUT_STATUSES = ['pending', 'releasing', 'released', 'requested'] as const;
const OPEN_TRANSFER_STATUSES = ['pending', 'failed'];

/** Domínio dos e-mails de contas excluídas: único por conta e nunca entregável. */
export const DELETED_EMAIL_DOMAIN = 'excluida.dropapp.com.br';

export interface DeletionBlocker {
  code: string;
  message: string;
}

/** O que precisa terminar antes de a conta poder sair. Lista vazia = pode excluir. */
export async function getDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const stores = await prisma.store.findMany({ where: { ownerId: userId }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const owners = [userId, ...storeIds];

  const [
    customerOrders, storeOrders, returns, debts, wallets, topups,
    rides, withdrawals, payouts, transfers,
  ] = await Promise.all([
    prisma.order.count({ where: { customerId: userId, status: { in: [...OPEN_ORDER_STATUSES] } } }),
    storeIds.length ? prisma.order.count({ where: { storeId: { in: storeIds }, status: { in: [...OPEN_ORDER_STATUSES] } } }) : 0,
    prisma.returnRequest.count({
      where: { OR: [{ customerId: userId }, { storeId: { in: storeIds } }], status: { in: [...OPEN_RETURN_STATUSES] } },
    }),
    prisma.customerDebt.count({ where: { customerId: userId, status: 'pending' } }),
    prisma.wallet.findMany({
      where: { owner: { in: owners } },
      select: { balance: true, pendingBalance: true, blockedBalance: true },
    }),
    prisma.walletTopup.count({ where: { userId, status: 'pending' } }),
    prisma.delivery.count({ where: { motoboyId: userId, status: { in: [...OPEN_DELIVERY_STATUSES] } } }),
    prisma.withdrawalRequest.count({ where: { motoboyId: userId, status: { in: ['pending', 'approved'] } } }),
    prisma.payout.count({ where: { recipientId: { in: owners }, status: { in: [...OPEN_PAYOUT_STATUSES] } } }),
    prisma.motoboyTransfer.count({
      where: { OR: [{ motoboyId: userId }, { storeId: { in: storeIds } }], status: { in: OPEN_TRANSFER_STATUSES } },
    }),
  ]);

  const blockers: DeletionBlocker[] = [];
  if (customerOrders > 0) blockers.push({ code: 'OPEN_ORDER', message: 'Você tem um pedido em andamento.' });
  if (storeOrders > 0) blockers.push({ code: 'STORE_OPEN_ORDER', message: 'Sua loja tem pedidos em andamento.' });
  if (returns > 0) blockers.push({ code: 'OPEN_RETURN', message: 'Há um reembolso ou devolução em andamento.' });
  if (debts > 0) blockers.push({ code: 'PENDING_DEBT', message: 'Há uma taxa pendente para pagar.' });
  const hasMoney = wallets.some((w) => Number(w.balance) > 0 || Number(w.pendingBalance) > 0 || Number(w.blockedBalance) > 0);
  if (hasMoney) blockers.push({ code: 'WALLET_BALANCE', message: 'Ainda há saldo na carteira. Saque antes de excluir.' });
  if (topups > 0) blockers.push({ code: 'PENDING_TOPUP', message: 'Há uma recarga esperando pagamento.' });
  if (rides > 0) blockers.push({ code: 'OPEN_RIDE', message: 'Você tem uma entrega em andamento.' });
  if (withdrawals > 0) blockers.push({ code: 'PENDING_WITHDRAWAL', message: 'Há um saque em processamento.' });
  if (payouts > 0 || transfers > 0) {
    blockers.push({ code: 'OPEN_PAYOUT', message: 'Há repasses ainda não pagos. Fale com o suporte.' });
  }
  return blockers;
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string; blockers?: DeletionBlocker[] };

/** Confere a senha, os bloqueios e anonimiza a conta numa transação. */
export async function deleteAccount(userId: string, password: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, status: true } });
  if (!user || (user.status as string) === 'deleted') {
    return { ok: false, status: 404, error: 'NOT_FOUND', message: 'Conta não encontrada.' };
  }
  if (!password || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return { ok: false, status: 401, error: 'WRONG_PASSWORD', message: 'Senha incorreta.' };
  }
  const blockers = await getDeletionBlockers(userId);
  if (blockers.length) {
    return { ok: false, status: 409, error: 'DELETION_BLOCKED', message: blockers[0].message, blockers };
  }

  const now = new Date();
  // Hash de uma senha aleatória descartada: nenhuma senha volta a bater.
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Conta excluída',
        email: `${userId}@${DELETED_EMAIL_DOMAIN}`,
        passwordHash: unusableHash,
        telefone: null, cpf: null, rg: null, dataNascimento: null, sexo: null, photo: null,
        bankInfoEncrypted: null, bankInfo: null as any, verification: null as any, asaas: null as any,
        currentLocation: null as any, isOnline: false, permissions: [],
        status: 'deleted' as any, deletedAt: now,
      },
    });
    await tx.address.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.otpCode.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    // Loja sai da vitrine e não recebe pedido novo; CNPJ e dados fiscais ficam (obrigação legal).
    await tx.store.updateMany({
      where: { ownerId: userId },
      data: {
        isOpen: false, showInMarketplace: false,
        adminPausedAt: now, adminPausedBy: userId, adminPauseReason: 'Conta excluída pelo dono',
      },
    });
  });
  return { ok: true };
}
