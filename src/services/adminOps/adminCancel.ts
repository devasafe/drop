/**
 * D3b-1 · P2.2/P2.3 — cancelar com estorno pelo admin, com culpa (spec 4.2).
 * A prévia só lê e usa as fórmulas das regras de cada ator (P2.1). O cancelamento chama a regra
 * do ator da culpa; a única regra nova de dinheiro é a compensação paga pelo DROP (platform).
 */
import { prisma } from '../../lib/prisma';
import { toApiOrder, orderInclude } from '../../repositories/order.repository';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { calculateCancellationFee } from '../../utils/cancellationFee';
import { isDirectOrder } from '../../utils/settlement';
import { directCustomerRefund } from '../asaasLoja/directCancellation';
import { AdminMoneyActor, MoneyActionError, recordAdminMoneyAction } from '../adminMoneyAction.service';
import { cancelFeeConfigOf, CancelFeeConfig } from '../cancellation/feeConfig';
import { motoboyOnTheWay, round2 } from '../cancellation/shared';
import { storeFeeDecision, storeFeeFigures, storeDirectMotoboyShare } from '../cancellation/storeRule';
import { ADMIN_CANCELLABLE_STATUSES, AdminCancelActor } from '../cancellation/types';
import type { CancelFault, CancelPreview, CancelResult } from './types';
import type { Cancellation } from '@prisma/client';
import logger from '../../config/logger';
import { recordCashboxEntry } from '../../repositories/appCashbox.repository';
import { emitAdminNotification, emitAdminOrderChanged } from '../../utils/socketEmitter';
import walletService from '../wallet.prisma.service';
import { notifyStore, notifyUser, STORE_LINKS } from '../storeNotify';
import { cancelOrderAsCustomerRule } from '../cancellation/customerRule';
import { cancelOrderAsStoreRule } from '../cancellation/storeRule';
import { cancelOrderWithFullRefund } from '../cancellation/fullRefund';
import { normalizeAdminReason } from './adminReason';

export const CANCEL_FAULTS: readonly CancelFault[] = ['customer', 'store', 'motoboy', 'platform'];

export function isCancelFault(v: unknown): v is CancelFault {
  return typeof v === 'string' && (CANCEL_FAULTS as readonly string[]).includes(v);
}

export interface CancelTargetDelivery {
  id: string;
  status: string;
  motoboyId: string | null;
  statusDevolucao: string | null;
}

/** Pedido (forma de API) e entrega, lidos do mesmo jeito pela prévia e pelo cancelamento. */
export async function loadCancelTarget(orderId: string): Promise<{ order: any; delivery: CancelTargetDelivery | null }> {
  const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(orderId) }, include: orderInclude }));
  if (!order) throw new MoneyActionError(404, 'ORDER_NOT_FOUND', 'Pedido não encontrado');
  const delivery = order.deliveryId
    ? await prisma.delivery.findUnique({
      where: { id: String(order.deliveryId) },
      select: { id: true, status: true, motoboyId: true, statusDevolucao: true },
    })
    : null;
  return { order, delivery: delivery as CancelTargetDelivery | null };
}

/** Recusas comuns da prévia e do cancelamento (409 ORDER_NOT_CANCELLABLE). */
export function assertAdminCancellable(order: any, delivery: CancelTargetDelivery | null): void {
  if (!ADMIN_CANCELLABLE_STATUSES.includes(order.status)) {
    throw new MoneyActionError(409, 'ORDER_NOT_CANCELLABLE', 'Este pedido não pode mais ser cancelado.', { currentStatus: order.status });
  }
  if (delivery?.statusDevolucao === 'aguardando_confirmacao') {
    throw new MoneyActionError(409, 'ORDER_NOT_CANCELLABLE', 'Há uma devolução esperando o cliente decidir entre reembolso e reentrega.', {
      currentStatus: order.status, reason: 'RETURN_IN_PROGRESS',
    });
  }
}

/**
 * O que cada culpa faz com o dinheiro. Pedido não pago (aguardando o Pix): nada entrou, então só
 * volta o saldo de carteira usado no pedido (custódia) e a culpa do cliente não retém taxa.
 */
export function computeCancelPreview(order: any, delivery: CancelTargetDelivery | null, fault: CancelFault, fees: CancelFeeConfig): CancelPreview {
  const p = previewByRule(order, delivery, fault, fees);
  if (order.paymentStatus === 'paid') return p;
  const walletBack = isDirectOrder(order) ? 0 : round2(Number(order.walletApplied) || 0);
  if (fault === 'customer') {
    return { ...p, customerRefund: walletBack, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null };
  }
  return { ...p, customerRefund: walletBack };
}

/** As mesmas fórmulas das regras da P2.1/P2.1b, para o pedido pago. */
function previewByRule(order: any, delivery: CancelTargetDelivery | null, fault: CancelFault, fees: CancelFeeConfig): CancelPreview {
  const total = Number(order.totalValue) || 0;
  const deliveryFee = Number(order.deliveryFee) || 0;
  const direct = isDirectOrder(order);
  const motoboyId = delivery?.motoboyId ?? null;
  const fullRefund = direct ? directCustomerRefund(order, null, 'full') : total;

  if (fault === 'customer') {
    const motoboyEnRoute = motoboyOnTheWay(order.status, delivery);
    const fee = calculateCancellationFee({ actor: 'customer', motoboyInvolved: motoboyEnRoute, orderTotal: total, deliveryFee, config: fees });
    const comp = motoboyId ? fee.motoboyShare : 0;
    return {
      fault,
      customerRefund: direct ? directCustomerRefund(order, fee, 'customer') : fee.refundToCustomer,
      feeCharged: fee.totalFee,
      motoboyCompensation: comp,
      compensationPaidBy: comp > 0 ? 'customer' : null,
      countsAgainst: 'customer',
    };
  }

  if (fault === 'store') {
    if (direct) {
      const comp = motoboyId ? storeDirectMotoboyShare(order, fees) : 0;
      return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'store' : null, countsAgainst: 'store' };
    }
    const fee = storeFeeFigures(order, fees, !!motoboyId);
    const feeCharged = storeFeeDecision(order, delivery).chargeStoreFee ? fee.totalFee : 0;
    const comp = feeCharged > 0 && motoboyId ? fee.motoboyShare : 0;
    return { fault, customerRefund: fullRefund, feeCharged, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'store' : null, countsAgainst: 'store' };
  }

  if (fault === 'motoboy') {
    return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'motoboy' };
  }

  // platform: entrega cheia ao motoboy, paga pelo DROP (como o cliente ausente); ninguém é culpado.
  const comp = motoboyId ? round2(deliveryFee) : 0;
  return { fault, customerRefund: fullRefund, feeCharged: 0, motoboyCompensation: comp, compensationPaidBy: comp > 0 ? 'platform' : null, countsAgainst: null };
}

/** GET /admin/orders/:id/cancel-preview?fault= — o que vai acontecer, sem mudar nada. */
export async function previewAdminCancel(orderId: string, fault: unknown): Promise<CancelPreview> {
  if (!isCancelFault(fault)) {
    throw new MoneyActionError(400, 'INVALID_FAULT', 'Escolha a culpa: cliente, loja, motoboy ou DROP.');
  }
  const { order, delivery } = await loadCancelTarget(orderId);
  assertAdminCancellable(order, delivery);
  return computeCancelPreview(order, delivery, fault, cancelFeeConfigOf(await getPlatformConfig()));
}

/** Motivo que o cliente e a loja veem (o texto do admin fica em Cancellation.details). */
export const ADMIN_CANCEL_REASON = 'Cancelado pelo suporte do DROP';

const brl = (n: number) => Number(n).toFixed(2).replace('.', ',');

type RuleOutcome =
  | { ok: true; cancellation: Cancellation; refundAmount: number; refundStatus: string }
  | { ok: false; changed: boolean };

/** Chama a regra do ator da culpa (P2.1). `changed` = outro fluxo mexeu no pedido no meio. */
async function runFaultRule(order: any, admin: AdminCancelActor, details: string): Promise<RuleOutcome> {
  if (admin.fault === 'customer' || admin.fault === 'store') {
    const rule = admin.fault === 'customer' ? cancelOrderAsCustomerRule : cancelOrderAsStoreRule;
    const r = await rule({ order, requestedBy: admin.adminId, reason: ADMIN_CANCEL_REASON, reasonCode: 'other', admin, details });
    if (r.status === 200 && r.cancellation) {
      return { ok: true, cancellation: r.cancellation, refundAmount: Number(r.refundAmount ?? 0), refundStatus: String(r.refundStatus) };
    }
    return { ok: false, changed: r.refusal === 'CLAIM_LOST' || r.refusal === 'DELIVERY_CHANGED' };
  }
  // motoboy e platform: reembolso integral. cancelledBy é sobrescrito por 'admin' (com a culpa).
  const r = await cancelOrderWithFullRefund(order, {
    reason: ADMIN_CANCEL_REASON, reasonCode: 'other', cancelledBy: 'motoboy', admin, details,
    platformCompensation: admin.fault === 'platform',
  });
  if (r.ok && r.cancellation) {
    return { ok: true, cancellation: r.cancellation, refundAmount: Number(r.refundAmount ?? 0), refundStatus: String(r.refundStatus) };
  }
  return { ok: false, changed: r.status === 409 };
}

/** 409 com o status relido: ORDER_CHANGED se outro fluxo mexeu no meio, senão ORDER_NOT_CANCELLABLE. */
async function refusalError(orderId: string, changed: boolean): Promise<MoneyActionError> {
  const fresh = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  const currentStatus = fresh?.status ?? 'desconhecido';
  return changed
    ? new MoneyActionError(409, 'ORDER_CHANGED', 'O pedido mudou. Recarregue.', { currentStatus })
    : new MoneyActionError(409, 'ORDER_NOT_CANCELLABLE', 'Este pedido não pode mais ser cancelado.', { currentStatus });
}

/**
 * POST /admin/orders/:id/cancel — cancela com estorno aplicando a regra do ator da culpa.
 * A trava condicional de cada regra decide a corrida: só quem vence grava estorno,
 * compensação, AdminOrderAction e AdminMoneyAction.
 */
export async function adminCancelOrder(input: { orderId: string; fault: unknown; reason: unknown; actor: AdminMoneyActor }): Promise<CancelResult> {
  if (!isCancelFault(input.fault)) {
    throw new MoneyActionError(400, 'INVALID_FAULT', 'Escolha a culpa: cliente, loja, motoboy ou DROP.');
  }
  const fault = input.fault;
  const reason = normalizeAdminReason(input.reason);
  const { order, delivery } = await loadCancelTarget(input.orderId);
  assertAdminCancellable(order, delivery);
  const preview = computeCancelPreview(order, delivery, fault, cancelFeeConfigOf(await getPlatformConfig()));

  const orderId = String(order.id);
  const shortId = orderId.slice(-6);
  const previousStatus = String(order.status);
  const direct = isDirectOrder(order);
  const admin: AdminCancelActor = { adminId: input.actor.id, fault };

  const outcome = await runFaultRule(order, admin, reason);
  if (outcome.ok === false) throw await refusalError(orderId, outcome.changed);
  const { cancellation, refundStatus } = outcome;
  // Dinheiro que volta de fato: pedido não pago (aguardando o Pix) só devolve o saldo de carteira
  // usado (prévia); o Cancellation guarda o valor nominal da regra, como sempre (revisão, I1).
  const refundAmount = order.paymentStatus === 'paid' ? outcome.refundAmount : preview.customerRefund;

  // Quem estava na corrida, relido depois do cancelamento (o motoboyId fica gravado na entrega).
  const fresh = order.deliveryId
    ? await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { id: true, motoboyId: true } })
    : null;
  const motoboyId = fresh?.motoboyId ?? null;
  // Culpa do DROP: a entrega cheia ao motoboy. No SaaS ela já virou a MotoboyTransfer
  // payer='platform' (Pix manual) na transação do cancelamento; na custódia sai do caixa aqui.
  const platformComp = fault === 'platform' && motoboyId ? round2(Number(order.deliveryFee) || 0) : 0;
  const custodyPlatformComp = direct ? 0 : platformComp;
  const motoboyCompensation = fault === 'platform' ? platformComp : preview.motoboyCompensation;
  const after: Record<string, string | number | boolean | null> = {
    status: 'cancelado',
    fault,
    cancellationId: String(cancellation.id),
    refundAmount,
    refundStatus,
    feeCharged: preview.feeCharged,
    motoboyCompensation,
    compensationPaidBy: motoboyCompensation > 0 ? preview.compensationPaidBy : null,
  };

  // Compensação do DROP na custódia: transação própria e ANTES do registro, para uma falha no
  // registro não deixar o motoboy sem a entrega. Idempotente pela referência (revisão, I2).
  if (custodyPlatformComp > 0 && motoboyId && fresh) {
    const reference = `ADMIN_CANCEL_COMP_${orderId}`;
    try {
      await prisma.$transaction(async (tx) => {
        const already = await tx.walletEntry.findFirst({ where: { reference }, select: { id: true } });
        if (already) return;
        await walletService.credit({
          owner: motoboyId, ownerType: 'motoboy', amount: custodyPlatformComp, category: 'transfer',
          reason: `Compensação — pedido ${shortId} cancelado pelo suporte do DROP`,
          reference, relatedId: orderId,
        }, tx);
        await recordCashboxEntry(tx, {
          type: 'expense', source: 'admin_cancel_compensation', amount: custodyPlatformComp, orderId, deliveryId: fresh.id,
          reason: `Compensação do motoboy paga pelo DROP — cancelamento do admin, pedido ${orderId}`,
        });
      });
    } catch (err) {
      // O registro guarda a falha e o aviso ao motoboy não promete o valor.
      after.compensationFailed = true;
      logger.error('[adminCancel] pedido cancelado, mas a compensação do motoboy falhou', err as Error, { orderId, motoboyId });
      emitAdminNotification({
        title: 'Compensação do motoboy não paga',
        body: `Pedido ${shortId}: cancelado com culpa do DROP, mas a compensação de R$ ${brl(custodyPlatformComp)} ao motoboy falhou — conferir.`,
        url: `/admin/pedidos/${orderId}`,
        tag: `admin-cancel-comp-${orderId}`,
      });
    }
  }

  // Registro (spec 4.2: logo depois do cancelamento; se falhar, logger.error e aviso ao admin).
  try {
    await prisma.$transaction(async (tx) => {
      await tx.adminOrderAction.create({
        data: {
          orderId, action: 'cancel', actorId: input.actor.id, actorRole: input.actor.role, reason, faultParty: fault,
          details: { previousStatus, ...after },
        },
      });
      await recordAdminMoneyAction(tx, {
        actor: input.actor, type: 'order_admin_cancel', targetType: 'order', targetId: orderId,
        amount: refundAmount > 0 ? refundAmount : null, reason, before: { status: previousStatus }, after,
      });
    });
  } catch (err) {
    logger.error('[adminCancel] pedido cancelado, mas o registro falhou', err as Error, { orderId, fault });
    emitAdminNotification({
      title: 'Cancelamento sem registro completo',
      body: `Pedido ${shortId}: o cancelamento foi feito, mas o registro da ação falhou — conferir.`,
      url: `/admin/pedidos/${orderId}`,
      tag: `admin-cancel-${orderId}`,
    });
  }

  // Avisos (sino + push). A culpa não aparece para o cliente.
  await notifyUser(String(order.customerId), {
    title: 'Pedido cancelado',
    message: refundAmount > 0
      ? `O suporte do DROP cancelou o seu pedido #${shortId}. Vamos devolver R$ ${brl(refundAmount)}.`
      : `O suporte do DROP cancelou o seu pedido #${shortId}.`,
    link: `/order/${orderId}`,
    entityId: orderId,
    type: 'order',
    tag: 'pedido-cancelado',
  });
  await notifyStore(String(order.storeId), {
    title: 'Pedido cancelado pelo suporte',
    message: `O suporte do DROP cancelou o pedido #${shortId}. Toque para ver.`,
    link: STORE_LINKS.order(orderId),
    entityId: orderId,
    type: 'order',
    tag: 'pedido-cancelado',
  });
  if (motoboyId && fresh) {
    await notifyUser(motoboyId, {
      title: 'Corrida cancelada',
      message: motoboyCompensation > 0 && !after.compensationFailed
        ? `O suporte do DROP cancelou a corrida #${shortId}. Você recebe R$ ${brl(motoboyCompensation)} de compensação.`
        : `O suporte do DROP cancelou a corrida #${shortId}.`,
      link: '/motoboy',
      entityId: fresh.id,
      type: 'order',
      tag: `corrida-${fresh.id}`,
    });
  }
  emitAdminOrderChanged(orderId, 'cancelado');

  return { ok: true, cancellationId: String(cancellation.id), refundAmount, refundStatus };
}
