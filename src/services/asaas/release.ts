import asaasClient from './client';
import logger from '../../config/logger';
import { Payout } from '@prisma/client';

import userRepository from '../../repositories/user.repository';
import payoutService from '../payout.service';
import { ensureStoreSubaccount, ensureMotoboySubaccount } from './subaccount';
import { prisma } from '../../lib/prisma';
import { emitAdminNotification } from '../../utils/socketEmitter';
import { AdminMoneyActor, recordAdminMoneyAction } from '../adminMoneyAction.service';

/**
 * Liberação de repasse via Asaas (custódia): transfere da conta-mãe para a subconta do
 * recebedor (Store.asaas.walletId / User.asaas.walletId).
 *
 * D3b-3 (spec 4.1): toda liberação REIVINDICA o repasse antes de chamar o Asaas
 * (pending → releasing, condicional). Quem não consegue a transição não transfere — a
 * liberação do admin e a automática da entrega nunca transferem o mesmo repasse duas vezes.
 * Resposta do Asaas classificada como nos saques (payoutGateway/asaasGateway.ts):
 *  - sent: baixa released na mesma transação;
 *  - refused (nada saiu): volta a pending;
 *  - uncertain (pode ter saído): fica releasing + uncertainAt e o admin resolve.
 */

interface AsaasTransfer {
  id: string;
  status: string;
}

type TransferablePayout = Pick<Payout, 'id' | 'orderId' | 'recipientType' | 'recipientId' | 'amount'>;

export type PayoutTransferOutcome =
  | { kind: 'sent'; transferId: string }
  | { kind: 'refused'; message: string }
  | { kind: 'uncertain'; message: string };

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

async function resolveWalletId(payout: TransferablePayout): Promise<string | null> {
  const id = String(payout.recipientId);
  if (payout.recipientType === 'store') {
    let store = await prisma.store.findUnique({ where: { id: String(id) } }) as any;
    // Auto-cura: se a subconta não tem walletId (criação parcial / nunca criada),
    // tenta criar/recuperar agora. Só consegue se a loja já tiver PIX + endereço.
    if (!store?.asaas?.walletId) {
      await ensureStoreSubaccount(id);
      store = await prisma.store.findUnique({ where: { id: String(id) } }) as any;
    }
    return store?.asaas?.walletId || null;
  }
  let user = await userRepository.findById(String(id)) as any;
  if (!user?.asaas?.walletId) {
    await ensureMotoboySubaccount(id);
    user = await userRepository.findById(String(id)) as any;
  }
  return user?.asaas?.walletId || null;
}

/**
 * Chama o Asaas para UM repasse já reivindicado. Não mexe no banco.
 * Só um 4xx do Asaas (exceto 408) ou um erro antes da chamada garante que nada saiu.
 */
export async function sendPayoutTransfer(payout: TransferablePayout): Promise<PayoutTransferOutcome> {
  let walletId: string | null;
  try {
    walletId = await resolveWalletId(payout);
  } catch (err: any) {
    return { kind: 'refused', message: `Não foi possível preparar a subconta do recebedor: ${String(err?.message || err).slice(0, 200)}` };
  }
  if (!walletId) return { kind: 'refused', message: 'Recebedor sem subconta Asaas configurada' };

  try {
    const transfer = await asaasClient.post<AsaasTransfer>('/transfers', {
      value: Number(Number(payout.amount).toFixed(2)),
      walletId,
    });
    if (!transfer?.id) return { kind: 'uncertain', message: 'Asaas respondeu sem o id da transferência' };
    return { kind: 'sent', transferId: transfer.id };
  } catch (err: any) {
    const message = String(err?.message || 'sem resposta do Asaas').slice(0, 300);
    if (err?.name === 'AsaasNotConfiguredError') return { kind: 'refused', message };
    const definite = err?.name === 'AsaasApiError' && typeof err.status === 'number'
      && err.status >= 400 && err.status < 500 && err.status !== 408;
    return definite ? { kind: 'refused', message } : { kind: 'uncertain', message };
  }
}

/**
 * Marca o repasse como incerto (uncertainAt, id da transferência se houver) e, quando há pessoa
 * (liberação do admin), grava a linha payout_release na MESMA transação. A marca pode falhar
 * (banco fora): o alerta ao admin sai mesmo assim e a falha é registrada — nunca silencioso.
 * Sem a marca, o repasse fica em releasing e o "Resolver" vale depois de 10 minutos.
 */
export async function flagPayoutReleaseUncertain(
  payout: Pick<Payout, 'id' | 'orderId' | 'amount'>,
  reason: string,
  gatewayTransferId: string | null,
  actor: AdminMoneyActor | null,
): Promise<boolean> {
  let marked = false;
  try {
    marked = await prisma.$transaction(async (tx) => {
      const ok = await payoutService.markReleaseUncertain(tx, payout.id, gatewayTransferId);
      if (ok && actor) {
        await recordAdminMoneyAction(tx, {
          actor,
          type: 'payout_release',
          targetType: 'payout',
          targetId: payout.id,
          amount: payout.amount,
          before: { status: 'pending' },
          after: { status: 'releasing', uncertain: true, gatewayTransferId, reason: reason.slice(0, 300) },
        });
      }
      return ok;
    });
  } catch (err) {
    logger.error('[repasse] falha ao gravar a marca de incerteza', err as Error, { payoutId: payout.id });
  }
  logger.warn('[repasse] liberação com resposta incerta', { payoutId: payout.id, orderId: String(payout.orderId), marked, reason });
  emitAdminNotification({
    title: 'Repasse com resposta incerta ⚠️',
    body: marked
      ? `O repasse de ${brl(Number(payout.amount))} (pedido ${payout.orderId}) pode ter saído. Confira no painel do Asaas e use "Resolver".`
      : `O repasse de ${brl(Number(payout.amount))} (pedido ${payout.orderId}) pode ter saído e a marca de incerteza NÃO foi gravada. Confira no painel do Asaas; "Resolver" libera em 10 minutos.`,
    url: '/admin/payouts',
    tag: 'payout',
  });
  return marked;
}

/** Liberação automática de UM repasse (sem pessoa: não grava linha de registro). */
async function releaseOneAutomatically(payout: Payout): Promise<boolean> {
  if (!(await payoutService.claimPayoutForRelease(payout.id))) return false; // outra liberação pegou
  const outcome = await sendPayoutTransfer(payout);
  if (outcome.kind === 'refused') {
    await payoutService.unclaimRelease(payout.id);
    logger.warn('Liberação adiada — transferência recusada; Payout segue pending', {
      orderId: String(payout.orderId), payoutId: payout.id, recipientType: payout.recipientType, reason: outcome.message,
    });
    return false;
  }
  if (outcome.kind === 'uncertain') {
    await flagPayoutReleaseUncertain(payout, outcome.message, null, null);
    return false;
  }
  try {
    await prisma.$transaction((tx) =>
      payoutService.settleClaimedRelease(tx, payout.id, { gatewayProvider: 'asaas', gatewayTransferId: outcome.transferId }),
    );
  } catch (err: any) {
    await flagPayoutReleaseUncertain(payout, `transferência ${outcome.transferId} aceita, baixa local falhou: ${err?.message || err}`, outcome.transferId, null);
    return false;
  }
  logger.info('Payout liberado via Asaas', {
    orderId: String(payout.orderId), payoutId: payout.id, recipientType: payout.recipientType, transferId: outcome.transferId,
  });
  return true;
}

/**
 * Liberação automática do PEDIDO inteiro (loja + motoboy) — fluxo ao finalizar a entrega com
 * autoApprovePayouts. A re-liberação do admin (`POST /admin/asaas/release-order/:orderId`) NÃO
 * passa por aqui: é uma pessoa, usa releasePayoutAsAdmin (grava a linha payout_release).
 * Nunca relança: a entrega não pode quebrar; o que não saiu fica pending (ou incerto) para o admin.
 */
export async function releaseOrderViaAsaas(orderId: string): Promise<void> {
  const payouts = await prisma.payout.findMany({
    where: { orderId, status: 'pending', blocked: false },
  });
  for (const payout of payouts) {
    try {
      await releaseOneAutomatically(payout);
    } catch (err) {
      logger.error('Falha inesperada na liberação automática do Payout', err as Error, { orderId, payoutId: payout.id });
    }
  }
}

export default { releaseOrderViaAsaas, sendPayoutTransfer, flagPayoutReleaseUncertain };
