import type { Response } from 'express';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { getSaasConfig } from '../../utils/settlement';
import { calculateDeliveryFeeWithConfig, round2 } from '../../utils/walletCalculations';
import { toApiOrder, orderInclude } from '../../repositories/order.repository';
import { findCouponByCode, findCouponById, incrementCouponUse } from '../../repositories/coupon.repository';
import { emitStockChanged } from '../storeIntegration';
import { compensateFailedOrder } from '../orderCompensation';
import { getPaymentProvider } from '../paymentProvider';
import { isStorePaymentsReady, resolveBuyerCpf, StorePaymentsNotReadyError } from './charge';

/**
 * Checkout do modo SaaS "direto" (Task 1.5). Chamado de dentro do createOrder
 * quando `isDirectMode()` — o caminho de custódia não passa por aqui.
 *
 * Diferenças para a custódia:
 * - cobra Pix na conta Asaas DA LOJA (provider 'asaas_loja'), nunca na conta-mãe;
 * - sem carteira (walletApplied 0), sem Payout, sem AppCashbox, sem comissão;
 * - taxa de entrega SEMPRE pela fórmula da rota real (pool de motoboys da DROP),
 *   ignorando plano/StoreSubscription e Store.deliveryMode (decisão do usuário: por
 *   enquanto não existe entrega própria; o campo fica no schema, sem uso);
 * - cupom global recusado; cupom da loja aplica e não lança nada no caixa do app.
 */

const fail = (message: string, statusCode: number, code: string) => new AppError(message, statusCode, true, code);

/** Resposta padrão do createOrder para AppError com código. */
export function sendAppError(res: Response, err: AppError) {
  return res.status(err.statusCode).json({ error: err.message, code: err.code });
}

/**
 * Pré-checagens do modo direto, ANTES de baixar estoque ou criar qualquer coisa.
 * Ordem: método → cupom → conta da loja → CPF (o único passo que grava algo: User.cpf).
 * Devolve o CPF de cobrança já validado.
 */
export async function precheckDirectOrder(params: {
  storeId: string;
  customerId: string;
  paymentMethod?: string;
  cupomCode?: string;
  cpf?: unknown;
}): Promise<{ cpf: string }> {
  const { paymentMethod } = params;
  if (paymentMethod === 'credit_card') {
    const { directCardEnabled } = await getSaasConfig();
    if (!directCardEnabled) throw fail('Pagamento com cartão não está disponível.', 400, 'METHOD_NOT_ALLOWED');
    throw fail('Pagamento com cartão na conta da loja ainda não está disponível.', 501, 'NOT_IMPLEMENTED');
  }
  if (paymentMethod !== 'pix') throw fail('No momento apenas PIX está disponível.', 400, 'METHOD_NOT_ALLOWED');

  if (params.cupomCode) {
    const coupon = await findCouponByCode(String(params.cupomCode));
    if (coupon?.type === 'global') {
      throw fail('Cupons da plataforma não valem nesta loja.', 400, 'COUPON_NOT_ALLOWED');
    }
  }

  if (!(await isStorePaymentsReady(params.storeId))) throw new StorePaymentsNotReadyError();

  return { cpf: await resolveBuyerCpf(params.customerId, params.cpf) };
}

/**
 * Taxa de entrega do modo direto: sempre a fórmula da rota real no servidor (pool DROP).
 * Store.deliveryMode é ignorado de propósito (entrega própria ainda não existe).
 */
export async function directDeliveryFee(serverDistanceKm: number): Promise<number> {
  return calculateDeliveryFeeWithConfig(serverDistanceKm);
}

export interface DirectOrderContext {
  customerId: string;
  store: any; // linha Store já carregada no createOrder
  items: Array<{ productId: any; quantity: number; price: number }>;
  subtotal: number;
  couponDiscount: number;
  appliedCouponId: any;
  cupomCode?: string;
  serverDistanceKm: number;
  routeDurationSeconds: number;
  routePolyline?: string;
  idempotentKey?: string;
  address?: string;
  latitude?: unknown;
  longitude?: unknown;
  cpf: string;
}

/**
 * Cria o pedido e a cobrança Pix na conta da loja. O estoque já foi baixado pelo
 * createOrder; qualquer falha da cobrança compensa (devolve estoque, apaga o pedido).
 */
export async function finishDirectOrder(res: Response, ctx: DirectOrderContext) {
  const { customerId, store, items, subtotal, couponDiscount } = ctx;
  const storeId = String(store.id);
  const deliveryFee = await directDeliveryFee(ctx.serverDistanceKm);
  const totalValue = round2(subtotal + deliveryFee - couponDiscount);

  const created = await prisma.order.create({
    data: {
      customerId,
      storeId,
      items: { create: items.map((it) => ({ productId: String(it.productId), quantity: it.quantity, price: it.price })) },
      subtotal,
      totalValue,
      deliveryFee,
      deliveryDistance: ctx.serverDistanceKm,
      deliveryDuration: ctx.routeDurationSeconds || undefined,
      routePolyline: ctx.routePolyline || undefined,
      status: 'criado',
      paymentMethod: 'pix',
      idempotentKey: ctx.idempotentKey,
      customerAddress: ctx.address,
      customerLatitude: ctx.latitude ? Number(ctx.latitude) : undefined,
      customerLongitude: ctx.longitude ? Number(ctx.longitude) : undefined,
      storeAddress: store.address,
      storeLatitude: store.latitude ? Number(store.latitude) : undefined,
      storeLongitude: store.longitude ? Number(store.longitude) : undefined,
      // Sem custódia: o total cobrado é inteiro da loja.
      walletDistribution: { storeAmount: totalValue, appCommission: 0, commissionPercent: 0 },
      asaasChargeStatus: 'pending',
      paymentProvider: 'asaas_loja',
      walletApplied: 0,
    },
    include: orderInclude,
  });
  void emitStockChanged(storeId, items.map((it) => String(it.productId)));
  const order: any = toApiOrder(created);

  let charge;
  try {
    charge = await getPaymentProvider('asaas_loja').createCharge({
      orderId: String(order.id),
      buyerUserId: customerId,
      value: totalValue,
      method: 'pix',
      description: `Pedido em ${store.name || 'loja'}`,
      storeId,
      cpf: ctx.cpf,
    });
  } catch (err: any) {
    await compensateFailedOrder(order.id, items, 0, customerId);
    if (err instanceof AppError && err.code) {
      logger.warn('[asaasLoja] cobrança na conta da loja recusada', { orderId: order.id, storeId, code: err.code });
      return sendAppError(res, err);
    }
    logger.error('[asaasLoja] falha ao gerar cobrança Pix na conta da loja', err as Error, { orderId: order.id, storeId });
    const detail = err?.errors?.[0]?.description || 'erro desconhecido';
    return res.status(502).json({ error: 'Falha ao gerar a cobrança PIX. Tente novamente.', detail });
  }

  // A cobrança JÁ existe na conta da loja. Se gravar o id falhar, o pedido fica sem vínculo
  // com ela: log específico para reconciliação manual (sem CPF/chave) e 500 (sem QR: o
  // cliente não paga uma cobrança que o pedido não conhece).
  try {
    await prisma.order.update({ where: { id: order.id }, data: { asaasPaymentId: charge.providerPaymentId } });
  } catch (err) {
    logger.error('[asaasLoja] cobrança criada na conta da loja, mas o pedido não gravou o asaasPaymentId — reconciliar manualmente', err as Error, {
      orderId: order.id, paymentId: charge.providerPaymentId, storeId,
    });
    return res.status(500).json({ error: 'Erro ao registrar a cobrança do pedido. Tente novamente.' });
  }
  order.asaasPaymentId = charge.providerPaymentId;

  // Cupom da loja: conta o uso (mesma trava atômica do custódia). Nada no caixa do app.
  if (ctx.appliedCouponId) {
    try {
      const couponDoc = await findCouponById(ctx.appliedCouponId);
      const counted = await incrementCouponUse(ctx.appliedCouponId, couponDoc?.maxUses ?? null);
      if (!counted && couponDoc?.maxUses != null) {
        logger.warn('Cupom esgotado em race condition pós-commit', { couponId: ctx.appliedCouponId, orderId: order.id });
      }
    } catch (err) {
      logger.error('Erro ao atualizar uso do cupom', err as Error);
    }
  }

  // Registro contábil auxiliar: pedido e cobrança já estão ok, então a falha aqui só é
  // logada (para reconciliação) e o cliente recebe o QR normalmente.
  try {
    await prisma.transaction.create({
      data: { orderId: String(order.id), paymentMethod: 'pix', amount: totalValue, commissionProduct: 0, commissionDelivery: 0 },
    });
  } catch (err) {
    logger.error('[asaasLoja] cobrança criada, mas o registro Transaction falhou — reconciliar manualmente', err as Error, {
      orderId: order.id, paymentId: charge.providerPaymentId, storeId,
    });
  }

  logger.info('Pedido criado (modo direto, cobrança na conta da loja)', { orderId: order.id, storeId, totalValue });

  // Mesmo formato do PIX da custódia ({ order, pix }) — o PixPaymentSheet não muda.
  return res.status(201).json({
    order,
    pix: {
      paymentId: charge.providerPaymentId,
      status: charge.status,
      qrCodeImage: charge.pix?.qrCodeImage,
      qrCodePayload: charge.pix?.qrCodePayload,
      expiresAt: charge.pix?.expiresAt,
    },
  });
}
