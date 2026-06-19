import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../types';
import Order from '../models/Order';
import Store from '../models/Store';
import { calculateRoute, calculateDistance } from '../services/routeCalculator';
import User from '../models/User';
import Product from '../models/Product';
import Transaction from '../models/Transaction';
import Delivery from '../models/Delivery';
import Wallet from '../models/Wallet';
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
import StoreSubscription from '../models/StoreSubscription';
import { addCommissionToAppCashbox } from './appCashboxController';
import AppCashbox from '../models/AppCashbox';
import payoutService from '../services/payout.service';
import { getDefaultAddress } from '../utils/userHelpers';
import { missingClientVerifications } from '../utils/clientVerification';
import CustomerDebt from '../models/CustomerDebt';
import { isStoreCurrentlyOpen } from './storeController';
import { computeCouponDiscount } from './couponController';
import Coupon from '../models/Coupon';
import env from '../config/env';
import { ensureAsaasCustomer, createPixCharge, getPixQrCode, PixCharge } from '../services/asaas/payment';

// Cliente avalia a loja após entrega
export const avaliarLoja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { storeRating, storeComment } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!storeRating || storeRating < 1 || storeRating > 5)
      return res.status(400).json({ error: 'Nota inválida' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (order.customerId.toString() !== userId)
      return res.status(403).json({ error: 'Apenas o cliente pode avaliar' });
    if (order.status !== 'entregue')
      return res.status(400).json({ error: 'Pedido ainda não entregue' });
    if (order.storeRating)
      return res.status(409).json({ error: 'Pedido já avaliado' });

    order.storeRating = storeRating;
    order.storeComment = storeComment;
    await order.save();

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao avaliar loja', err as Error);
    return res.status(500).json({ error: 'Erro ao avaliar loja' });
  }
};

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { storeId, products, deliveryDistanceKm, paymentMethod, idempotentKey, address, latitude, longitude, cupomCode } = req.body;
    const customerId = req.user?.id;

    if (!customerId) {
      await session.abortTransaction();
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Apenas 'cliente' pode fazer pedidos
    const activeRole = (req.user as any)?.activeRole || req.user?.role;
    if (activeRole !== 'cliente') {
      await session.abortTransaction();
      logger.warn('Tentativa de compra com role inválido', { activeRole, userId: customerId });
      return res.status(403).json({
        error: `Compras não são permitidas para usuários no modo ${activeRole}. Alterne para 'cliente'.`,
      });
    }

    // ❌ COD descontinuado (decisão de design 2026-06-18): todo pedido é pago online.
    // Bloqueia novos pedidos "dinheiro na entrega" — evita o bug #2 (livro-caixa inflado
    // por dinheiro vivo na mão do motoboy sem lastro digital).
    if (paymentMethod === 'cash_on_delivery') {
      await session.abortTransaction();
      return res.status(400).json({
        error: 'Pagamento na entrega foi descontinuado. Use PIX ou cartão.',
        code: 'COD_DISABLED',
      });
    }

    // ✅ GATE KYC (ativável por flag): cliente só compra com email + telefone
    // verificados e documento aprovado. Desligado por padrão para não travar
    // compras antes do frontend de verificação existir — ligue com KYC_ENFORCED=true.
    if (process.env.KYC_ENFORCED === 'true') {
      const buyer = await User.findById(customerId).select('verification').session(session);
      const missingKyc = missingClientVerifications(buyer);
      if (missingKyc.length > 0) {
        await session.abortTransaction();
        return res.status(403).json({
          error: 'Conta não verificada. Conclua a verificação para comprar.',
          code: 'ACCOUNT_NOT_VERIFIED',
          missing: missingKyc,
        });
      }
    }

    // Verificar idempotência
    if (idempotentKey) {
      const existingOrder = await Order.findOne({ customerId, idempotentKey }).session(session);
      if (existingOrder) {
        await session.abortTransaction();
        return res.status(200).json(existingOrder);
      }
    }

    if (!Array.isArray(products) || products.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Nenhum produto no pedido' });
    }
    if (!storeId) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Loja não informada' });
    }

    const storeIdStr = String(storeId);

    // Verificar se loja existe e está aberta
    const storeForCheck = await Store.findById(storeIdStr);
    if (!storeForCheck) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Loja não encontrada' });
    }
    if (!isStoreCurrentlyOpen(storeForCheck)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Loja fechada no momento. Tente novamente quando estiver aberta.' });
    }

    // [Plan1] Verificar plano da loja antes de calcular taxa de entrega
    const storeSub = await StoreSubscription.findOne({ storeId: storeIdStr }).lean();
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlanForOrder = storeSub ? (planNumberMap[(storeSub as any).currentPlan] ?? 1) : 1; // default Plan 1

    // Validar produtos e decrementar estoque atomicamente
    let subtotal = 0;
    const items: Array<{ productId: any; quantity: number; price: number }> = [];

    for (const p of products) {
      if (!p.productId || !p.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Produto inválido: ${JSON.stringify(p)}` });
      }

      const prod = await Product.findById(p.productId).session(session);
      if (!prod) {
        await session.abortTransaction();
        return res.status(404).json({ error: `Produto ${p.productId} não encontrado` });
      }

      // ✅ SEGURANÇA: NUNCA confiar no preço enviado pelo frontend.
      // O preço é SEMPRE o que está no banco de dados (fonte da verdade).
      const productPrice = prod.price;
      if (productPrice <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Produto ${prod.name} com preço inválido` });
      }

      // Decremento atômico com verificação de estoque
      const updated = await Product.findByIdAndUpdate(
        p.productId,
        { $inc: { quantity: -p.quantity } },
        { new: true, session }
      );

      if (!updated || updated.quantity < 0) {
        // Reverter decrementos anteriores dentro da transação
        for (const item of items) {
          await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity } }, { session });
        }
        await session.abortTransaction();
        const available = (updated?.quantity ?? 0) + p.quantity;
        return res.status(409).json({
          error: `Estoque insuficiente para ${prod.name}. Disponível: ${available}.`,
        });
      }

      subtotal += productPrice * p.quantity;
      items.push({ productId: prod._id, quantity: p.quantity, price: productPrice });
    }

    if (subtotal <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Subtotal inválido' });
    }

    // Aplicar cupom de desconto (se informado)
    let couponDiscount = 0;
    let couponType: 'store' | 'global' | null = null;
    let appliedCouponId: any = null;
    if (cupomCode) {
      const couponResult = await computeCouponDiscount(cupomCode, storeIdStr, subtotal);
      if (!couponResult.valid) {
        await session.abortTransaction();
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

    // Verificar e debitar carteira do cliente
    let clientWallet = await Wallet.findOne({ owner: customerId, ownerType: 'user' }).session(session);
    if (!clientWallet) {
      clientWallet = await new Wallet({
        owner: customerId,
        ownerType: 'user',
        balance: 0,
        totalIncome: 0,
        totalSpent: 0,
        history: [],
      }).save({ session });
    }

    const isCashOnDelivery = paymentMethod === 'cash_on_delivery';
    // Fase 2: gateway de entrada. Quando ativo, o fluxo pré-pago (débito de carteira)
    // dá lugar à cobrança real no Asaas (custódia na conta-mãe).
    const useAsaas = env.PAYMENT_GATEWAY === 'asaas';

    // Por enquanto o Asaas só processa PIX aqui (cartão entra na Fase 6).
    if (useAsaas && paymentMethod !== 'pix') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No momento apenas PIX está disponível. Cartão em breve.' });
    }

    // Cobrar dívida pendente (apenas para pedidos não-COD)
    let pendingDebt: any = null;
    let debtAmount = 0;
    if (!isCashOnDelivery) {
      pendingDebt = await CustomerDebt.findOne({ customerId, status: 'pending' }).session(session);
      if (pendingDebt) {
        debtAmount = pendingDebt.amount;
      }
    }

    if (!isCashOnDelivery && !useAsaas) {
      if (clientWallet.balance < totalValue + debtAmount) {
        await session.abortTransaction();
        return res.status(400).json({
          error: 'Saldo insuficiente na carteira',
          available: clientWallet.balance,
          required: totalValue + debtAmount,
          debtIncluded: debtAmount > 0 ? debtAmount : undefined,
        });
      }

      clientWallet.balance -= (totalValue + debtAmount);
      clientWallet.totalSpent += (totalValue + debtAmount);
      clientWallet.history.push({
        date: new Date(),
        type: 'debit',
        category: 'payment',
        amount: totalValue,
        reason: 'Pedido criado',
        paymentMethod: paymentMethod || 'wallet',
        relatedId: storeIdStr,
      });

      if (debtAmount > 0) {
        clientWallet.history.push({
          date: new Date(),
          type: 'debit',
          category: 'penalty',
          amount: debtAmount,
          reason: 'Cobrança de multa de cancelamento tardio pendente',
          relatedId: pendingDebt._id.toString(),
        });
      }

      await clientWallet.save({ session });
    }

    if (!isCashOnDelivery && !useAsaas) {
      // --- NOVO FLUXO: Todo dinheiro entra no AppCashbox (custódia) ---
      // Creditar AppCashbox com valor total do pedido
      let appCashbox = await AppCashbox.findOne().session(session);
      if (!appCashbox) {
        appCashbox = await AppCashbox.create([{
          balance: totalValue,
          totalIncome: totalValue,
          totalExpenses: 0,
          history: [{
            type: 'income',
            source: 'order_payment',
            amount: totalValue,
            orderId: 'pending', // será atualizado após order.save
            reason: 'Pagamento de pedido (custódia)',
            date: new Date(),
          }],
        }], { session }).then(docs => docs[0]);
      } else {
        appCashbox.balance += totalValue;
        appCashbox.totalIncome += totalValue;
        appCashbox.history.push({
          type: 'income',
          source: 'order_payment',
          amount: totalValue,
          orderId: 'pending',
          reason: 'Pagamento de pedido (custódia)',
          date: new Date(),
        });
        await appCashbox.save({ session });
      }

      // Garantir que a wallet da loja exista (pra receber o payout)
      let storeWallet = await Wallet.findOne({ owner: storeIdStr, ownerType: 'store' }).session(session);
      if (!storeWallet) {
        storeWallet = await new Wallet({
          owner: storeIdStr,
          ownerType: 'store',
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          availableBalance: 0,
          pendingBalance: 0,
          history: [],
        }).save({ session });
      }

      // Se havia dívida pendente, creditar a loja de origem e marcar como collected
      if (pendingDebt && debtAmount > 0) {
        const debtSourceOrder = await Order.findById(pendingDebt.sourceOrderId).session(session);
        if (debtSourceOrder) {
          const debtStoreWallet = await Wallet.findOne({
            owner: debtSourceOrder.storeId.toString(),
            ownerType: 'store',
          }).session(session);
          if (debtStoreWallet) {
            debtStoreWallet.balance += debtAmount;
            debtStoreWallet.totalIncome += debtAmount;
            debtStoreWallet.history.push({
              date: new Date(),
              type: 'credit',
              category: 'transfer',
              amount: debtAmount,
              reason: 'Reembolso de multa de cancelamento tardio pago pelo cliente',
              relatedId: pendingDebt._id.toString(),
            });
            await debtStoreWallet.save({ session });
          }
        }
        pendingDebt.status = 'collected';
        pendingDebt.collectedAt = new Date();
        await pendingDebt.save({ session });
      }
    }

    // Buscar dados da loja para snapshot no pedido
    const store = await Store.findById(storeIdStr).session(session);
    if (!store) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const order = new Order({
      customerId,
      storeId: storeIdStr,
      products: items,
      totalValue,
      deliveryFee,
      deliveryDistance: serverDistanceKm,
      status: 'criado',
      paymentMethod: paymentMethod || 'money',
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
    });

    await order.save({ session });

    // Criar Payout pending para a loja (será released na entrega).
    // Com Asaas, o Payout nasce só na confirmação do pagamento (webhook), não aqui.
    if (!isCashOnDelivery && !useAsaas && distribution.storeAmount > 0) {
      await payoutService.createPendingPayout({
        recipientType: 'store',
        recipientId: storeIdStr,
        orderId: order._id.toString(),
        amount: distribution.storeAmount,
        session,
      });
    }

    if (pendingDebt && debtAmount > 0) {
      pendingDebt.collectedOrderId = order._id;
      await pendingDebt.save({ session });
    }

    await session.commitTransaction();

    // Pós-commit: incrementar usedCount do cupom de forma atômica
    // Usa $lt para evitar race condition: se dois pedidos simultâneos passaram na validação,
    // apenas o primeiro incrementará (o segundo verá null e não ultrapassará maxUses).
    if (appliedCouponId) {
      try {
        const couponDoc = await Coupon.findById(appliedCouponId).select('maxUses').lean();
        const filter: any = { _id: appliedCouponId };
        if (couponDoc?.maxUses != null) {
          filter.usedCount = { $lt: couponDoc.maxUses };
        }
        const updated = await Coupon.findOneAndUpdate(filter, { $inc: { usedCount: 1 } });
        if (!updated && couponDoc?.maxUses != null) {
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
          await order.save();
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
      const transaction = new Transaction({
        orderId: order._id,
        paymentMethod,
        amount: totalValue,
        commissionProduct: distribution.product.appCommission,
        commissionDelivery: distribution.delivery?.appCommission ?? 0, // [Plan1] delivery é undefined no Plano 1
      });
      await transaction.save();
    }

    // Fase 2: cobrança PIX no Asaas (chamada externa — fora da transação).
    let pixCharge: PixCharge | null = null;
    if (useAsaas) {
      try {
        const asaasCustomerId = await ensureAsaasCustomer(String(customerId));
        if (!asaasCustomerId) throw new Error('Cliente Asaas não pôde ser criado');
        pixCharge = await createPixCharge({
          customerId: asaasCustomerId,
          value: totalValue,
          orderId: String(order._id),
          description: `Pedido em ${store.name || 'loja'}`,
        });
        order.asaasPaymentId = pixCharge.paymentId;
        await order.save();
      } catch (chargeErr: any) {
        logger.error('Falha ao gerar cobrança PIX', chargeErr as Error, { orderId: order._id });
        // Compensação: o pedido e a baixa de estoque já foram commitados. Sem a cobrança,
        // o pedido é inútil — devolve o estoque e apaga o pedido órfão pra não travar nada.
        try {
          for (const it of items) {
            if ((it as any).productId && (it as any).quantity) {
              await Product.findByIdAndUpdate((it as any).productId, { $inc: { quantity: (it as any).quantity } });
            }
          }
          await Order.deleteOne({ _id: order._id });
        } catch (compErr) {
          logger.error('Falha ao compensar pedido após erro de cobrança', compErr as Error, { orderId: order._id });
        }
        // Surfacing do erro REAL do Asaas (errors[].description) p/ diagnóstico.
        const detail = chargeErr?.errors?.[0]?.description || chargeErr?.message || 'erro desconhecido';
        return res.status(502).json({ error: 'Falha ao gerar a cobrança PIX. Tente novamente.', detail });
      }
    }

    return res.status(201).json(useAsaas ? { order, pix: pixCharge } : order);

  } catch (err: any) {
    // Se a transação ainda está ativa, abortar
    if (session.inTransaction()) {
      try { await session.abortTransaction(); } catch { /* ignorar erro de abort */ }
    }
    logger.error('Erro ao criar pedido', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    session.endSession();
  }
};

// GET /orders/:id/pix — retoma o pagamento PIX de um pedido pendente (Fase 2/B)
export const getOrderPix = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (String(order.customerId) !== String(userId)) return res.status(403).json({ error: 'Sem permissão' });

    if (order.paymentStatus === 'paid') return res.json({ paid: true });
    if (!order.asaasPaymentId) return res.status(400).json({ error: 'Pedido sem cobrança PIX' });
    if (['cancelado', 'rejeitado'].includes(order.status)) {
      return res.status(409).json({ error: 'Pedido cancelado — cobrança não disponível' });
    }

    try {
      const qr = await getPixQrCode(order.asaasPaymentId);
      return res.json({ paid: false, orderId: String(order._id), ...qr });
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

    const [orders, total] = await Promise.all([
      Order.find({ customerId: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customerId: userId }),
    ]);

    // Coletar IDs únicos para batch queries (evita N+1)
    const storeIds = [...new Set(orders.map(o => o.storeId?.toString()).filter(Boolean))];
    const productIds = [...new Set(orders.flatMap(o => (o.products || []).map((p: any) => p.productId?.toString()).filter(Boolean)))];

    const [stores, productsData] = await Promise.all([
      Store.find({ _id: { $in: storeIds } }).select('name').lean(),
      Product.find({ _id: { $in: productIds } }).select('name image').lean(),
    ]);

    const storeMap = new Map(stores.map(s => [s._id.toString(), s]));
    const productMap = new Map(productsData.map(p => [p._id.toString(), p]));

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

    const order = await Order.findById(id).lean();
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // Carregar dados relacionados em paralelo
    const [delivery, customerObj, storeObj, productsData] = await Promise.all([
      order.deliveryId
        ? Delivery.findById(order.deliveryId).populate({ path: 'motoboyId', select: 'name' }).lean()
        : null,
      order.customerId ? User.findById(order.customerId).lean() : null,
      order.storeId ? Store.findById(order.storeId).lean() : null,
      order.products?.length
        ? Product.find({ _id: { $in: order.products.map((p: any) => p.productId) } }).select('name image').lean()
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

    const productMap = new Map((productsData as any[]).map((p: any) => [p._id.toString(), p]));
    const productsWithNames = (order.products || []).map((prod: any) => {
      const productObj = productMap.get(prod.productId?.toString() ?? '');
      return {
        ...prod,
        productName: (productObj as any)?.name ?? 'Produto removido',
        image: (productObj as any)?.image ?? null,
      };
    });

    const motoboyName = delivery && (delivery as any).motoboyId
      ? (delivery as any).motoboyId?.name
      : undefined;

    return res.json({
      ...order,
      products: productsWithNames,
      delivery: delivery ? { ...delivery, motoboyName } : null,
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

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const store = await Store.findById(order.storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can accept order' });
    }

    // Resolver plano real da loja via StoreSubscription (source of truth)
    const storeSub = await StoreSubscription.findOne({ storeId: store._id.toString() }).lean();
    const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planNumberMap[storeSub.currentPlan] ?? 1) : (store.plan ?? 1); // default Plan 1

    // [Plan1] Lojas no Plano 1 (Vitrine) não usam motoboy integrado
    if (storePlan === 1) {
      console.log(`[Plan1] Pedido ${order._id} — loja ${store._id} é Plano 1 (Vitrine). Aceitando sem criar Delivery.`);
      order.status = 'pago';
      await order.save();
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
    const existingDelivery = await Delivery.findOne({ orderId: order._id });
    if (existingDelivery) return res.json(existingDelivery);

    const distanceNum = Math.max(0, Number(distance || 0));
    const fee = await calculateDeliveryFeeWithConfig(distanceNum);

    const delivery = await new Delivery({
      orderId: order._id,
      distance: distanceNum,
      fee,
      status: 'pending',
      customerAddress: order.customerAddress,
      customerLatitude: order.customerLatitude,
      customerLongitude: order.customerLongitude,
      storeAddress: order.storeAddress,
      storeLatitude: order.storeLatitude,
      storeLongitude: order.storeLongitude,
    }).save();

    logger.info('Delivery criado ao aceitar pedido', { deliveryId: delivery._id, orderId: order._id });

    // Registrar comissão de entrega no AppCashbox
    try {
      const productTotal = (order.products || []).reduce(
        (sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0
      );
      const distribution = await calculateOrderDistribution(
        productTotal, fee, order.storeId.toString(), distanceNum
      );
      if (order.paymentMethod === 'cash_on_delivery' && distribution.delivery) {
        await addCommissionToAppCashbox(
          'delivery_commission',
          distribution.delivery.appCommission,
          order._id.toString(),
          delivery._id.toString(),
          'Comissão de entrega'
        );
      }
    } catch (err) {
      logger.error('Erro ao registrar comissão de entrega no AppCashbox', err as Error, { orderId: order._id });
    }

    order.status = 'aguardando_motoboy';
    order.deliveryId = delivery._id;
    await order.save();

    // Notificar partes envolvidas
    emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      status: 'pago',
      message: 'Loja aceitou seu pedido! Aguardando motoboy...',
    });
    emitToRoom(`store:${order.storeId}`, 'order:accepted_confirmation', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      status: 'aguardando_motoboy',
    });
    emitDeliveryCreated(delivery);

    try {
      notifier.notifyMotoboys({
        type: 'new_delivery',
        delivery: { id: delivery._id.toString(), orderId: delivery.orderId.toString(), fee: delivery.fee, distance: delivery.distance },
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

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (order.customerId.toString() !== customerId) {
      return res.status(403).json({ error: 'Apenas o cliente do pedido pode confirmar recebimento' });
    }

    if (order.status !== 'pago') {
      return res.status(400).json({ error: `Pedido no estado '${order.status}' não pode ser confirmado como recebido` });
    }

    const store = await Store.findById(order.storeId);
    const storeSub = store ? await StoreSubscription.findOne({ storeId: store._id.toString() }).lean() : null;
    const planMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
    const storePlan = storeSub ? (planMap[(storeSub as any).currentPlan] ?? 1) : (store?.plan ?? 1);
    if (storePlan !== 1) {
      return res.status(400).json({ error: 'Apenas pedidos de lojas Plano 1 usam este endpoint' });
    }

    order.status = 'entregue';
    (order as any).deliveredAt = new Date();
    await order.save();

    emitOrderStatusChanged(order);
    emitToRoom(`store:${order.storeId}`, 'order:delivered_confirmation', { orderId: order._id.toString() });

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

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    // CEO já autorizado acima — pode ajustar o status de pagamento de qualquer pedido
    // (endpoint temporário até a integração do gateway de pagamento).
    order.paymentStatus = paymentStatus;
    if (paymentStatus === 'paid' && order.status === 'criado') {
      order.status = 'pago';
    }
    await order.save();

    return res.json({ message: `Status de pagamento alterado para ${paymentStatus}`, order });
  } catch (err: any) {
    logger.error('Erro ao alterar status de pagamento', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
