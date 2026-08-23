import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, persistDelivery } from '../repositories/delivery.repository';


import { recordCashboxEntry } from '../repositories/appCashbox.repository';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import notifier from '../services/notifier';
import { calculateDeliveryFeeWithConfig, calculateOrderDistribution } from '../utils/walletCalculations';
import { calculateCancellationFee } from '../utils/cancellationFee';
import {
  emitOrderCancelled,
  emitDeliveryRejected,
  emitOrderRejectedByStore,
  emitOrderAcceptedByStore,
  emitDeliveryCancelled,
  emitDeliveryCreated,
  emitToRoom,
  emitWalletRefund,
} from '../utils/socketEmitter';
import { addCommissionToAppCashbox } from './appCashboxController';
import walletService from '../services/wallet.prisma.service';
import payoutService from '../services/payout.service';
import logger from '../config/logger';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { emitOrderStatusChanged } from '../utils/socketEmitter';
import { createDebt } from '../repositories/customerDebt.repository';
import env from '../config/env';
import { refundOrderCharge } from '../services/asaas/refund';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Validações de permissão
const validateOrderOwnership = async (orderId: string, userId: string) => {
  // Devolve a forma de API (products[], _id, dinheiro em number) — os call sites
  // dependem desses campos.
  const order = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
  if (!order) throw new Error('Pedido não encontrado');
  if (String(order.customerId) !== userId) throw new Error('Permissão negada');
  return order;
};

const validateStoreOwnership = async (storeId: string, userId: string) => {
  const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
  if (!store) throw new Error('Loja não encontrada');
  if (store.ownerId.toString() !== userId) throw new Error('Permissão negada');
  return store;
};

const validateMotoboyDelivery = async (deliveryId: string, motoboyId: string) => {
  const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(deliveryId) } }));
  if (!delivery) throw new Error('Entrega não encontrada');
  if (delivery.motoboyId?.toString() !== motoboyId) throw new Error('Permissão negada');
  return delivery;
};

// ========== CANCELAMENTOS INICIADOS POR CLIENTE ==========

/**
 * Cliente cancela pedido
 * Transição: 'pago' ou 'enviado' → 'cancelado'
 * Refund: Processado automaticamente
 */
export const cancelOrderByCustomer = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Validações
    const order = await validateOrderOwnership(orderId, customerId);

    // Estados canceláveis pelo cliente. Inclui 'aguardando_motoboy' (loja já
    // aceitou, motoboy ainda não retirou) — reembolso é GRÁTIS/total nesse caso
    // (ver motoboyEnRoute/fee abaixo: taxa só vale em 'enviado').
    const cancellableStatuses = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado no estado: ${order.status}`,
        currentStatus: order.status,
      });
    }

    if (order.status === 'entregue') {
      return res.status(400).json({ error: 'Pedido já foi entregue. Devolução deve ser solicitada.' });
    }

    // `isLate` continua só para ROTULAGEM (reasonCode/isLateCancellation) — NÃO decide mais
    // se cobra a taxa. A taxa passa a valer sempre que há motoboy aceito (motoboyInvolved).
    const isLate = order.status === 'enviado';
    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

    // --- Novo modelo de taxa de cancelamento (Task 5) via calculateCancellationFee ---
    // A taxa só vale APÓS o aceite da loja (spec §3.2: as duas linhas de taxa do cliente
    // — "loja aprovou, MTB não pegou" e "MTB já pegou" — têm a pré-condição "loja aprovou").
    // Antes do aceite (acceptedAt=null): refund 100%, SEM taxa e SEM compensação de motoboy.
    // Quando há taxa, ela é DESCONTADA do refund (nunca reembolsa 100% + cobra à parte);
    // `motoboyInvolved` controla só a divisão (100% app vs 50/50).
    const cfg = await getPlatformConfig();
    const feeConfig = {
      cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
      cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
      cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
      lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
    };
    let compMotoboyId: string | null = null;
    let deliveryForGuard: { motoboyId: string | null; statusDevolucao: string | null } | null = null;
    if (order.deliveryId) {
      const del = await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { motoboyId: true, statusDevolucao: true } });
      deliveryForGuard = del ?? null;
      compMotoboyId = del?.motoboyId ?? null;
    }

    // ✅ Guard "devolução em andamento" (mesmo espírito do PICKED_UP_CANNOT_CANCEL da
    // loja em rejectOrderByStore, ~linha 1327). Depois que o motoboy cancela PÓS-PICKUP
    // (Task 7), a delivery fica em statusDevolucao='aguardando_confirmacao' com o
    // motoboyId de quem ABANDONOU a entrega, enquanto o pedido segue cancelável
    // ('enviado'). Sem este guard, este endpoint legado cobraria a taxa do CLIENTE e
    // pagaria 50% dela ao motoboy que abandonou — o oposto da spec (motoboy culpado →
    // cliente 100%, motoboy nada). A ação correta é POST /orders/:id/pos-devolucao.
    // Checado ANTES da trava atômica de reivindicação: nada é reivindicado/cancelado e
    // nenhum dinheiro se move. Não bloqueia cancelamentos legítimos (ex.: delivery
    // 'picked' sem devolução em andamento continua caindo no fluxo normal abaixo).
    if (deliveryForGuard?.statusDevolucao === 'aguardando_confirmacao') {
      return res.status(409).json({
        error: 'RETURN_IN_PROGRESS',
        message: 'Devolução em andamento; use a decisão pós-devolução.',
      });
    }

    const motoboyInvolved = !!order.deliveryId && !!compMotoboyId;
    // Política da taxa de cancelamento do CLIENTE: a taxa é o VALOR DA ENTREGA e só vale
    // quando o motoboy já rodou — pedido 'enviado' (produto retirado / em rota). Antes
    // disso (criado/pago; motoboy ainda não pegou), MESMO com a loja já tendo aceitado, o
    // cancelamento é GRÁTIS (reembolso cheio). Quando cobra, a entrega vai inteira pro
    // motoboy (a volta ele absorve) — ver calculateCancellationFee (actor 'customer').
    const motoboyEnRoute = order.status === 'enviado' && motoboyInvolved;
    const fee = calculateCancellationFee({
      actor: 'customer',
      motoboyInvolved: motoboyEnRoute,
      orderTotal: order.totalValue || 0,
      deliveryFee: order.deliveryFee || 0,
      config: feeConfig,
    });
    // Refund DESCONTADO: o cliente recebe o total menos a taxa (o desconto é a "cobrança").
    const refundAmount = fee.refundToCustomer;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: "reivindica" o cancelamento de forma atômica.
    // Só UM request consegue mudar de um status cancelável → 'cancelado'.
    // Bloqueia duplo-reembolso por requisições concorrentes.
    // A trava vira um UPDATE condicional: `WHERE status IN (canceláveis)`. Sob
    // concorrência o Postgres serializa a linha e só um request muda o status,
    // então `count === 1` é a reivindicação exclusiva (bloqueia duplo-reembolso).
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: { in: cancellableStatuses as any } },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (createOrder decrementa sempre, COD ou não).
    // Roda uma única vez graças à trava atômica acima.
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      try {
        // Tudo no Postgres numa única transação (Payout+Wallet+AppCashbox).
        await prisma.$transaction(async (tx) => {
          // Cancelar todos os payouts do pedido
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', tx);
          if (result.errors.length > 0) {
            // #3: há payout já requested/paid — o dinheiro pode já ter saído pra loja/motoboy.
            // NÃO reembolsar o cliente automaticamente (risco de gasto duplo). Aborta a
            // transação e escala pro admin resolver manualmente.
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          // Fluxo legado (carteira virtual): credita cliente + debita AppCashbox.
          // Em modo Asaas, o estorno é REAL (fora da transação, abaixo) — não mexe aqui.
          if (!useAsaas) {
            await walletService.credit(
              { owner: customerId, ownerType: 'user', amount: refundAmount, reason: 'Reembolso - Pedido cancelado pelo cliente', category: 'refund', relatedId: orderId },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId,
              reason: 'Reembolso - Pedido cancelado pelo cliente',
            });
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira que foi usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: customerId, ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido cancelado', category: 'refund', relatedId: orderId });
          }
          // Estorno REAL no Asaas (devolve pro PIX/cartão). A cobrança Asaas foi criada por
          // (total - walletApplied); e o walletApplied já voltou pela carteira acima. Então o
          // estorno PIX deve EXCLUIR o walletApplied para não devolvê-lo em dobro:
          //   asaasRefundValue = refundToCustomer - walletApplied
          // Retido do PIX = (total - walletApplied) - asaasRefundValue = fee. ✅
          const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
          if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
            try {
              await refundOrderCharge(order.asaasPaymentId, asaasRefundValue);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
              refundStatus = 'processed';
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas — escala pro admin', refundErr as Error, { orderId });
              refundStatus = 'pending';
            }
          } else {
            // Nada a estornar no gateway: pedido não pago via PIX, OU o refund ao cliente já
            // foi coberto pela devolução de walletApplied (walletApplied >= refundToCustomer →
            // asaasRefundValue <= 0). Ver edge documentado no report.
            refundStatus = 'processed';
          }
        } else {
          refundStatus = 'processed';
          emitWalletRefund(customerId, 'user', refundAmount, `Reembolso do pedido ${orderId}`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento no cancelamento pelo cliente', walletError as Error, { orderId });
          refundStatus = 'failed';
        }
      }
    }

    // --- Distribuição da taxa de cancelamento (novo modelo, Task 5) ---
    // Paid (não-COD): a taxa JÁ foi DESCONTADA do refund acima (fee.refundToCustomer).
    //   Aqui só repassamos a parte do motoboy (Payout released) e lançamos a taxa cheia
    //   como income no AppCashbox — o que dá lastro ao payout do motoboy, deixando o
    //   líquido da plataforma = appShare (= totalFee - motoboyShare).
    // COD: o cliente não paga online (não há refund a descontar), então preservamos o
    //   modelo anterior — a multa sai da reserva (blockedBalance) da loja + CustomerDebt,
    //   e só quando o cancelamento é tardio (antes do pickup COD não cobra taxa).
    let cancellationFeeCharged = 0;
    try {
      if (isCashOnDelivery) {
        if (isLate && fee.totalFee > 0) {
          cancellationFeeCharged = fee.totalFee;
          // CustomerDebt é criado após a transação (best-effort, mesmo padrão de antes).
          const debtToCreate = { customerId, amount: fee.totalFee, sourceOrderId: order.id, status: 'pending', reason: 'Multa de cancelamento tardio em pedido pagar na entrega' };
          await prisma.$transaction(async (tx) => {
            // Fee sai do blockedBalance da loja (cliente não pagou nada).
            const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
            const newBlocked = Math.max(0, Number(w.blockedBalance) - fee.totalFee);
            await tx.wallet.update({
              where: { id: w.id },
              data: { blockedBalance: newBlocked, totalSpent: { increment: fee.totalFee } },
            });

            // Compensação do motoboy: Payout released (reconciliável e sacável).
            if (fee.motoboyShare > 0 && compMotoboyId) {
              const compPayout = await payoutService.createPendingPayout({
                recipientType: 'motoboy', recipientId: compMotoboyId,
                orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
              });
              await payoutService.releasePayout(compPayout.id, tx);
            }

            // Taxa INTEIRA no AppCashbox (dá lastro ao Payout do motoboy).
            await recordCashboxEntry(tx, {
              type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
              reason: `Taxa de cancelamento COD (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
            });
          });
          await createDebt(debtToCreate);
        }
      } else if (fee.totalFee > 0) {
        cancellationFeeCharged = fee.totalFee;
        await prisma.$transaction(async (tx) => {
          // Parte do motoboy: Payout released (reconciliável e sacável). A taxa já saiu
          // do refund do cliente — aqui é só o repasse.
          if (fee.motoboyShare > 0 && compMotoboyId) {
            const compPayout = await payoutService.createPendingPayout({
              recipientType: 'motoboy', recipientId: compMotoboyId,
              orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
            });
            await payoutService.releasePayout(compPayout.id, tx);
          }

          // Taxa INTEIRA como income (lastro do Payout do motoboy). Líquido da plataforma
          // = appShare (a diferença entre a taxa cheia e a compensação repassada ao motoboy).
          await recordCashboxEntry(tx, {
            type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
            reason: `Taxa de cancelamento (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
          });
        });
      }
    } catch (feeErr) {
      logger.error('Erro ao aplicar taxa de cancelamento do cliente', feeErr as Error, { orderId });
    }

    // Cria documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'customer',
      reason: reason || 'Solicitado pelo cliente',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'customer_request'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    } });

    // Status já foi para 'cancelado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'cancelado';
    order.cancellationId = String(cancellation.id);
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Para COD antes do pickup: liberar reserva da loja se existir
    if (isCashOnDelivery && !isLate) {
      const config = await getPlatformConfig();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
      if (Number(storeWalletCOD.blockedBalance) > 0) {
        const release = Math.min(blockAmount, Number(storeWalletCOD.blockedBalance));
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: storeWalletCOD.id },
            data: { blockedBalance: { decrement: release }, balance: { increment: release } },
          });
          await tx.walletEntry.create({
            data: {
              walletId: storeWalletCOD.id, type: 'credit', category: 'transfer', amount: release,
              reason: `Liberação de reserva COD - pedido cancelado antes do pickup ${orderId}`,
              reference: `COD_UNBLOCK_${orderId}`,
            },
          });
        });
      }
    }

    // Se há entrega associada, cancela também
    if (order.deliveryId) {
      const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
      if (delivery && delivery.status !== 'delivered') {
        delivery.status = 'cancelled';
        delivery.cancelledAt = new Date();
        await persistDelivery(delivery);
        emitDeliveryCancelled(delivery, cancellation);
      }
    }

    // Emite evento de cancelamento
    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order.id,
      status: 'cancelado',
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    });
  } catch (error: any) {
    logger.error('Erro ao cancelar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== REJEIÇÕES INICIADAS POR MOTOBOY ==========

/**
 * Motoboy rejeita entrega
 * Valida que motoboy é o responsável
 * Devolve a entrega ao pool para reatribuição (único comportamento permitido)
 */
export const rejectDeliveryByMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const delivery = await validateMotoboyDelivery(deliveryId, motoboyId);

    // Apenas deliveries atribuídas ou em pickup podem ser rejeitadas
    const rejectable = ['assigned', 'picked'];
    if (!rejectable.includes(delivery.status)) {
      return res.status(400).json({
        error: `Entrega não pode ser rejeitada no estado: ${delivery.status}`,
      });
    }

    // Cria documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      cancelledBy: 'motoboy',
      reason: reason || 'Rejeitado por motoboy',
      reasonCode: reasonCode || 'motoboy_rejected',
    } });

    // Se produto já foi retirado (picked): motoboy é o culpado (spec §3.2 "MTB já pegou").
    // Cobra a taxa do MOTOBOY (base=entrega, 100% app), inicia a devolução do produto à loja
    // (pinDevolucao) e AGUARDA a decisão do cliente (reembolso/reentrega) — NÃO reatribui
    // automaticamente ao pool. `pendingReturnAction` fica indefinido: só o endpoint
    // `pos-devolucao` (reentrega) o define como 'reassign' quando o cliente escolhe.
    if (delivery.status === 'picked') {
      if (!delivery.pinDevolucao) {
        const orderForReturn = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });

        // Taxa do motoboy (spec §3.2 "MTB já pegou"): base = entrega, 100% app.
        const cfg = await getPlatformConfig();
        const feeConfig = {
          cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
          cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
          cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
          lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
        };
        const fee = calculateCancellationFee({
          actor: 'motoboy',
          motoboyInvolved: true,
          orderTotal: orderForReturn?.totalValue ? Number(orderForReturn.totalValue) : 0,
          deliveryFee: orderForReturn?.deliveryFee ? Number(orderForReturn.deliveryFee) : Number(delivery.fee || 0),
          config: feeConfig,
        });

        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const feeRef = `CANCEL_MTB_${delivery._id}`;

        // ── IDEMPOTÊNCIA CONCURRENCY-SAFE (review #2) ──
        // Reivindica a devolução de forma atômica na própria Delivery: o UPDATE condicional
        // `WHERE pinDevolucao IS NULL` (estado pré-taxa) é serializado pelo lock de linha do
        // Postgres, então dois `reject` simultâneos (double-tap) só têm UM vencedor — e só o
        // vencedor cobra a taxa. Espelha a trava de status do pedido (updateMany + count).
        const claim = await prisma.delivery.updateMany({
          where: { id: String(delivery._id), status: 'picked', pinDevolucao: null },
          data: { statusDevolucao: 'aguardando_confirmacao', pinDevolucao: pin, pendingReturnAction: null },
        });

        if (claim.count === 0) {
          // Outro request concorrente já reivindicou a devolução — NÃO cobra de novo.
          const fresh: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(delivery._id) } }));
          return res.status(202).json({
            success: true,
            statusDevolucao: fresh?.statusDevolucao ?? 'aguardando_confirmacao',
            message: 'Devolução já em andamento. Aguardando decisão do cliente / confirmação da loja.',
            pinDevolucao: fresh?.pinDevolucao,
            awaitingCustomerDecision: true,
            isPending: true,
          });
        }

        // Vencemos a reivindicação → somos o ÚNICO a cobrar a taxa (idempotência garantida).
        let feeStatus: 'charged' | 'pending' | 'none' = fee.totalFee > 0 ? 'pending' : 'none';
        if (fee.totalFee > 0) {
          try {
            await prisma.$transaction(async (tx) => {
              // Debita a taxa da carteira do MOTOBOY (mesmo padrão de penalty da loja).
              await walletService.debit(
                { owner: String(delivery.motoboyId), ownerType: 'motoboy', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-retirada - motoboy', category: 'penalty', reference: feeRef },
                tx,
              );
              // Taxa cheia (= appShare, 100% app) como income no AppCashbox. Aqui usamos
              // fee.appShare em vez de fee.totalFee (convenção dos demais pontos deste
              // arquivo) porque para o ator 'motoboy' motoboyShare=0 → appShare === totalFee;
              // é o mesmo valor, não há divergência contábil real.
              await recordCashboxEntry(tx, {
                type: 'income', source: 'cancelled_order', amount: fee.appShare, orderId: String(delivery.orderId),
                reason: `Taxa de cancelamento do motoboy pós-retirada - Pedido ${delivery.orderId}`,
              });
            });
            feeStatus = 'charged';
          } catch (feeErr) {
            // review #3: saldo insuficiente (ou outra falha do débito) → NÃO fingimos sucesso.
            // A devolução prossegue (o produto precisa voltar à loja de qualquer forma), mas a
            // taxa fica PENDENTE e recuperável: como NENHUM walletEntry `feeRef` foi criado, uma
            // cobrança futura pode reprocessá-la sem risco de duplicidade (idempotência por ref).
            feeStatus = 'pending';
            logger.warn('Taxa do motoboy não debitada (saldo insuficiente?) — fica PENDENTE p/ cobrança futura', { deliveryId: delivery._id, motoboyId: delivery.motoboyId, amount: fee.totalFee, error: (feeErr as Error)?.message });
          }
        }

        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn.id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy cancelou após retirar; precisa devolver o produto à loja',
            pinRequired: true,
            returnedAt: new Date(),
          });
          // Cliente decide: reembolso (100%) ou reentrega (novo entregador).
          emitToRoom(`user:${orderForReturn.customerId}`, 'order:aguardando_decisao_devolucao', {
            orderId: orderForReturn.id,
            deliveryId: delivery._id,
            message: 'O motoboy cancelou após retirar seu produto. Escolha: reembolso ou reentrega.',
            opcoes: ['reembolso', 'reentrega'],
          });
        }

        // review #5: a mensagem reflete o resultado REAL do débito (não um sucesso presumido).
        return res.status(202).json({
          success: true,
          statusDevolucao: 'aguardando_confirmacao',
          feeStatus,
          message: feeStatus === 'charged'
            ? 'Taxa cobrada do motoboy. Produto será devolvido à loja; aguardando decisão do cliente.'
            : feeStatus === 'pending'
              ? 'Produto será devolvido à loja; aguardando decisão do cliente. Taxa do motoboy ficou PENDENTE (sem saldo) e será cobrada posteriormente.'
              : 'Produto será devolvido à loja; aguardando decisão do cliente.',
          pinDevolucao: pin,
          awaitingCustomerDecision: true,
          isPending: true,
        });
      }

      // PIN já gerado mas loja ainda não confirmou
      if (delivery.statusDevolucao !== 'confirmado') {
        const orderForReturn = await prisma.order.findUnique({ where: { id: String(delivery.orderId) } });
        if (orderForReturn) {
          emitToRoom(`store:${orderForReturn.storeId}`, 'delivery:return_requested', {
            deliveryId: delivery._id,
            orderId: orderForReturn.id,
            motoboyId: delivery.motoboyId,
            message: 'Motoboy precisa devolver o produto à loja antes da reatribuição',
            pinRequired: true,
            returnedAt: new Date(),
            pinDevolucao: delivery.pinDevolucao,
          });
        }
        return res.status(202).json({
          success: true,
          currentStatus: delivery.statusDevolucao,
          message: 'Aguardando confirmação da loja com o PIN.',
          pinDevolucao: delivery.pinDevolucao,
          isPending: true,
        });
      }
    }

    // status === 'assigned' OU devolução já confirmada pela loja: reassign imediato.
    // motoboyId precisa ser `null` (não `undefined`) — Prisma ignora undefined no update.
    delivery.status = 'pending';
    delivery.motoboyId = null;
    delivery.pendingReturnAction = null;
    delivery.updatedAt = new Date();
    await persistDelivery(delivery);

    emitDeliveryRejected(delivery, 'motoboy', reason);
    return res.json({
      success: true,
      deliveryId: delivery._id,
      status: 'pending',
      reason,
    });
  } catch (error: any) {
    logger.error('Erro ao rejeitar entrega', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== CLIENTE AUSENTE (spec §3.2 / §6.3) ==========

/**
 * Motoboy marca "cliente ausente" no local, após a espera mínima cumprida.
 * POST /deliveries/:id/cliente-ausente
 *
 * Localização: fica aqui (não em `deliveryController.ts`, apesar do brief
 * apontar pra lá) porque TODA a infra financeira de refund/payout/AppCashbox já
 * está importada neste arquivo, e o fluxo reusa — não duplica — os MESMOS
 * primitivos atômicos de `cancelOrderByCustomer` (trava updateMany+count sobre
 * o pedido, devolução de estoque, cancelamento de payouts com guard
 * PAYOUT_ALREADY_SETTLED, refund parcial Asaas/legado). Duplicar esse código
 * financeiro em outro arquivo seria frágil (duas fontes de verdade para o
 * mesmo padrão de reembolso/idempotência).
 *
 * Taxa (helper `calculateCancellationFee`, actor='customer_absent'):
 *   base = orderTotal; totalFee = orderTotal * cancelFeeCustomerPercent/100 (payer=customer)
 *   motoboyShare = deliveryFee (entrega CHEIA, fixa — não é fração da taxa)
 *   appShare = totalFee - motoboyShare (pode ficar NEGATIVO se deliveryFee > totalFee)
 *   refundToCustomer = orderTotal - totalFee
 *
 * Edge appShare<0: NÃO lançamos `appShare` diretamente no AppCashbox (isso criaria
 * uma entrada de "income" negativa sem sentido contábil). Seguimos o MESMO padrão
 * dos outros atores (Task 5/6/7): lançamos `fee.totalFee` (sempre ≥ 0, é só
 * orderTotal * percent/100) como income — "dá lastro" ao Payout do motoboy — e o
 * "líquido" real da plataforma (appShare = totalFee - motoboyShare) fica implícito/
 * derivado (nunca é uma segunda entrada no caixa), exatamente como nas outras taxas
 * deste arquivo. Quando motoboyShare (entrega cheia) excede totalFee, a plataforma
 * paga ao motoboy mais do que arrecadou de taxa — é a garantia de "entrega cheia"
 * da spec, um custo que a plataforma absorve; o refund ao cliente e o pagamento ao
 * motoboy permanecem corretos independentemente disso.
 */
export const marcarClienteAusente = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { reason, reasonCode } = req.body || {};
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Dono da entrega: checagem EXPLÍCITA (não via `validateMotoboyDelivery`, que
    // lança e cairia no catch genérico → 500; aqui precisamos de 403 de verdade).
    const deliveryRow = await prisma.delivery.findUnique({ where: { id: String(deliveryId) } });
    if (!deliveryRow) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    if (String(deliveryRow.motoboyId) !== motoboyId) {
      return res.status(403).json({ error: 'Apenas o motoboy designado pode marcar cliente ausente' });
    }
    if (deliveryRow.status !== 'picked') {
      return res.status(400).json({
        error: `Cliente ausente só pode ser marcado com a entrega em 'picked' (atual: ${deliveryRow.status})`,
        currentStatus: deliveryRow.status,
      });
    }

    // Espera mínima: não há coluna `pickedAt` no schema. `persistDelivery`/`update`
    // sempre tocam `updatedAt` (@updatedAt) e a transição pra 'picked' (validarPinRetirada)
    // é a ÚLTIMA escrita na entrega antes deste endpoint — então `updatedAt` é o melhor
    // proxy disponível do horário de retirada, sem precisar de migração de schema.
    const cfg = await getPlatformConfig();
    const waitMin = cfg?.customerAbsentWaitMin ?? 15;
    const waitMs = waitMin * 60 * 1000;
    const elapsedMs = Date.now() - new Date(deliveryRow.updatedAt).getTime();
    if (elapsedMs < waitMs) {
      return res.status(400).json({
        error: `Espera mínima de ${waitMin} min ainda não cumprida`,
        waitMinutesRequired: waitMin,
        remainingMs: waitMs - elapsedMs,
      });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(deliveryRow.orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Mesmos estados canceláveis de `cancelOrderByCustomer` — a entrega 'picked'
    // normalmente corresponde a pedido 'enviado', mas cobrimos 'pago' defensivamente.
    const cancellableStatuses = ['pago', 'enviado'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser cancelado no estado: ${order.status}`,
        currentStatus: order.status,
      });
    }

    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

    const feeConfig = {
      cancelFeeCustomerPercent: cfg?.cancelFeeCustomerPercent ?? 10,
      cancelFeeStorePercent: cfg?.cancelFeeStorePercent ?? 10,
      cancelFeeMotoboyPercent: cfg?.cancelFeeMotoboyPercent ?? 10,
      lateCancellationMotoboyShare: cfg?.lateCancellationMotoboyShare ?? 50,
    };
    const fee = calculateCancellationFee({
      actor: 'customer_absent',
      motoboyInvolved: true,
      orderTotal: order.totalValue || 0,
      deliveryFee: order.deliveryFee || 0,
      config: feeConfig,
    });
    const refundAmount = fee.refundToCustomer;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: mesma trava de `cancelOrderByCustomer` — só UM
    // request consegue mover de um status cancelável → 'cancelado'.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, status: { in: cancellableStatuses as any } },
      data: { status: 'cancelado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: 'Pedido já foi cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (uma única vez, graças à trava acima) — produto volta pra loja.
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }

    // --- Refund PARCIAL ao cliente (mesmo padrão de cancelOrderByCustomer) ---
    if (!isCashOnDelivery) {
      try {
        await prisma.$transaction(async (tx) => {
          const result = await payoutService.cancelPayoutsForOrder(order.id, 'customer_absent', tx);
          if (result.errors.length > 0) {
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          if (!useAsaas) {
            await walletService.credit(
              { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: 'Reembolso parcial - Cliente ausente na entrega', category: 'refund', relatedId: order.id },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId: order.id,
              reason: 'Reembolso parcial - Cliente ausente na entrega',
            });
          }
        });

        if (useAsaas) {
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — cliente ausente', category: 'refund', relatedId: order.id });
          }
          const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
          if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
            try {
              await refundOrderCharge(order.asaasPaymentId, asaasRefundValue);
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
              refundStatus = 'processed';
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas (cliente ausente) — escala pro admin', refundErr as Error, { orderId: order.id });
              refundStatus = 'pending';
            }
          } else {
            refundStatus = 'processed';
          }
        } else {
          refundStatus = 'processed';
          emitWalletRefund(String(order.customerId), 'user', refundAmount, `Reembolso parcial do pedido ${order.id} - cliente ausente`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId: order.id, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento no fluxo cliente ausente', walletError as Error, { orderId: order.id });
          refundStatus = 'failed';
        }
      }
    } else {
      // COD: cliente nunca pagou online — nada a estornar via gateway/carteira.
      refundStatus = 'processed';
    }

    // --- Compensação do motoboy (entrega CHEIA) + AppCashbox (taxa cheia = lastro) ---
    let cancellationFeeCharged = 0;
    try {
      await prisma.$transaction(async (tx) => {
        if (fee.motoboyShare > 0) {
          const compPayout = await payoutService.createPendingPayout({
            recipientType: 'motoboy', recipientId: motoboyId,
            orderId: order.id, deliveryId: deliveryRow.id, amount: fee.motoboyShare, tx,
          });
          await payoutService.releasePayout(compPayout.id, tx);
        }
        // Taxa cheia como income — nunca negativa (ver nota de edge no topo da função).
        if (fee.totalFee > 0) {
          cancellationFeeCharged = fee.totalFee;
          await recordCashboxEntry(tx, {
            type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId: order.id,
            reason: `Taxa de cliente ausente (inclui compensação integral do motoboy a repassar) - Pedido ${order.id}`,
          });
        }
      });
    } catch (feeErr) {
      logger.error('Erro ao aplicar taxa/compensação de cliente ausente', feeErr as Error, { orderId: order.id });
    }

    // Documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      orderId: order.id,
      deliveryId: deliveryRow.id,
      cancelledBy: 'motoboy',
      reason: reason || 'Cliente ausente no momento da entrega',
      reasonCode: (reasonCode as any) || 'customer_unreachable',
      refundAmount,
      refundStatus,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    } });

    // Status já foi para 'cancelado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'cancelado';
    order.cancellationId = String(cancellation.id);
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Produto volta pra loja: mesmo fluxo de devolução com PIN das outras tasks
    // (statusDevolucao='aguardando_confirmacao' + pinDevolucao). Diferente do fluxo
    // do Task 7 (motoboy cancela após pegar), aqui NÃO há decisão pendente do cliente
    // — o pedido já foi definitivamente cancelado acima — então a entrega já vai
    // direto pra 'cancelled' (mesmo estado final usado por `cancelOrderWithFullRefund`).
    const pinDevolucao = Math.floor(100000 + Math.random() * 900000).toString();
    const deliveryApi: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: deliveryRow.id } }));
    if (deliveryApi) {
      deliveryApi.status = 'cancelled';
      deliveryApi.cancelledAt = new Date();
      deliveryApi.statusDevolucao = 'aguardando_confirmacao';
      deliveryApi.pinDevolucao = pinDevolucao;
      deliveryApi.pendingReturnAction = null;
      await persistDelivery(deliveryApi);
      emitDeliveryCancelled(deliveryApi, cancellation);

      emitToRoom(`store:${order.storeId}`, 'delivery:return_requested', {
        deliveryId: deliveryApi._id,
        orderId: order.id,
        motoboyId,
        message: 'Cliente ausente na entrega; motoboy vai devolver o produto à loja',
        pinRequired: true,
        returnedAt: new Date(),
      });
    }

    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order.id,
      deliveryId: deliveryRow.id,
      status: 'cancelado',
      statusDevolucao: 'aguardando_confirmacao',
      pinDevolucao,
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
      motoboyCompensation: fee.motoboyShare,
      appShare: fee.appShare,
    });
  } catch (error: any) {
    logger.error('Erro ao marcar cliente ausente', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Cancela um pedido com reembolso INTEGRAL (100%) ao cliente, reusando o padrão
 * atômico provado de `cancelOrderByCustomer` (trava updateMany+count, guard
 * PAYOUT_ALREADY_SETTLED, refund Asaas/legado, devolução de estoque, cancelamento
 * da entrega). Não há taxa aqui — usado quando a culpa é de outra parte (ex.: o
 * motoboy cancelou após retirar e o cliente pediu reembolso; a taxa do motoboy já
 * foi cobrada à parte). Recebe o pedido já na forma de API (`toApiOrder`).
 */
export async function cancelOrderWithFullRefund(
  order: any,
  opts: { reason: string; reasonCode: string; cancelledBy: 'customer' | 'store' | 'motoboy' },
): Promise<{ ok: boolean; status?: number; error?: string; refundAmount?: number; refundStatus?: string; cancellation?: any }> {
  // Inclui 'aguardando_motoboy' (Task 9): estado real de um pedido cuja entrega
  // está no pool sem motoboy — é justamente o estado do endpoint de decisão de
  // timeout do pool (`poolTimeoutDecision`, ramo 'cancelar'). Sem isso, cancelar
  // um pedido travado no pool falharia com 400 mesmo sendo o caso de uso primário.
  const cancellableStatuses = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
  if (!cancellableStatuses.includes(order.status)) {
    return { ok: false, status: 400, error: `Pedido não pode ser cancelado no estado: ${order.status}` };
  }

  const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
  const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
  const refundAmount = order.totalValue || 0; // 100%, sem desconto de taxa.
  let refundStatus: 'pending' | 'processed' | 'failed' = 'pending';

  // ✅ Trava atômica: só UM request move de status cancelável → 'cancelado'.
  const claim = await prisma.order.updateMany({
    where: { id: order.id, status: { in: cancellableStatuses as any } },
    data: { status: 'cancelado', cancelledAt: new Date() },
  });
  if (claim.count === 0) {
    return { ok: false, status: 409, error: 'Pedido já foi cancelado ou está em processamento' };
  }

  // ✅ Devolver estoque (uma única vez, graças à trava).
  for (const it of (order.products || [])) {
    if ((it as any).productId && (it as any).quantity) {
      await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
    }
  }

  if (!isCashOnDelivery) {
    try {
      await prisma.$transaction(async (tx) => {
        const result = await payoutService.cancelPayoutsForOrder(order.id, 'motoboy_returned_customer_refund', tx);
        if (result.errors.length > 0) {
          throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), { needsManualReview: true, payoutErrors: result.errors });
        }
        if (!useAsaas) {
          await walletService.credit(
            { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: opts.reason, category: 'refund', relatedId: order.id },
            tx,
          );
          await recordCashboxEntry(tx, { type: 'expense', source: 'order_refund', amount: refundAmount, orderId: order.id, reason: opts.reason });
        }
      });

      if (useAsaas) {
        if (order.walletApplied && order.walletApplied > 0) {
          await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido cancelado', category: 'refund', relatedId: order.id });
        }
        const asaasRefundValue = round2(refundAmount - (order.walletApplied || 0));
        if (order.paymentStatus === 'paid' && order.asaasPaymentId && asaasRefundValue > 0) {
          try {
            await refundOrderCharge(order.asaasPaymentId, asaasRefundValue);
            await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
            refundStatus = 'processed';
          } catch (refundErr) {
            logger.error('Falha no estorno Asaas (pos-devolucao) — escala pro admin', refundErr as Error, { orderId: order.id });
            refundStatus = 'pending';
          }
        } else {
          refundStatus = 'processed';
        }
      } else {
        refundStatus = 'processed';
        emitWalletRefund(String(order.customerId), 'user', refundAmount, `Reembolso do pedido ${order.id}`);
      }
    } catch (walletError: any) {
      if (walletError?.needsManualReview) {
        logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId: order.id, payoutErrors: walletError.payoutErrors });
        refundStatus = 'pending';
      } else {
        logger.error('Erro ao reverter pagamento no reembolso pós-devolução', walletError as Error, { orderId: order.id });
        refundStatus = 'failed';
      }
    }
  } else {
    refundStatus = 'processed';
  }

  const cancellation = await prisma.cancellation.create({ data: {
    orderId: order.id,
    deliveryId: order.deliveryId || undefined,
    cancelledBy: opts.cancelledBy,
    reason: opts.reason,
    reasonCode: opts.reasonCode as any,
    refundAmount,
    refundStatus,
  } });

  order.status = 'cancelado';
  await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

  // Cancela a entrega associada E leva o estado de devolução ao TERMINAL (review #1a):
  // com `statusDevolucao='confirmado'` + `pinDevolucao=null`, o guard do `confirmReturn`
  // (`statusDevolucao !== 'aguardando_confirmacao' → 400`) rejeita uma confirmação tardia
  // da loja com o PIN, fechando o vetor de DUPLO-REEMBOLSO (reembolso + confirmReturn).
  if (order.deliveryId) {
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
    if (delivery && delivery.status !== 'delivered') {
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      delivery.statusDevolucao = 'confirmado';
      delivery.pinDevolucao = null;
      delivery.pendingReturnAction = null;
      await persistDelivery(delivery);
      emitDeliveryCancelled(delivery, cancellation);
    }
  }

  emitOrderCancelled(order, cancellation);
  return { ok: true, refundAmount, refundStatus, cancellation };
}

/**
 * Cliente decide após o motoboy cancelar tendo já retirado o produto (spec §3.2).
 * POST /orders/:id/pos-devolucao  body: { escolha: 'reembolso' | 'reentrega' }
 * - reembolso → refund 100% + encerra o pedido (padrão atômico compartilhado).
 * - reentrega → marca pendingReturnAction='reassign'; quando a loja confirmar a
 *   devolução (confirmReturn com PIN), a entrega volta ao pool.
 */
export const posDevolucaoDecision = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { escolha } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['reembolso', 'reentrega'].includes(escolha)) {
      return res.status(400).json({ error: "escolha inválida — use 'reembolso' ou 'reentrega'" });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== customerId) return res.status(403).json({ error: 'Permissão negada' });

    const delivery: any = order.deliveryId
      ? toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }))
      : null;
    if (!delivery || delivery.statusDevolucao !== 'aguardando_confirmacao') {
      return res.status(400).json({ error: 'Não há devolução aguardando decisão para este pedido' });
    }

    if (escolha === 'reembolso') {
      const result = await cancelOrderWithFullRefund(order, {
        reason: 'Motoboy cancelou após retirada; cliente optou por reembolso',
        reasonCode: 'motoboy_rejected',
        cancelledBy: 'customer',
      });
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      return res.json({
        success: true,
        escolha,
        orderId: order.id,
        status: 'cancelado',
        refundAmount: result.refundAmount,
        refundStatus: result.refundStatus,
      });
    }

    // reentrega → produto volta à loja (confirmReturn) e daí ao pool via 'reassign'.
    delivery.pendingReturnAction = 'reassign';
    await persistDelivery(delivery);

    emitToRoom(`store:${order.storeId}`, 'delivery:return_requested', {
      deliveryId: delivery._id,
      orderId: order.id,
      motoboyId: delivery.motoboyId,
      message: 'Cliente optou por reentrega; confirme a devolução com o PIN para reatribuir',
      pinRequired: true,
    });
    emitToRoom(`user:${order.customerId}`, 'order:reentrega_escolhida', {
      orderId: order.id,
      deliveryId: delivery._id,
      message: 'Assim que a loja receber o produto de volta, um novo entregador será atribuído.',
    });

    return res.json({
      success: true,
      escolha,
      orderId: order.id,
      deliveryId: delivery._id,
      message: 'Reentrega escolhida. Aguardando a loja confirmar a devolução para reatribuir.',
    });
  } catch (error: any) {
    logger.error('Erro na decisão pós-devolução do cliente', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Cliente decide após o timeout do pool sem motoboy (spec §6.1).
 * POST /orders/:id/pool-timeout  body: { escolha: 'seguir' | 'cancelar' }
 * - seguir → limpa `awaitingCustomerPoolDecision`; a entrega segue no pool
 *   (o matching existente continua tentando atribuir um motoboy).
 * - cancelar → refund 100% + encerra o pedido (padrão atômico compartilhado).
 * O job (`runPoolTimeout`) NUNCA cancela sozinho — só marca a flag e emite o
 * evento; a decisão de cancelar é sempre do cliente, aqui.
 */
export const poolTimeoutDecision = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { escolha } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!['seguir', 'cancelar'].includes(escolha)) {
      return res.status(400).json({ error: "escolha inválida — use 'seguir' ou 'cancelar'" });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== customerId) return res.status(403).json({ error: 'Permissão negada' });

    if (!order.awaitingCustomerPoolDecision) {
      return res.status(409).json({ error: 'Não há decisão de timeout do pool pendente para este pedido' });
    }

    if (escolha === 'cancelar') {
      const result = await cancelOrderWithFullRefund(order, {
        reason: 'Cliente cancelou após timeout do pool',
        reasonCode: 'motoboy_unavailable',
        cancelledBy: 'customer',
      });
      if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
      await prisma.order.update({ where: { id: order.id }, data: { awaitingCustomerPoolDecision: false } });
      return res.json({
        success: true,
        escolha,
        orderId: order.id,
        status: 'cancelado',
        refundAmount: result.refundAmount,
        refundStatus: result.refundStatus,
      });
    }

    // seguir → limpa a flag; a entrega permanece 'pending' e o matching existente
    // segue tentando atribuir um motoboy normalmente.
    await prisma.order.update({ where: { id: order.id }, data: { awaitingCustomerPoolDecision: false } });

    emitToRoom(`user:${order.customerId}`, 'order:pool_timeout_resolved', {
      orderId: order.id,
      escolha,
      message: 'Continuamos tentando encontrar um entregador para o seu pedido.',
    });

    return res.json({
      success: true,
      escolha,
      orderId: order.id,
      message: 'Seguimos tentando encontrar um entregador.',
    });
  } catch (error: any) {
    logger.error('Erro na decisão de timeout do pool', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== ACEITAÇÃO/REJEIÇÃO POR LOJA ==========

/**
 * Loja aceita pedido
 * Transição: 'criado' → 'pago' (pronto para preparação)
 */
export const acceptOrderByStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await prisma.store.findFirst({ where: { id: String(order.storeId), ownerId: userId } }) as any;
    if (!store) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    // Apenas pedidos 'criado' ou 'pago' podem ser aceitos
    if (!['criado', 'pago'].includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser aceito no estado: ${order.status}`,
      });
    }

    // Atualiza status para pago se ainda não foi
    if (order.status !== 'pago') {
      order.status = 'pago';
    }
    order.acceptedAt = new Date();
    // `order` vive no Postgres — a persistência acontece via prisma.order.update
    // (não participa das transações Mongo de carteira, COD legado).
    const persistOrder = () => prisma.order.update({
      where: { id: order.id },
      data: { status: order.status, acceptedAt: order.acceptedAt },
    });

    // Se pedido COD: bloquear fee potencial na wallet da loja (atomicamente com o status).
    if (order.paymentMethod === 'cash_on_delivery') {
      try {
        const config = await getPlatformConfig();
        const feePercent = config?.lateCancellationFeePercent ?? 10;
        const requiredBlock = (order.totalValue || 0) * feePercent / 100;

        const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
        if (Number(storeWalletCOD.balance) < requiredBlock) {
          return res.status(400).json({
            error: 'Saldo insuficiente para garantir pedido de pagamento na entrega',
            required: requiredBlock,
            available: Number(storeWalletCOD.balance),
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { id: storeWalletCOD.id },
            data: { balance: { decrement: requiredBlock }, blockedBalance: { increment: requiredBlock } },
          });
          await tx.walletEntry.create({
            data: { walletId: storeWalletCOD.id, type: 'debit', category: 'transfer', amount: requiredBlock, reason: `Reserva de garantia - pedido COD ${order.id}`, reference: `COD_BLOCK_${order.id}` },
          });
        });
        await persistOrder();
      } catch (codErr) {
        logger.error('Erro ao bloquear saldo para pedido COD', codErr as Error, { orderId: order.id });
        return res.status(500).json({ error: 'Erro ao processar garantia do pedido COD' });
      }
    } else {
      await persistOrder();
    }

    // Emite evento
    emitOrderAcceptedByStore(order);

    // [Plan1] Verificar plano da loja antes de criar Delivery
    const storeSub = await findSubByStoreId(String(store.id)); // store vem do Prisma (sem _id)
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planMap[(storeSub as any).currentPlan] ?? 1) : (store.plan ?? 1);

    if (storePlan === 1) {
      // Plano 1: sem motoboy — emitir e retornar sem criar Delivery
      emitOrderStatusChanged(order);
      emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
        orderId: order._id.toString(),
        status: 'pago',
        requiresDelivery: false,
        message: 'Pedido aceito! A loja está preparando sua entrega.',
      });
      emitToRoom(`store:${order.storeId}`, 'order:accepted_confirmation', {
        orderId: order._id.toString(),
        status: 'pago',
        requiresDelivery: false,
      });
      return res.json({
        success: true,
        orderId: order._id,
        status: 'pago',
        acceptedAt: order.acceptedAt,
        requiresDelivery: false,
      });
    }

    // Plano 2/3: cria delivery se não existir
    let delivery: any = toApiDelivery(await prisma.delivery.findFirst({ where: { orderId: order.id } }));
    if (!delivery) {
      // ✅ FONTE ÚNICA: a taxa e a distância da entrega HERDAM do Order (calculados
      // por rota no createOrder via RouteService). NÃO confiar em req.body.distance —
      // era um vetor de divergência/manipulação (mudava a taxa do motoboy no aceite).
      // Só recalcula se, por algum motivo, o Order não tiver a taxa gravada.
      const distance = order.deliveryDistance || 0;
      const fee = order.deliveryFee != null
        ? Number(order.deliveryFee)
        : await calculateDeliveryFeeWithConfig(Number(distance || 0));

      delivery = toApiDelivery(await prisma.delivery.create({
        data: {
          orderId: order.id,
          distance: Number(distance || 0),
          fee,
          status: 'pending',
          // ✅ NOVO: COPIAR dados de endereço do ORDER (é a fonte de verdade!)
          customerAddress: order.customerAddress,
          customerLatitude: order.customerLatitude,
          customerLongitude: order.customerLongitude,
          storeAddress: order.storeAddress,
          storeLatitude: order.storeLatitude,
          storeLongitude: order.storeLongitude,
          routePolyline: order.routePolyline, // rota loja→cliente (p/ mapa do motoboy/cliente)
        },
      }));

      // 🔴 REGISTRAR COMISSÃO DE ENTREGA NO APPCASHBOX
      try {
        const productTotal = (order.products || []).reduce((sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0);
        console.log(`\n🔍 [rejectOrder] REGISTRANDO COMISSÃO DE ENTREGA:`);
        console.log(`   📦 Produto total: R$ ${productTotal}`);
        console.log(`   🚗 Taxa de entrega: R$ ${fee}`);
        console.log(`   📍 Distância: ${distance}km`);
        console.log(`   🏪 Store ID: ${order.storeId.toString()}`);
        
        const distribution = await calculateOrderDistribution(productTotal, fee, order.storeId.toString(), Number(distance || 0));
        
        console.log(`\n✅ DISTRIBUIÇÃO CALCULADA:`);
        console.log(`   💳 Produto App Commission: R$ ${distribution.product.appCommission}`);
        console.log(`   🚗 Entrega App Commission: R$ ${distribution.delivery?.appCommission}`);
        console.log(`   👤 Motoboy Amount (líquido): R$ ${distribution.delivery?.motoboyAmount}`);

        if (order.paymentMethod === 'cash_on_delivery' && distribution.delivery) {
          await addCommissionToAppCashbox('delivery_commission', distribution.delivery.appCommission, order._id.toString(), delivery._id.toString(), 'Comissão de entrega');
        }

        console.log(`✅ COMISSÃO REGISTRADA COM SUCESSO!\n`);
      } catch (err) {
        console.error('\n❌ ERRO ao registrar comissão de entrega no caixa do app:', err);
        console.error(`   Pedido: ${order._id}`);
        console.error(`   Entrega: ${delivery._id}\n`);
      }

      // Emit socket event for delivery creation
      emitDeliveryCreated(delivery);
      
      // notify motoboys of new delivery
      try {
        notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance } });
      } catch (e) {
        // ignore
      }

      // Salva deliveryId no pedido
      order.deliveryId = String(delivery._id);
      await prisma.order.update({ where: { id: order.id }, data: { deliveryId: String(delivery._id) } });
    }

    return res.json({
      success: true,
      orderId: order._id,
      status: 'pago',
      acceptedAt: order.acceptedAt,
      delivery: delivery?._id,
    });
  } catch (error: any) {
    logger.error('Erro ao aceitar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Loja rejeita pedido
 * Transição: 'criado' → 'cancelado'
 * Refund: Processado automaticamente se pagamento foi capturado
 */
export const rejectOrderByStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;
    const { reason, reasonCode } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Validar que a loja pertence ao usuário
    const store = await prisma.store.findFirst({ where: { id: String(order.storeId), ownerId: userId } }) as any;
    if (!store) {
      return res.status(403).json({ error: 'Permissão negada' });
    }

    // Pedidos 'criado', 'pago' ou 'enviado' podem ser rejeitados pela loja
    if (!['criado', 'pago', 'enviado'].includes(order.status)) {
      return res.status(400).json({
        error: `Pedido não pode ser rejeitado no estado: ${order.status}`,
      });
    }

    // ✅ Carrega a entrega CEDO (antes da trava atômica) para poder BLOQUEAR o
    // cancelamento após o motoboy pegar o pedido (spec §3.2: "MTB já pegou" → 🚫).
    // Este caminho NÃO reivindica/rejeita o pedido — retorna 400 e o status fica intacto.
    const delivery = order.deliveryId
      ? await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) }, select: { id: true, status: true, motoboyId: true } })
      : null;
    if (delivery?.status === 'picked') {
      return res.status(400).json({ error: 'Motoboy já retirou o pedido; cancelamento bloqueado', code: 'PICKED_UP_CANNOT_CANCEL' });
    }

    // Aceite da loja: divisor entre REJEITAR (antes do aceite, sem taxa) e CANCELAR
    // (após o aceite, taxa da entrega — spec §3.2). `isLate` continua só como rótulo.
    const storeAccepted = !!order.acceptedAt;
    const isLate = order.status === 'enviado';
    const isCashOnDelivery = order.paymentMethod === 'cash_on_delivery';
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
    const refundAmount = order.totalValue || 0;
    let refundStatus: 'pending' | 'processed' | 'failed' = 'processed';

    // ✅ IDEMPOTÊNCIA/ATÔMICO: só UM request consegue mover para 'rejeitado'.
    // UPDATE condicional por status — bloqueia duplo-reembolso concorrente.
    const claim = await prisma.order.updateMany({
      where: { id: orderId, status: { in: ['criado', 'pago', 'enviado'] as any } },
      data: { status: 'rejeitado', cancelledAt: new Date() },
    });
    if (claim.count === 0) {
      return res.status(409).json({ error: 'Pedido já foi rejeitado/cancelado ou está em processamento' });
    }

    // ✅ Devolver estoque (uma única vez, graças à trava atômica acima)
    for (const it of (order.products || [])) {
      if ((it as any).productId && (it as any).quantity) {
        await prisma.product.updateMany({ where: { id: String((it as any).productId) }, data: { quantity: { increment: (it as any).quantity } } });
      }
    }

    // --- NOVO FLUXO: Cancelar payouts + reembolsar cliente + debitar AppCashbox ---
    if (!isCashOnDelivery) {
      try {
        await prisma.$transaction(async (tx) => {
          const result = await payoutService.cancelPayoutsForOrder(orderId, 'order_rejected_by_store', tx);
          if (result.errors.length > 0) {
            // #3: payout já liquidado — não reembolsar cego; escala pro admin.
            throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
              needsManualReview: true,
              payoutErrors: result.errors,
            });
          }

          // Fluxo legado (carteira virtual). Em modo Asaas o estorno é REAL (abaixo).
          if (!useAsaas) {
            await walletService.credit(
              { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: 'Reembolso - Pedido rejeitado pela loja', category: 'refund', relatedId: orderId },
              tx,
            );
            await recordCashboxEntry(tx, {
              type: 'expense', source: 'order_refund', amount: refundAmount, orderId,
              reason: 'Reembolso - Pedido rejeitado pela loja',
            });
          }
        });

        if (useAsaas) {
          // Devolve o saldo da carteira usado no pedido (se houve).
          if (order.walletApplied && order.walletApplied > 0) {
            await walletService.credit({ owner: String(order.customerId), ownerType: 'user', amount: order.walletApplied, reason: 'Devolução de saldo — pedido rejeitado', category: 'refund', relatedId: orderId });
          }
          if (order.paymentStatus === 'paid' && order.asaasPaymentId) {
            try {
              await refundOrderCharge(order.asaasPaymentId);
              order.asaasChargeStatus = 'refunded';
              order.paymentStatus = 'refunded';
              await prisma.order.update({ where: { id: order.id }, data: { asaasChargeStatus: 'refunded', paymentStatus: 'refunded' } });
            } catch (refundErr) {
              logger.error('Falha no estorno Asaas (rejeição da loja) — escala pro admin', refundErr as Error, { orderId });
              refundStatus = 'pending';
            }
          }
        } else {
          emitWalletRefund(order.customerId.toString(), 'user', refundAmount, `Reembolso do pedido ${orderId}`);
        }
      } catch (walletError: any) {
        if (walletError?.needsManualReview) {
          logger.warn('Reembolso retido para revisão manual — payout já liquidado', { orderId, payoutErrors: walletError.payoutErrors });
          refundStatus = 'pending';
        } else {
          logger.error('Erro ao reverter pagamento na rejeição pela loja', walletError as Error, { orderId });
          refundStatus = 'failed';
        }
      }
    }

    // Taxa de cancelamento da loja — SÓ após o aceite (spec §3.2). Antes do aceite
    // (acceptedAt=null) é REJEIÇÃO pura: refund 100%, SEM taxa. A base agora é a
    // ENTREGA (deliveryFee), via calculateCancellationFee({actor:'store'});
    // `motoboyInvolved` controla só a divisão (100% app vs 50/50 quando há MTB atribuído).
    // O refund ao cliente permanece 100% (a loja é a culpada) — não é descontado.
    //
    // ESCOPO PIX: o novo gate configurável (base=entrega) vale para PIX. Para COD,
    // preservamos o comportamento LEGADO — taxa só quando `isLate` — para que o bloco
    // de taxa e o bloco de liberação da reserva COD (`if (isCashOnDelivery && !isLate)`,
    // adiante) permaneçam MUTUAMENTE EXCLUSIVOS como antes. Sem isso, um COD aceito-não-
    // enviado rodaria os DOIS, drenando o `blockedBalance` (pool compartilhado de reservas
    // de outros pedidos) em dobro.
    const chargeStoreFee = storeAccepted && (!isCashOnDelivery || isLate);
    let cancellationFeeCharged = 0;
    if (chargeStoreFee) {
      try {
        const config = await getPlatformConfig();
        const feeConfig = {
          cancelFeeCustomerPercent: config?.cancelFeeCustomerPercent ?? 10,
          cancelFeeStorePercent: config?.cancelFeeStorePercent ?? 10,
          cancelFeeMotoboyPercent: config?.cancelFeeMotoboyPercent ?? 10,
          lateCancellationMotoboyShare: config?.lateCancellationMotoboyShare ?? 50,
        };
        const compMotoboyId: string | null = delivery?.motoboyId ?? null;
        const fee = calculateCancellationFee({
          actor: 'store',
          motoboyInvolved: !!compMotoboyId,
          orderTotal: order.totalValue || 0,
          deliveryFee: order.deliveryFee || 0,
          config: feeConfig,
        });
        cancellationFeeCharged = fee.totalFee;

        if (fee.totalFee > 0) {
          await prisma.$transaction(async (tx) => {
            // Debita a taxa da carteira da loja (do bucket bloqueado no COD, do saldo senão).
            const w = await walletService.getOrCreate(String(order.storeId), 'store', tx);
            if (isCashOnDelivery) {
              const newBlocked = Math.max(0, Number(w.blockedBalance) - fee.totalFee);
              await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, totalSpent: { increment: fee.totalFee } } });
              await tx.walletEntry.create({ data: { walletId: w.id, type: 'debit', category: 'penalty', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-aceite - loja', reference: `CANCEL_STORE_${orderId}` } });
            } else {
              await walletService.debit(
                { owner: String(order.storeId), ownerType: 'store', amount: fee.totalFee, reason: 'Taxa de cancelamento pós-aceite - loja', category: 'penalty', reference: `CANCEL_STORE_${orderId}` },
                tx,
              );
            }

            // Compensação do motoboy: Payout released.
            if (fee.motoboyShare > 0 && compMotoboyId) {
              const compPayout = await payoutService.createPendingPayout({
                recipientType: 'motoboy', recipientId: compMotoboyId,
                orderId: order.id, deliveryId: String(order.deliveryId), amount: fee.motoboyShare, tx,
              });
              await payoutService.releasePayout(compPayout.id, tx);
            }

            // Multa INTEIRA no AppCashbox (lastro do Payout do motoboy).
            // Líquido da plataforma = appShare (= totalFee - motoboyShare).
            await recordCashboxEntry(tx, {
              type: 'income', source: 'cancelled_order', amount: fee.totalFee, orderId,
              reason: `Taxa cancelamento loja pós-aceite (inclui compensação do motoboy a repassar) - Pedido ${orderId}`,
            });
          });
        }
      } catch (feeErr) {
        logger.error('Erro ao cobrar taxa de cancelamento da loja', feeErr as Error, { orderId });
      }
    }

    // Cria documento de cancelamento
    const cancellation = await prisma.cancellation.create({ data: {
      orderId: order.id,
      deliveryId: order.deliveryId || undefined,
      cancelledBy: 'store',
      reason: reason || 'Rejeitado pela loja',
      reasonCode: isLate ? 'late_cancellation' : (reasonCode || 'store_rejected'),
      refundAmount,
      refundStatus,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    } });

    // Status já foi para 'rejeitado' na trava atômica; grava o vínculo do cancelamento.
    order.status = 'rejeitado';
    order.cancellationId = String(cancellation.id);
    await prisma.order.update({ where: { id: order.id }, data: { cancellationId: String(cancellation.id) } });

    // Para COD antes do pickup: liberar reserva da loja
    if (isCashOnDelivery && !isLate) {
      const config = await getPlatformConfig();
      const feePercent = config?.lateCancellationFeePercent ?? 10;
      const blockAmount = (order.totalValue || 0) * feePercent / 100;
      const storeWalletCOD = await walletService.getOrCreate(String(order.storeId), 'store');
      if (Number(storeWalletCOD.blockedBalance) > 0) {
        const release = Math.min(blockAmount, Number(storeWalletCOD.blockedBalance));
        await prisma.$transaction(async (tx) => {
          await tx.wallet.update({ where: { id: storeWalletCOD.id }, data: { blockedBalance: { decrement: release }, balance: { increment: release } } });
          await tx.walletEntry.create({ data: { walletId: storeWalletCOD.id, type: 'credit', category: 'transfer', amount: release, reason: `Liberação de reserva COD - rejeição antes do pickup ${orderId}`, reference: `COD_UNBLOCK_${orderId}` } });
        });
      }
    }

    // Cancela entrega associada
    if (order.deliveryId) {
      const deliveryDoc: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }));
      if (deliveryDoc && deliveryDoc.status !== 'delivered') {
        deliveryDoc.status = 'cancelled';
        deliveryDoc.cancelledAt = new Date();
        await persistDelivery(deliveryDoc);
        emitDeliveryCancelled(deliveryDoc, cancellation);
      }
    }

    // Emite eventos
    emitOrderRejectedByStore(order, reason);
    emitOrderCancelled(order, cancellation);

    return res.json({
      success: true,
      orderId: order._id,
      status: 'cancelado',
      reason,
      refundAmount,
      refundStatus,
      cancellationId: cancellation.id,
      isLateCancellation: isLate,
      lateCancellationFee: cancellationFeeCharged > 0 ? cancellationFeeCharged : undefined,
    });
  } catch (error: any) {
    logger.error('Erro ao rejeitar pedido', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== CONSULTAS DE CANCELAMENTOS ==========

/**
 * Obter histórico de cancelamentos de um pedido
 */
export const getCancellationHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params as any;

    // ✅ SEGURANÇA (IDOR): só o cliente dono, o dono da loja ou um admin podem ver.
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || (req.user as any)?.role;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    const isCustomer = String(order.customerId) === String(userId);
    let isStoreOwner = false;
    if (!isCustomer) {
      const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
      isStoreOwner = !!store && String(store.ownerId) === String(userId);
    }
    const isAdmin = ['ceo', 'gerente_geral'].includes(role);
    if (!isCustomer && !isStoreOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para ver este histórico' });
    }

    const cancellations = await prisma.cancellation.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      success: true,
      count: cancellations.length,
      history: cancellations,
    });
  } catch (error: any) {
    logger.error('Erro ao buscar histórico de cancelamentos', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Obter estatísticas de cancelamentos
 */
export const getCancellationStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Buscar a loja do usuário
    const store = await prisma.store.findFirst({ where: { ownerId: userId } }) as any;
    if (!store) {
      return res.status(403).json({ error: 'Usuário não é lojista' });
    }

    // Busca todos os pedidos da loja para contar cancelamentos
    const orders = await prisma.order.findMany({ where: { storeId: store.id }, select: { id: true, status: true } });
    const orderIds = orders.map(o => o.id);

    const cancellations = await prisma.cancellation.findMany({
      where: { orderId: { in: orderIds } },
      select: { reasonCode: true, refundStatus: true, refundAmount: true },
    });

    const byReasonMap = new Map<string, { count: number; totalRefund: number }>();
    const byRefundMap = new Map<string, { count: number; total: number }>();
    for (const c of cancellations) {
      const refund = c.refundAmount ? Number(c.refundAmount) : 0;
      const r = byReasonMap.get(c.reasonCode) || { count: 0, totalRefund: 0 };
      r.count += 1; r.totalRefund += refund;
      byReasonMap.set(c.reasonCode, r);

      const rs = String(c.refundStatus ?? 'null');
      const f = byRefundMap.get(rs) || { count: 0, total: 0 };
      f.count += 1; f.total += refund;
      byRefundMap.set(rs, f);
    }
    const stats = [...byReasonMap.entries()].map(([_id, v]) => ({ _id, count: v.count, totalRefund: v.totalRefund })).sort((a, b) => b.count - a.count);
    const refundStats = [...byRefundMap.entries()].map(([_id, v]) => ({ _id: _id === 'null' ? null : _id, count: v.count, total: v.total }));

    return res.json({
      success: true,
      byReason: stats,
      byRefundStatus: refundStats,
      totalCancellations: stats.reduce((sum, s) => sum + s.count, 0),
    });
  } catch (error: any) {
    logger.error('Erro ao buscar estatísticas de cancelamentos', error as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
