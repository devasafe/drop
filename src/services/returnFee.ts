import { ReturnRequest } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import { generatePin } from './pinGuard';
import { createStorePixCharge, getStorePaymentStatus, cancelStorePixCharge } from './asaasLoja/charge';
import { createReturnRide, quoteReturnRide, returnRidePoints, type ReturnRidePoints } from './returnRide';
import { notifyStore, notifyUser, STORE_LINKS } from './storeNotify';
import { emitToRoom } from '../utils/socketEmitter';

/**
 * Arrependimento com motoboy (caso B, fase 2c): o cliente paga a corrida de volta por Pix na conta
 * Asaas DA LOJA (externalReference `return:<id>`). Com o Pix pago, a corrida nasce no pool e a loja
 * paga o motoboy como na 2b. Pagamento por webhook da loja ou consulta ("Já paguei").
 */

export const RETURN_FEE_REF = (returnRequestId: string) => `return:${returnRequestId}`;
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

/** O QR pode ter vencido: o Asaas manda "AAAA-MM-DD HH:MM:SS" no fuso de São Paulo. */
export function feePixExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(`${expiresAt.replace(' ', 'T')}-03:00`);
  return Number.isFinite(t) && t < now.getTime();
}

/** Cria a cobrança da taxa e deixa o pedido de reembolso aguardando o pagamento. */
export async function startReturnFeeCharge(rr: ReturnRequest, points: ReturnRidePoints, from: 'aprovado' | 'aguardando_pagamento'): Promise<ReturnRequest | null> {
  const { fee } = await quoteReturnRide(points);
  const code = rr.orderId.slice(-6).toUpperCase();
  const charge = await createStorePixCharge({
    storeId: rr.storeId,
    orderId: RETURN_FEE_REF(rr.id),
    buyerUserId: rr.customerId,
    value: fee,
    description: `Corrida de devolução do pedido #${code}`,
  });
  const { count } = await prisma.returnRequest.updateMany({
    where: { id: rr.id, status: from },
    data: {
      status: 'aguardando_pagamento',
      mode: 'motoboy',
      feeAmount: fee,
      feeAsaasPaymentId: charge.providerPaymentId,
      feePixPayload: charge.pix?.qrCodePayload ?? null,
      feePixImage: charge.pix?.qrCodeImage ?? null,
      feePixExpiresAt: charge.pix?.expiresAt ?? null,
    },
  });
  if (count !== 1) {
    // Outra ação venceu: a cobrança recém-criada não pode ficar pagável.
    await cancelStorePixCharge(rr.storeId, charge.providerPaymentId);
    return null;
  }
  return prisma.returnRequest.findUnique({ where: { id: rr.id } });
}

/**
 * O Pix da taxa foi pago: aguardando_pagamento → devolvendo (com o código da loja) e a corrida
 * entra no pool. Idempotente: webhook repetido ou "Já paguei" depois do webhook não cria outra.
 */
export async function settleReturnFeePaid(returnRequestId: string): Promise<ReturnRequest | null> {
  const { count } = await prisma.returnRequest.updateMany({
    where: { id: returnRequestId, status: 'aguardando_pagamento' },
    data: { status: 'devolvendo', feePaidAt: new Date(), pin: generatePin(5), pinFailedAttempts: 0, pinLockedUntil: null },
  });
  if (count !== 1) return null;
  const rr = await prisma.returnRequest.findUnique({ where: { id: returnRequestId } });
  if (!rr) return null;
  const points = await returnRidePoints(rr.orderId);
  if (!points) {
    // Sem coordenadas não chegaria aqui (checado na escolha); se acontecer, o admin resolve.
    logger.error('[returnFee] Pix da corrida pago sem coordenadas do pedido', 'RETURN_FEE_NO_POINTS', { returnRequestId });
    return rr;
  }
  await createReturnRide(rr, points, Number(rr.feeAmount));
  const code = rr.orderId.slice(-6).toUpperCase();
  void notifyStore(rr.storeId, {
    title: 'Devolução a caminho',
    message: `O cliente pagou a corrida de volta do pedido #${code}. Um motoboy vai buscar o produto e trazer à loja.`,
    link: STORE_LINKS.order(rr.orderId),
    entityId: rr.orderId,
    tag: 'reembolso',
  });
  emitToRoom(`user:${rr.customerId}`, 'return:updated', { orderId: rr.orderId, status: rr.status });
  emitToRoom(`store:${rr.storeId}`, 'order:updated', { orderId: rr.orderId });
  void notifyUser(rr.customerId, {
    title: 'Pagamento confirmado',
    message: 'Recebemos o Pix da corrida. Estamos procurando um motoboy para buscar o produto.',
    link: `/pedido/${rr.orderId}`,
    entityId: rr.orderId,
    tag: 'reembolso',
  });
  return rr;
}

/** Webhook da loja: o pagamento é a taxa de devolução DESTA loja? Se sim, confirma. */
export async function confirmReturnFeeByPayment(storeId: string, paymentId: string): Promise<void> {
  const rr = await prisma.returnRequest.findFirst({ where: { feeAsaasPaymentId: paymentId, storeId }, select: { id: true } });
  if (rr) await settleReturnFeePaid(rr.id);
}

/** "Já paguei": consulta o status da cobrança na conta da loja. */
export async function checkReturnFeePaid(rr: ReturnRequest): Promise<void> {
  if (rr.status !== 'aguardando_pagamento' || !rr.feeAsaasPaymentId) return;
  const status = await getStorePaymentStatus(rr.storeId, rr.feeAsaasPaymentId);
  if (status && PAID.has(status)) await settleReturnFeePaid(rr.id);
}

/**
 * Antes de pagar, o cliente troca para "Levo na loja": exclui a cobrança. false = não excluiu
 * (pode já ter sido paga): quem chama confere o pagamento antes de seguir.
 */
export async function cancelReturnFee(rr: ReturnRequest): Promise<boolean> {
  if (!rr.feeAsaasPaymentId) return true;
  return cancelStorePixCharge(rr.storeId, rr.feeAsaasPaymentId);
}
