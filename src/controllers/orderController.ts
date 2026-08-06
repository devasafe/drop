import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery } from '../repositories/delivery.repository';

import { calculateRoute, calculateDistance } from '../services/routeCalculator';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';


import notifier from '../services/notifier';
import logger from '../config/logger';
import {
  emitOrderCreated,
  emitOrderStatusChanged,
  emitDeliveryCreated,
  emitToRoom,
} from '../utils/socketEmitter';
import {
  calculateOrderDistribution,
  calculateDeliveryFeeWithConfig,
  round2,
} from '../utils/walletCalculations';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { addCommissionToAppCashbox } from './appCashboxController';
import { recordCashboxEntry } from '../repositories/appCashbox.repository';
import walletService from '../services/wallet.prisma.service';
import payoutService from '../services/payout.service';
import { getDefaultAddress } from '../utils/userHelpers';
import { missingClientVerifications } from '../utils/clientVerification';
import { findPendingDebt, updateDebt } from '../repositories/customerDebt.repository';
import { isStoreCurrentlyOpen } from './storeController';
import { computeCouponDiscount } from './couponController';
import { findCouponById, incrementCouponUse } from '../repositories/coupon.repository';
import env from '../config/env';
import { ensureAsaasCustomer, createPixCharge, createCardCharge, getPixQrCode, getPaymentStatus, PixCharge } from '../services/asaas/payment';
import { finalizeWalletPaidOrder, confirmOrderPaidByPayment } from '../services/asaas/orderPayment';

/**
 * Compensa um pedido órfão cuja cobrança (PIX ou cartão) falhou: devolve o
 * estoque decrementado, estorna o saldo de carteira já debitado (se houver) e
 * apaga o pedido inútil. Reutilizado pelo ramo PIX e pelo ramo cartão (DRY).
 */
async function compensateFailedOrder(orderId: string, items: any[], walletApplied: number, customerId: string) {
  try {
    for (const it of items) {
      if (it?.productId && it?.quantity) {
        await prisma.product.updateMany({ where: { id: String(it.productId) }, data: { quantity: { increment: it.quantity } } });
      }
    }
    if (walletApplied > 0) {
      await walletService.credit({ owner: customerId, ownerType: 'user', amount: walletApplied, reason: 'Estorno de saldo — cobrança falhou', category: 'refund', relatedId: orderId });
    }
    await prisma.order.delete({ where: { id: orderId } });
  } catch (compErr) {
    logger.error('Falha ao compensar pedido após erro de cobrança', compErr as Error, { orderId });
  }
}

// Cliente avalia a loja após entrega
export const avaliarLoja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { storeRating, storeComment } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!storeRating || storeRating < 1 || storeRating > 5)
      return res.status(400).json({ error: 'Nota inválida' });

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== userId)
      return res.status(403).json({ error: 'Apenas o cliente pode avaliar' });
    if (order.status !== 'entregue')
      return res.status(400).json({ error: 'Pedido ainda não entregue' });
    if (order.storeRating)
      return res.status(409).json({ error: 'Pedido já avaliado' });

    await prisma.order.update({ where: { id }, data: { storeRating, storeComment } });

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao avaliar loja', err as Error);
    return res.status(500).json({ error: 'Erro ao avaliar loja' });
  }
};

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {

  try {
    const { storeId, products, deliveryDistanceKm, paymentMethod, idempotentKey, address, latitude, longitude, cupomCode, useWalletBalance } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Apenas 'cliente' pode fazer pedidos
    const activeRole = (req.user as any)?.activeRole || req.user?.role;
    if (activeRole !== 'cliente') {
      logger.warn('Tentativa de compra com role inválido', { activeRole, userId: customerId });
      return res.status(403).json({
        error: `Compras não são permitidas para usuários no modo ${activeRole}. Alterne para 'cliente'.`,
      });
    }

    // ❌ COD descontinuado (decisão de design 2026-06-18): todo pedido é pago online.
    // Bloqueia novos pedidos "dinheiro na entrega" — evita o bug #2 (livro-caixa inflado
    // por dinheiro vivo na mão do motoboy sem lastro digital).
    if (paymentMethod === 'cash_on_delivery') {
      return res.status(400).json({
        error: 'Pagamento na entrega foi descontinuado. Use PIX ou cartão.',
        code: 'COD_DISABLED',
      });
    }

    // ✅ GATE KYC (ativável por flag): cliente só compra com email + telefone
    // verificados e documento aprovado. Desligado por padrão para não travar
    // compras antes do frontend de verificação existir — ligue com KYC_ENFORCED=true.
    if (process.env.KYC_ENFORCED === 'true') {
      // Sem `.session(session)`: o User está no Postgres e não participa da transação
      // Mongo. É uma leitura de gate (KYC), não uma escrita — não há o que reverter.
      const buyer = await userRepository.findById(String(customerId));
      const missingKyc = missingClientVerifications(buyer);
      if (missingKyc.length > 0) {
        return res.status(403).json({
          error: 'Conta não verificada. Conclua a verificação para comprar.',
          code: 'ACCOUNT_NOT_VERIFIED',
          missing: missingKyc,
        });
      }
    }

    // Verificar idempotência
    if (idempotentKey) {
      // Order vive no Postgres e não participa da transação Mongo — a checagem de
      // idempotência é uma leitura, sem nada a reverter.
      const existingOrder = await prisma.order.findFirst({
        where: { customerId, idempotentKey },
        include: orderInclude,
      });
      if (existingOrder) {
        return res.status(200).json(toApiOrder(existingOrder));
      }
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Nenhum produto no pedido' });
    }
    if (!storeId) {
      return res.status(400).json({ error: 'Loja não informada' });
    }

    const storeIdStr = String(storeId);

    // Verificar se loja existe e está aberta
    const storeForCheck: any = await prisma.store.findUnique({ where: { id: storeIdStr } });
    if (!storeForCheck) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }
    if (!isStoreCurrentlyOpen(storeForCheck)) {
      return res.status(400).json({ error: 'Loja fechada no momento. Tente novamente quando estiver aberta.' });
    }

    // [Plan1] Verificar plano da loja antes de calcular taxa de entrega
    const storeSub = await findSubByStoreId(storeIdStr);
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlanForOrder = storeSub ? (planNumberMap[(storeSub as any).currentPlan] ?? 1) : 1; // default Plan 1

    // Validar produtos e decrementar estoque atomicamente
    let subtotal = 0;
    const items: Array<{ productId: any; quantity: number; price: number }> = [];

    for (const p of products) {
      if (!p.productId || !p.quantity) {
        return res.status(400).json({ error: `Produto inválido: ${JSON.stringify(p)}` });
      }

      // Sem `.session(session)`: Product vive no Postgres e não entra na transação Mongo.
      const prod = await prisma.product.findUnique({ where: { id: String(p.productId) } });
      if (!prod) {
        return res.status(404).json({ error: `Produto ${p.productId} não encontrado` });
      }

      // ✅ SEGURANÇA: NUNCA confiar no preço enviado pelo frontend.
      // O preço é SEMPRE o que está no banco de dados (fonte da verdade).
      // `price` é Decimal no Postgres; o Order ainda vive no Mongo com number.
      // Convertemos na fronteira — quando o Order migrar (Fatia 3), a cadeia
      // fica Decimal ponta a ponta e esta conversão sai.
      const productPrice = prod.price.toNumber();
      if (productPrice <= 0) {
        return res.status(400).json({ error: `Produto ${prod.name} com preço inválido` });
      }

      // Decremento atômico com verificação de estoque.
      // O `WHERE quantity >= n` deixa a checagem no banco: sob concorrência o
      // estoque nunca fica negativo, nem transitoriamente (antes o valor era
      // decrementado e só depois conferido).
      const dec = await prisma.product.updateMany({
        where: { id: String(p.productId), quantity: { gte: p.quantity } },
        data: { quantity: { decrement: p.quantity } },
      });

      if (dec.count === 0) {
        // Devolve o que já havia sido decrementado neste pedido. Product está no
        // Postgres e não participa do rollback da transação Mongo — a compensação
        // é explícita (já era assim, agora é obrigatória).
        for (const item of items) {
          await prisma.product.updateMany({ where: { id: String(item.productId) }, data: { quantity: { increment: item.quantity } } });
        }
        const current = await prisma.product.findUnique({ where: { id: String(p.productId) }, select: { quantity: true } });
        const available = current?.quantity ?? 0;
        return res.status(409).json({
          error: `Estoque insuficiente para ${prod.name}. Disponível: ${available}.`,
        });
      }

      subtotal += productPrice * p.quantity;
      items.push({ productId: prod.id, quantity: p.quantity, price: productPrice });
    }

    if (subtotal <= 0) {
      return res.status(400).json({ error: 'Subtotal inválido' });
    }

    // Aplicar cupom de desconto (se informado)
    let couponDiscount = 0;
    let couponType: 'store' | 'global' | null = null;
    let appliedCouponId: any = null;
    if (cupomCode) {
      const couponResult = await computeCouponDiscount(cupomCode, storeIdStr, subtotal);
      if (!couponResult.valid) {
        return res.status(400).json({ error: couponResult.reason || 'Cupom inválido' });
      }
      couponDiscount = couponResult.discount;
      couponType = couponResult.coupon?.type ?? null;
      appliedCouponId = couponResult.coupon?._id;
    }

    // ✅ SEGURANÇA: NUNCA confiar na distância enviada pelo frontend.
    // Calcular server-side (haversine) a partir das coordenadas loja → cliente.
    // Sem coordenadas, a taxa fica 0 (caso degenerado / Plano 1 sem entrega).
    let serverDistanceKm = 0;
    const sLat = Number(storeForCheck.latitude);
    const sLng = Number(storeForCheck.longitude);
    const cLat = Number(latitude);
    const cLng = Number(longitude);
    if ([sLat, sLng, cLat, cLng].every(n => Number.isFinite(n) && n !== 0)) {
      serverDistanceKm = calculateDistance(sLat, sLng, cLat, cLng);
    } else if (deliveryDistanceKm) {
      logger.warn('Pedido sem coordenadas completas — distância do frontend não confiável, usando 0', { storeId: storeIdStr });
    }

    // [Plan1] Loja Plano 1 não tem entrega integrada — taxa sempre zero
    const rawDeliveryFee = await calculateDeliveryFeeWithConfig(serverDistanceKm);
    const deliveryFee = storePlanForOrder === 1 ? 0 : rawDeliveryFee;
    const totalValue = round2(subtotal + deliveryFee - couponDiscount);
    const distribution = await calculateOrderDistribution(subtotal, deliveryFee, storeIdStr, storePlanForOrder === 1 ? 0 : serverDistanceKm);

    // Carteira do cliente (Postgres). NÃO participa da transação Mongo desta função
    // — as escritas de saldo passam pelo walletService (Prisma), que é atômico por si.
    let clientWallet = await walletService.getOrCreate(customerId, 'user');

    const isCashOnDelivery = paymentMethod === 'cash_on_delivery';
    // Fase 2: gateway de entrada. Quando ativo, o fluxo pré-pago (débito de carteira)
    // dá lugar à cobrança real no Asaas (custódia na conta-mãe).
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

    // Asaas processa PIX e cartão de crédito aqui (demais meios seguem indisponíveis).
    if (useAsaas && paymentMethod !== 'pix' && paymentMethod !== 'credit_card') {
      return res.status(400).json({ error: 'No momento apenas PIX ou cartão estão disponíveis.' });
    }

    // Cobrar dívida pendente (apenas para pedidos não-COD)
    let pendingDebt: any = null;
    let debtAmount = 0;
    if (!isCashOnDelivery) {
      pendingDebt = await findPendingDebt(customerId);
      if (pendingDebt) {
        debtAmount = pendingDebt.amount;
      }
    }

    if (!isCashOnDelivery && !useAsaas) {
      // Fluxo pré-pago legado (carteira virtual). Débito atômico via walletService.
      const balance = Number(clientWallet.balance);
      if (balance < totalValue + debtAmount) {
        return res.status(400).json({
          error: 'Saldo insuficiente na carteira',
          available: balance,
          required: totalValue + debtAmount,
          debtIncluded: debtAmount > 0 ? debtAmount : undefined,
        });
      }

      await walletService.debit({
        owner: customerId, ownerType: 'user', amount: totalValue,
        reason: 'Pedido criado', category: 'payment',
        paymentMethod: paymentMethod || 'wallet', relatedId: storeIdStr,
      });
      if (debtAmount > 0) {
        await walletService.debit({
          owner: customerId, ownerType: 'user', amount: debtAmount,
          reason: 'Cobrança de multa de cancelamento tardio pendente',
          category: 'penalty', relatedId: String(pendingDebt._id),
        });
      }

      // --- Custódia: todo o dinheiro entra no AppCashbox ---
      await recordCashboxEntry(prisma, {
        type: 'income', source: 'order_payment', amount: totalValue,
        reason: 'Pagamento de pedido (custódia)',
      });

      // Garantir a carteira da loja (pra receber o payout).
      await walletService.getOrCreate(storeIdStr, 'store');

      // Dívida pendente: credita a loja de origem e marca como collected.
      if (pendingDebt && debtAmount > 0) {
        const debtSourceOrder = await prisma.order.findUnique({ where: { id: String(pendingDebt.sourceOrderId) } });
        if (debtSourceOrder) {
          await walletService.credit({
            owner: String(debtSourceOrder.storeId), ownerType: 'store', amount: debtAmount,
            reason: 'Reembolso de multa de cancelamento tardio pago pelo cliente',
            category: 'transfer', relatedId: String(pendingDebt._id),
          });
        }
        pendingDebt = await updateDebt(pendingDebt._id, { status: 'collected', collectedAt: new Date() });
      }
    }

    // ✅ Saldo da carteira abatendo o total (só no fluxo Asaas). Debita o saldo e o
    // restante vai pra cobrança PIX. O dinheiro do saldo (cashback/recarga) já está
    // na conta-mãe, então cobre o repasse na entrega.
    let walletApplied = 0;
    const clientBalance = Number(clientWallet.balance);
    if (useAsaas && useWalletBalance && clientBalance > 0) {
      walletApplied = round2(Math.min(clientBalance, totalValue));
      await walletService.debit({
        owner: customerId, ownerType: 'user', amount: walletApplied,
        reason: 'Saldo usado no pedido', category: 'payment', relatedId: storeIdStr,
      });
    }

    // Buscar dados da loja para snapshot no pedido
    const store: any = await prisma.store.findUnique({ where: { id: storeIdStr } });
    if (!store) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    // O Order vive no Postgres — criado por ÚLTIMO, depois das escritas Mongo da
    // transação. Se o restante do lado Mongo (Payout/dívida/commit) falhar, o Order
    // é apagado como compensação (mesmo padrão do estoque, Fatia 2). `products[]`
    // virou a tabela relacionada `OrderItem` (nested create).
    const createdOrder = await prisma.order.create({
      data: {
        customerId,
        storeId: storeIdStr,
        items: {
          create: items.map((it) => ({
            productId: String(it.productId),
            quantity: it.quantity,
            price: it.price,
          })),
        },
        totalValue,
        deliveryFee,
        deliveryDistance: serverDistanceKm,
        status: 'criado',
        paymentMethod: (paymentMethod || 'money') as any,
        debtCollected: debtAmount > 0 ? debtAmount : undefined,
        idempotentKey,
        customerAddress: address,
        customerLatitude: latitude ? Number(latitude) : undefined,
        customerLongitude: longitude ? Number(longitude) : undefined,
        storeAddress: store.address,
        storeLatitude: store.latitude ? Number(store.latitude) : undefined,
        storeLongitude: store.longitude ? Number(store.longitude) : undefined,
        walletDistribution: isCashOnDelivery ? undefined : {
          storeAmount: distribution.storeAmount,
          appCommission: distribution.product.appCommission,
          commissionPercent: distribution.product.commissionPercent,
        },
        asaasChargeStatus: useAsaas ? 'pending' : 'none',
        walletApplied,
      },
      include: orderInclude,
    });

    try {
      // Criar Payout pending para a loja (será released na entrega).
      // Com Asaas, o Payout nasce só na confirmação do pagamento (webhook), não aqui.
      if (!isCashOnDelivery && !useAsaas && distribution.storeAmount > 0) {
        await payoutService.createPendingPayout({
          recipientType: 'store',
          recipientId: storeIdStr,
          orderId: createdOrder.id,
          amount: distribution.storeAmount,
        });
      }

      if (pendingDebt && debtAmount > 0) {
        await updateDebt(pendingDebt._id, { collectedOrderId: createdOrder.id });
      }

    } catch (commitErr) {
      // Falha após criar o Order no Postgres: desfaz como compensação.
      await prisma.order.delete({ where: { id: createdOrder.id } }).catch(() => { /* nada a fazer */ });
      throw commitErr;
    }

    // A partir daqui o pedido é a forma de API (products[], _id, dinheiro em number).
    // Mutações pós-commit persistem via prisma.order.update e atualizam este objeto.
    const order: any = toApiOrder(createdOrder);

    // Pós-commit: incrementar usedCount do cupom de forma atômica
    // Usa $lt para evitar race condition: se dois pedidos simultâneos passaram na validação,
    // apenas o primeiro incrementará (o segundo verá null e não ultrapassará maxUses).
    if (appliedCouponId) {
      try {
        const couponDoc = await findCouponById(appliedCouponId);
        const counted = await incrementCouponUse(appliedCouponId, couponDoc?.maxUses ?? null);
        if (!counted && couponDoc?.maxUses != null) {
          logger.warn('Cupom esgotado em race condition pós-commit', { couponId: appliedCouponId, orderId: order._id });
        }
        // Se cupom global: registrar desconto dado como saída do caixa do app
        if (couponType === 'global' && couponDiscount > 0) {
          await addCommissionToAppCashbox(
            'coupon_discount',
            -couponDiscount,
            order._id.toString(),
            undefined,
            `Desconto de cupom global: ${cupomCode}`
          );
        }
      } catch (err) {
        logger.error('Erro ao atualizar uso do cupom', err as Error);
      }
    }

    logger.info('Pedido criado com sucesso', {
      orderId: order._id,
      totalValue,
      storeAmount: distribution.storeAmount,
      appCommission: distribution.product.appCommission,
    });

    // Pós-commit: calcular rota (não crítico)
    if (order.storeLatitude && order.storeLongitude && order.customerLatitude && order.customerLongitude) {
      try {
        const routeResult = await calculateRoute(
          order.storeLatitude,
          order.storeLongitude,
          order.customerLatitude,
          order.customerLongitude,
          'Loja: ' + (store.name || ''),
          'Cliente: ' + (address || '')
        );
        if (routeResult) {
          order.routePolyline = routeResult.polyline;
          order.routeWaypoints = routeResult.waypoints;
          await prisma.order.update({
            where: { id: order.id },
            data: { routePolyline: routeResult.polyline, routeWaypoints: routeResult.waypoints as any },
          });
        }
      } catch (err) {
        logger.warn('Não foi possível calcular rota', { orderId: order._id });
      }
    }

    // NOTA: Comissão do AppCashbox agora está incluída no crédito total
    // feito dentro da transação (order_payment). Não é mais necessário
    // chamar addCommissionToAppCashbox separadamente.

    // Com Asaas, o pedido só notifica a loja DEPOIS do pagamento confirmado (webhook).
    // No fluxo legado (pré-pago), notifica na hora.
    if (!useAsaas) emitOrderCreated(order);

    // Registrar transação (pagamento via carteira já debitado acima)
    // Status permanece 'criado' até a loja aceitar o pedido
    if (paymentMethod) {
      await prisma.transaction.create({
        data: {
          orderId: String(order.id),
          paymentMethod,
          amount: totalValue,
          commissionProduct: distribution.product.appCommission,
          commissionDelivery: distribution.delivery?.appCommission ?? 0, // [Plan1] delivery é undefined no Plano 1
        },
      });
    }

    // Fase 2: cobrança PIX no Asaas (chamada externa — fora da transação).
    let pixCharge: PixCharge | null = null;
    if (useAsaas) {
      const chargeAmount = round2(totalValue - walletApplied);

      if (chargeAmount <= 0) {
        // Pago 100% com saldo da carteira — confirma na hora, sem PIX.
        await finalizeWalletPaidOrder(String(order.id));
        order.paymentStatus = 'paid';
        order.asaasChargeStatus = 'none';
      } else if (paymentMethod === 'credit_card') {
        // NUNCA logar `req.body.card`/`req.body.cardHolder` — só id do pedido/erro.
        const { card, cardHolder } = req.body as any;
        const asaasCustomerId = await ensureAsaasCustomer(String(customerId));
        if (!asaasCustomerId) {
          logger.error('Falha ao iniciar pagamento com cartão (cliente Asaas indisponível)', undefined, { orderId: order.id });
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' });
        }
        let cardResult;
        try {
          cardResult = await createCardCharge({
            customerId: asaasCustomerId, value: chargeAmount, orderId: String(order.id),
            remoteIp: req.ip || '', description: `Pedido em ${store.name || 'loja'}`,
            card, holder: cardHolder,
          });
        } catch (cardErr: any) {
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          const detail = cardErr?.errors?.[0]?.description || cardErr?.message || 'cartão recusado';
          logger.error('Cartão recusado/erro', cardErr as Error, { orderId: order.id }); // NUNCA logar card
          return res.status(402).json({ error: 'Pagamento com cartão recusado.', detail });
        }
        order.asaasPaymentId = cardResult.paymentId;
        await prisma.order.update({ where: { id: order.id }, data: { asaasPaymentId: cardResult.paymentId } });
        const approved = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(cardResult.status);
        if (approved) {
          await confirmOrderPaidByPayment(cardResult.paymentId, cardResult.status);
          order.paymentStatus = 'paid';
        }
        return res.status(201).json({ order, card: { status: cardResult.status, approved } });
      } else {
        const buildCharge = (cid: string) => createPixCharge({
          customerId: cid, value: chargeAmount, orderId: String(order.id), description: `Pedido em ${store.name || 'loja'}`,
        });
        try {
          let asaasCustomerId = await ensureAsaasCustomer(String(customerId));
          if (!asaasCustomerId) throw new Error('Cliente Asaas não pôde ser criado');
          try {
            pixCharge = await buildCharge(asaasCustomerId);
          } catch (firstErr) {
            // Cliente Asaas pode estar obsoleto (ex: troca da conta-mãe Asaas) — o id
            // cacheado não existe na conta nova. Recria o cliente e tenta 1x.
            logger.warn('1ª cobrança falhou — recriando cliente Asaas e tentando novamente', { orderId: order._id });
            // `asaas` é JSONB: não há `$unset` de subcampo — lemos, removemos a chave e regravamos.
            const stale = await prisma.user.findUnique({ where: { id: String(customerId) }, select: { asaas: true } });
            const asaasData = { ...((stale?.asaas as any) ?? {}) };
            delete asaasData.customerId;
            await prisma.user.update({ where: { id: String(customerId) }, data: { asaas: asaasData } });
            asaasCustomerId = await ensureAsaasCustomer(String(customerId));
            if (!asaasCustomerId) throw firstErr;
            pixCharge = await buildCharge(asaasCustomerId);
          }
          order.asaasPaymentId = pixCharge.paymentId;
          await prisma.order.update({ where: { id: order.id }, data: { asaasPaymentId: pixCharge.paymentId } });
        } catch (chargeErr: any) {
          logger.error('Falha ao gerar cobrança PIX', chargeErr as Error, { orderId: order.id });
          // Compensação: pedido + baixa de estoque + saldo já foram commitados. Sem cobrança,
          // o pedido é inútil — devolve estoque, devolve o saldo usado e apaga o pedido órfão.
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          const detail = chargeErr?.errors?.[0]?.description || chargeErr?.message || 'erro desconhecido';
          return res.status(502).json({ error: 'Falha ao gerar a cobrança PIX. Tente novamente.', detail });
        }
      }
    }

    return res.status(201).json(useAsaas ? { order, pix: pixCharge } : order);

  } catch (err: any) {
    logger.error('Erro ao criar pedido', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// GET /orders/:id/pix — retoma o pagamento PIX de um pedido pendente (Fase 2/B)
export const getOrderPix = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== String(userId)) return res.status(403).json({ error: 'Sem permissão' });

    if (order.paymentStatus === 'paid') return res.json({ paid: true });
    if (!order.asaasPaymentId) return res.status(400).json({ error: 'Pedido sem cobrança PIX' });
    if (['cancelado', 'rejeitado'].includes(order.status)) {
      return res.status(409).json({ error: 'Pedido cancelado — cobrança não disponível' });
    }

    // Reconciliação independente do webhook: pergunta ao Asaas o status real da
    // cobrança. Se já foi paga, confirma na hora (não depende do webhook chegar) —
    // assim o checkout aprova o pagamento mesmo que o webhook esteja mal configurado.
    try {
      const asaasStatus = await getPaymentStatus(order.asaasPaymentId);
      if (asaasStatus && ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(asaasStatus)) {
        await confirmOrderPaidByPayment(order.asaasPaymentId, asaasStatus);
        return res.json({ paid: true });
      }
    } catch (e) {
      logger.warn('Falha na reconciliação de pagamento PIX (segue mostrando o QR)');
    }

    try {
      const qr = await getPixQrCode(order.asaasPaymentId);
      return res.json({ paid: false, orderId: String(order.id), ...qr });
    } catch {
      return res.status(502).json({ error: 'Não foi possível obter a cobrança PIX' });
    }
  } catch (err) {
    logger.error('Erro ao obter PIX do pedido', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const listOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [rawOrders, total] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: orderInclude,
      }),
      prisma.order.count({ where: { customerId: userId } }),
    ]);
    // Reconstrói a forma de API (products[], _id, dinheiro em number).
    const orders = rawOrders.map(toApiOrder);

    // Coletar IDs únicos para batch queries (evita N+1)
    const storeIds = [...new Set(orders.map(o => o.storeId?.toString()).filter(Boolean))];
    const productIds = [...new Set(orders.flatMap(o => (o.products || []).map((p: any) => p.productId?.toString()).filter(Boolean)))];

    const [stores, productsData] = await Promise.all([
      prisma.store.findMany({ where: { id: { in: storeIds.map(String) } }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { id: { in: productIds.map(String) } }, select: { id: true, name: true, image: true } }),
    ]);

    const storeMap = new Map(stores.map(s => [s.id, s]));
    const productMap = new Map(productsData.map(p => [p.id, p]));

    const enrichedOrders = orders.map(o => {
      const storeObj = storeMap.get(o.storeId?.toString() ?? '');
      const productsWithNames = (o.products || []).map((prod: any) => {
        const productObj = productMap.get(prod.productId?.toString() ?? '');
        return {
          ...prod,
          productName: productObj?.name ?? 'Produto removido',
          image: productObj?.image ?? null,
        };
      });
      return {
        ...o,
        storeName: storeObj?.name ?? 'Loja removida',
        products: productsWithNames,
      };
    });

    return res.json({
      orders: enrichedOrders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Erro ao listar pedidos', err);
    return res.status(500).json({ error: 'Failed to list orders' });
  }
};

export const getOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const order = toApiOrder(await prisma.order.findUnique({ where: { id }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Carregar dados relacionados em paralelo
    const [delivery, customerObj, storeObj, productsData] = await Promise.all([
      // Sem `.populate('motoboyId')`: o motoboy é um User, que agora vive no Postgres.
      // O nome é resolvido logo abaixo, num lookup explícito.
      order.deliveryId ? prisma.delivery.findUnique({ where: { id: String(order.deliveryId) } }) : null,
      order.customerId ? userRepository.findById(String(order.customerId)) : null,
      order.storeId ? prisma.store.findUnique({ where: { id: String(order.storeId) } }) : null,
      order.products?.length
        ? prisma.product.findMany({ where: { id: { in: order.products.map((p: any) => String(p.productId)) } }, select: { id: true, name: true, image: true } })
        : [],
    ]);

    // Verificar permissão de acesso
    const userRole = (req.user as any)?.activeRole || (req.user as any)?.role;
    const isAdmin = userRole === 'ceo' || userRole === 'admin';
    const isCustomer = order.customerId.toString() === userId;
    const isStoreOwner = storeObj && (storeObj as any).ownerId?.toString() === userId;

    if (!isCustomer && !isStoreOwner && !isAdmin) {
      return res.status(403).json({ error: 'Sem permissão para acessar este pedido' });
    }

    const productMap = new Map((productsData as any[]).map((p: any) => [String(p.id), p]));
    const productsWithNames = (order.products || []).map((prod: any) => {
      const productObj = productMap.get(prod.productId?.toString() ?? '');
      return {
        ...prod,
        productName: (productObj as any)?.name ?? 'Produto removido',
        image: (productObj as any)?.image ?? null,
      };
    });

    const motoboyId = (delivery as any)?.motoboyId;
    const motoboy = motoboyId
      ? await prisma.user.findUnique({ where: { id: String(motoboyId) }, select: { name: true } })
      : null;
    const motoboyName = motoboy?.name;

    return res.json({
      ...order,
      products: productsWithNames,
      delivery: delivery ? { ...toApiDelivery(delivery), motoboyName } : null,
      storeName: (storeObj as any)?.name ?? 'Loja removida',
      storeObj: storeObj ? {
        name: (storeObj as any).name,
        address: (storeObj as any).address,
        latitude: (storeObj as any).latitude,
        longitude: (storeObj as any).longitude,
      } : null,
      customerName: (customerObj as any)?.name ?? 'Cliente',
      customerObj: customerObj ? {
        name: (customerObj as any).name,
        email: (customerObj as any).email,
        mainAddress: getDefaultAddress(customerObj as any),
        addresses: (customerObj as any).addresses,
      } : null,
    });
  } catch (err: any) {
    logger.error('Erro ao obter pedido', err);
    return res.status(500).json({ error: 'Erro ao obter pedido: ' + (err?.message || 'desconhecido') });
  }
};

export const acceptOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { distance } = req.body;

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const store: any = await prisma.store.findUnique({ where: { id: String(order.storeId) } });
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can accept order' });
    }

    // Resolver plano real da loja via StoreSubscription (source of truth)
    const storeSub = await findSubByStoreId(store.id);
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planNumberMap[storeSub.currentPlan] ?? 1) : (store.plan ?? 1); // default Plan 1

    // [Plan1] Lojas no Plano 1 (Vitrine) não usam motoboy integrado
    if (storePlan === 1) {
      console.log(`[Plan1] Pedido ${order.id} — loja ${store.id} é Plano 1 (Vitrine). Aceitando sem criar Delivery.`);
      order.status = 'pago';
      await prisma.order.update({ where: { id: order.id }, data: { status: 'pago' } });
      emitOrderStatusChanged(order);
      emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
        orderId: order._id.toString(),
        status: 'pago',
        message: 'Loja aceitou seu pedido! Retire ou combine a entrega diretamente com a loja.',
      });
      emitToRoom(`store:${order.storeId}`, 'order:accepted_confirmation', {
        orderId: order._id.toString(),
        status: 'pago',
      });
      return res.status(200).json({ order, requiresDelivery: false });
    }

    // Evitar criação duplicada de delivery
    const existingDelivery = await prisma.delivery.findFirst({ where: { orderId: order.id } });
    if (existingDelivery) return res.json(existingDelivery);

    const distanceNum = Math.max(0, Number(distance || 0));
    const fee = await calculateDeliveryFeeWithConfig(distanceNum);

    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id,
        distance: distanceNum,
        fee,
        status: 'pending',
        customerAddress: order.customerAddress,
        customerLatitude: order.customerLatitude,
        customerLongitude: order.customerLongitude,
        storeAddress: order.storeAddress,
        storeLatitude: order.storeLatitude,
        storeLongitude: order.storeLongitude,
      },
    });

    logger.info('Delivery criado ao aceitar pedido', { deliveryId: delivery.id, orderId: order._id });

    // Registrar comissão de entrega no AppCashbox
    try {
      const productTotal = (order.products || []).reduce(
        (sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0
      );
      const distribution = await calculateOrderDistribution(
        productTotal, fee, String(order.storeId), distanceNum
      );
      if (order.paymentMethod === 'cash_on_delivery' && distribution.delivery) {
        await addCommissionToAppCashbox(
          'delivery_commission',
          distribution.delivery.appCommission,
          order.id,
          delivery.id,
          'Comissão de entrega'
        );
      }
    } catch (err) {
      logger.error('Erro ao registrar comissão de entrega no AppCashbox', err as Error, { orderId: order.id });
    }

    order.status = 'aguardando_motoboy';
    order.deliveryId = String(delivery.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'aguardando_motoboy', deliveryId: String(delivery.id) },
    });

    // Notificar partes envolvidas
    emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
      orderId: order._id.toString(),
      deliveryId: delivery.id,
      status: 'pago',
      message: 'Loja aceitou seu pedido! Aguardando motoboy...',
    });
    emitToRoom(`store:${order.storeId}`, 'order:accepted_confirmation', {
      orderId: order._id.toString(),
      deliveryId: delivery.id,
      status: 'aguardando_motoboy',
    });
    emitDeliveryCreated(delivery);

    try {
      notifier.notifyMotoboys({
        type: 'new_delivery',
        delivery: { id: delivery.id, orderId: delivery.orderId.toString(), fee: delivery.fee, distance: delivery.distance },
      });
    } catch (err) {
      logger.warn('Falha ao enviar push notification para motoboys', { orderId: order._id });
    }

    return res.status(201).json(delivery);
  } catch (err) {
    logger.error('Erro ao aceitar pedido', err as Error);
    return res.status(500).json({ error: 'Failed to accept order' });
  }
};

// Cliente do Plano 1 confirma que recebeu o produto
export const deliverPlan1Order = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ error: 'Não autenticado' });

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (String(order.customerId) !== customerId) {
      return res.status(403).json({ error: 'Apenas o cliente do pedido pode confirmar recebimento' });
    }

    if (order.status !== 'pago') {
      return res.status(400).json({ error: `Pedido no estado '${order.status}' não pode ser confirmado como recebido` });
    }

    const store: any = await prisma.store.findUnique({ where: { id: String(order.storeId) } });
    const storeSub = store ? await findSubByStoreId(store.id) : null;
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planMap[(storeSub as any).currentPlan] ?? 1) : (store?.plan ?? 1);
    if (storePlan !== 1) {
      return res.status(400).json({ error: 'Apenas pedidos de lojas Plano 1 usam este endpoint' });
    }

    order.status = 'entregue';
    await prisma.order.update({ where: { id: order.id }, data: { status: 'entregue' } });

    emitOrderStatusChanged(order);
    emitToRoom(`store:${order.storeId}`, 'order:delivered_confirmation', { orderId: order.id });

    return res.json({ order });
  } catch (err: any) {
    logger.error('Erro ao confirmar recebimento Plano 1', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

export const updatePaymentStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, paymentStatus } = req.body;
    const userId = req.user?.id;
    const role = (req.user as any)?.activeRole || req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Forbidden - insufficient role' });
    }
    if (!['pending', 'paid', 'failed', 'refunded'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Status de pagamento inválido' });
    }

    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) return res.status(404).json({ error: 'Pedido não encontrado' });

    // CEO já autorizado acima — pode ajustar o status de pagamento de qualquer pedido
    // (endpoint temporário até a integração do gateway de pagamento).
    const newStatus = (paymentStatus === 'paid' && existing.status === 'criado') ? 'pago' : existing.status;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus, status: newStatus },
      include: orderInclude,
    });

    return res.json({ message: `Status de pagamento alterado para ${paymentStatus}`, order: toApiOrder(updated) });
  } catch (err: any) {
    logger.error('Erro ao alterar status de pagamento', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
