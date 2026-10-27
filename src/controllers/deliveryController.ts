import { Response } from 'express';
import { motoboyCancellationCompensation } from '../services/motoboyCompensation';
import { AuthenticatedRequest } from '../types';
import { recordCashboxEntry } from '../repositories/appCashbox.repository';


import { prisma } from '../lib/prisma';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, persistDelivery, serializeDeliveryFor, stripDeliveryPins, clearDeliveryPins } from '../repositories/delivery.repository';
import userRepository from '../repositories/user.repository';


import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { customerAbsentWaitMinutes, customerAbsentAvailableAt } from '../utils/customerAbsent';
import { defaultGam, findGamByUser, persistGam } from '../repositories/gamification.repository';
import { getLevel, checkAndAwardBadges } from './gamificationController';
import notifier, { relayActiveRidesLocation } from '../services/notifier';
import { calculateDeliveryFeeWithConfig, calculateOrderDistribution } from '../utils/walletCalculations';
import { addCommissionToAppCashbox } from './appCashboxController';
import { emitDeliveryStatusChanged, emitGamificationPointsEarned, emitGamificationBadgeUnlocked, emitToRoom, emitDeliveryCompleted, emitOrderStatusChanged, emitAdminNotification } from '../utils/socketEmitter';
import { getDefaultAddress } from '../utils/userHelpers';
import { isDeliveryWithinRadius } from '../services/dispatch';
import { geoVisiblePendingIds } from '../services/dispatchGeo';
import { getRoute } from '../services/routeService';
import { isMotoboyVerified, missingMotoboyVerifications } from '../utils/courierVerification';
import walletService from '../services/wallet.prisma.service';
import payoutService from '../services/payout.service';
import env from '../config/env';
import logger from '../config/logger';
import { notifyCustomerOrder } from '../services/customerNotify';
import { isDirectOrder } from '../utils/settlement';
import { cancelOrderWithFullRefund } from '../services/cancellation/fullRefund';
import { createTransferForDelivery, notifyTransferCreated, motoboyPixSnapshot } from '../services/asaasLoja/motoboyTransfer';
import { isReturnRide } from '../services/returnRide';
import { calculateDistance } from '../services/routeCalculator';
import { notifyStore as notifyStoreOwner, notifyUser as notifyPerson, STORE_LINKS as STORE_PANEL_LINKS } from '../services/storeNotify';
import { getPaymentProvider } from '../services/paymentProvider';
import deliveryInvoiceService from '../services/deliveryInvoice.service';
import { motoboySummary } from '../services/motoboySummary';
import { generatePin, pinLockMinutesLeft, registerPinFailure, pinLockedResponse } from '../services/pinGuard';
import { courierLimit, newCourierMessage, orderValues, overLimit } from '../services/courierTrust';

// Freio de custo: pontos viram benefício resgatável. Desligado (default) ou erro → sem pontos.
const gamificationPointsOn = async (): Promise<boolean> => {
  try {
    return !!(await getPlatformConfig())?.gamificationPointsEnabled;
  } catch {
    return false;
  }
};

// Loja valida PIN de retirada informado pelo motoboy
export const validarPinRetirada = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { pinRetirada } = req.body;
    const userId = req.user?.id;
    // Apenas a loja pode validar
    // Sem `.populate('motoboyId')`: User vive no Postgres (o nome é resolvido abaixo).
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Store not found' });
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can validate PIN'});
    }
    if (isReturnRide(delivery)) return res.status(400).json({ error: 'Esta é uma corrida de devolução: a loja confirma com o código de devolução.', code: 'RETURN_RIDE' });
    if (delivery.status !== 'assigned') return res.status(400).json({ error: 'Entrega não está aguardando retirada' });
    const lockedFor = pinLockMinutesLeft(delivery);
    if (lockedFor) return res.status(429).json(pinLockedResponse(lockedFor));
    if (!pinRetirada || String(pinRetirada) !== delivery.pinRetirada) {
      await registerPinFailure(delivery.id);
      return res.status(400).json({ error: 'PIN de retirada inválido' });
    }
    // Retirada condicional (D3b-1): só vale se a entrega ainda é deste motoboy, 'assigned' e com
    // este PIN. Um reassign do admin no meio faz count 0 → 409, e a linha não é regravada
    // (excludedMotoboyIds e o pool ficam como o reassign deixou).
    const pickedAt = new Date();
    const { count: pickedCount } = await prisma.delivery.updateMany({
      where: { id: delivery.id, status: 'assigned', motoboyId: delivery.motoboyId, pinRetirada: delivery.pinRetirada },
      data: { status: 'picked', pickedAt, pinFailedAttempts: 0, pinLockedUntil: null },
    });
    if (pickedCount !== 1) {
      return res.status(409).json({ error: 'A entrega mudou. Recarregue.', code: 'DELIVERY_CHANGED' });
    }
    delivery.pinFailedAttempts = 0;
    delivery.pinLockedUntil = null;
    delivery.status = 'picked';
    delivery.pickedAt = pickedAt;

    // Get motoboy name
    const motoboy = delivery.motoboyId
      ? await prisma.user.findUnique({ where: { id: String(delivery.motoboyId) }, select: { name: true } })
      : null;
    const motoboyName = motoboy?.name || 'Motoboy';

    // ✅ WORKFLOW 4: Notificar CLIENTE que pedido foi retirado
    void notifyCustomerOrder(String(order.id ?? order._id), 'picked');
    emitToRoom(
      `user:${order.customerId}`,
      'delivery:picked',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        status: '🚗 Motoboy retirou seu pedido',
        message: `${motoboyName} retirou seu pedido da loja e está a caminho!`,
        eta: '20-30 minutos',
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar LOJA que pedido foi retirado
    emitToRoom(
      `store:${order.storeId}`,
      'order:picked_up',
      {
        orderId: order._id,
        deliveryId: delivery._id,
        motoboyName: motoboyName,
        message: `Pedido retirado por ${motoboyName}`,
        pickedAt: new Date()
      }
    );

    // ✅ WORKFLOW 4: Notificar MOTOBOY que PIN foi validado
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:pin_validated',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'PIN validado com sucesso! Entrega confirmada',
        status: '✅ Pedido retirado - Siga para o endereço de entrega'
      }
    );

    // Broadcast delivery status change via socket
    emitDeliveryStatusChanged(delivery);

    return res.json({ success: true });
  } catch (err) {
    console.error('[validarPinRetirada] error:', err);
    return res.status(500).json({ error: 'Erro ao validar PIN de retirada' });
  }
};
// Listar entregas finalizadas (histórico) para o motoboy logado
export const listHistoryDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });
    const rows = await prisma.delivery.findMany({
      where: { motoboyId: req.user.id, status: { in: ['delivered', 'cancelled'] } },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(rows.map((r) => serializeDeliveryFor(toApiDelivery(r), req.user!.id)));
  } catch (err) {
    console.error('[listHistoryDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list history deliveries' });
  }
};
// GET /deliveries/summary — ganhos e corridas entregues de hoje e da semana (seg–dom), fuso de São Paulo.
export const getMotoboySummary = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    return res.json(await motoboySummary(String(req.user.id)));
  } catch (err) {
    logger.error('[getMotoboySummary] falha ao calcular o resumo do motoboy', err as Error, { motoboyId: req.user?.id });
    return res.status(500).json({ error: 'Não foi possível calcular o resumo' });
  }
};
// Listar avaliações recebidas pelo motoboy
export const listarAvaliacoesMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // motoboyId
    // Só o próprio motoboy ou admin pode ver
    if (!req.user || (req.user.role !== 'motoboy' && req.user.role !== 'admin' && req.user.id !== id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const avaliacoes = await prisma.delivery.findMany({
      where: { motoboyId: id, rating: { not: null } },
      select: { rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(avaliacoes);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao buscar avaliações do motoboy' });
  }
};

// Cliente avalia o motoboy após entrega
export const avaliarMotoboy = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { rating, comment } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Nota inválida' });
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    // Só o cliente do pedido pode avaliar
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order || order.customerId.toString() !== userId) return res.status(403).json({ error: 'Apenas o cliente pode avaliar' });
    if (delivery.status !== 'delivered') return res.status(400).json({ error: 'Entrega ainda não finalizada' });
    if (delivery.rating) return res.status(409).json({ error: 'Entrega já avaliada' });
    delivery.rating = rating;
    delivery.comment = comment;
    await persistDelivery(delivery);

    // --- Gamificação (respeita o freio /admin/freios) ---
    if (delivery.motoboyId && (await gamificationPointsOn())) {
      const mid = String(delivery.motoboyId);
      const gamification = (await findGamByUser(mid)) ?? defaultGam(mid);
      // Pontuação base por entrega avaliada
      let pontos = 10;
      let acao = 'Entrega avaliada';
      // Bônus por avaliação positiva
      if (rating >= 4) {
        pontos += 5;
        acao = 'Entrega avaliada (nota alta)';
      }
      // Penalidade por avaliação negativa
      if (rating <= 2) {
        pontos -= 2;
        acao = 'Entrega avaliada (nota baixa)';
      }
      gamification.points += pontos;
      gamification.totalPoints += Math.max(0, pontos);
      gamification.level = getLevel(gamification.totalPoints);
      gamification.history.push({ date: new Date().toISOString(), action: acao, points: pontos });

      const newBadges = await checkAndAwardBadges(mid, gamification);
      const saved = await persistGam(gamification);

      newBadges.forEach(b => emitGamificationBadgeUnlocked(mid, b));
      emitGamificationPointsEarned(mid, {
        points: pontos,
        totalPoints: saved.totalPoints,
        level: saved.level,
      });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao avaliar motoboy' });
  }
};
// Listar entregas em andamento para o motoboy logado
export const listOngoingDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    logger.debug('[listOngoingDeliveries] req.user:', req.user);
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number((req.query as any).page) || 1);
    const limit = Math.min(100, Number((req.query as any).limit) || 20);
    const skip = (page - 1) * limit;

    const where = { motoboyId: req.user.id, status: { in: ['assigned', 'picked'] as any } };
    const rows = await prisma.delivery.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });
    const deliveries = rows.map((r) => serializeDeliveryFor(toApiDelivery(r), req.user!.id));

    const total = await prisma.delivery.count({ where });

    logger.debug('[listOngoingDeliveries] found:', deliveries.length, 'deliveries');
    
    return res.json({
      deliveries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('[listOngoingDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list ongoing deliveries' });
  }
};
// Motoboy finaliza entrega informando o PIN
export const finalizarEntrega = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (String(delivery.motoboyId) !== String(userId)) return res.status(403).json({ error: 'Not your delivery' });
    if (isReturnRide(delivery)) return res.status(400).json({ error: 'Esta é uma corrida de devolução: a loja confirma com o código de devolução.', code: 'RETURN_RIDE' });
    if (delivery.status === 'delivered') return res.status(409).json({ error: 'Already delivered' });
    // Só fecha depois que a loja validou a retirada (picked).
    if (delivery.status !== 'picked') return res.status(400).json({ error: 'Retirada ainda não validada pela loja' });
    const lockedFor = pinLockMinutesLeft(delivery);
    if (lockedFor) return res.status(429).json(pinLockedResponse(lockedFor));
    if (!pin || String(pin) !== delivery.pin) {
      await registerPinFailure(delivery.id);
      return res.status(400).json({ error: 'PIN inválido' });
    }
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Trava atômica: só quem vira picked→delivered segue para payout/nota/pontos.
    // No modo direto, a transferência Pix ao motoboy é registrada na MESMA transação da trava.
    // A trava também exige o pedido aberto (R19-b): pedido cancelado/rejeitado não é
    // entregue nem gera transferência de entrega — e a compensação do cancelamento (mesma
    // deliveryId única) não colide com ela. A transição do pedido para 'entregue' é
    // condicional e na mesma transação; se o pedido já fechou, tudo é desfeito.
    const ORDER_CLOSED = 'ORDER_CLOSED';
    let createdTransfer: any = null;
    let locked: boolean | typeof ORDER_CLOSED;
    try {
      locked = await prisma.$transaction(async (tx) => {
        const lock = await tx.delivery.updateMany({
          where: { id: delivery.id, motoboyId: String(userId), status: 'picked' },
          data: { status: 'delivered', deliveredAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
        });
        if (lock.count !== 1) return false;
        const orderLock = await tx.order.updateMany({
          where: { id: order.id, status: { notIn: ['cancelado', 'rejeitado'] as any } },
          data: { status: 'entregue' },
        });
        if (orderLock.count !== 1) throw new Error(ORDER_CLOSED);
        if (isDirectOrder(order)) {
          createdTransfer = await createTransferForDelivery(tx, { id: delivery.id, motoboyId: String(userId), fee: delivery.fee }, { id: order.id, storeId: String(order.storeId) });
        }
        return true;
      });
    } catch (err) {
      if ((err as Error)?.message !== ORDER_CLOSED) throw err;
      locked = ORDER_CLOSED;
    }
    if (locked === ORDER_CLOSED) {
      logger.warn('[finalizarEntrega] PIN de entrega com o pedido já cancelado/rejeitado — recusado', { orderId: order.id, deliveryId: delivery.id });
      return res.status(409).json({ error: 'Pedido cancelado; a entrega não pode ser finalizada', code: 'ORDER_CLOSED' });
    }
    if (!locked) return res.status(409).json({ error: 'Already delivered' });
    delivery.status = 'delivered';
    if (createdTransfer) notifyTransferCreated(createdTransfer);

    // Atualiza o status do pedido para 'delivered'
    order.status = 'entregue';
    await prisma.order.update({ where: { id: order.id }, data: { status: 'entregue' } });
    logger.debug(`✅ [finalizarEntrega] Order ${order._id} marked as 'entregue'`);

    // Distribuição financeira para pedidos COD (pagamento acontece na entrega)
    if (order.paymentMethod === 'cash_on_delivery') {
      try {
        const config = await getPlatformConfig();
        const feePercent = config?.lateCancellationFeePercent ?? 10;
        const requiredBlock = (order.totalValue || 0) * feePercent / 100;

        const distribution = await calculateOrderDistribution(
          (order.totalValue || 0) - (order.deliveryFee || 0),
          order.deliveryFee || 0,
          order.storeId.toString(),
          order.deliveryDistance || 0
        );

        try {
          const storeWallet = await walletService.getOrCreate(String(order.storeId), 'store');
          await prisma.$transaction(async (tx) => {
            // Credita a loja (venda) e libera o bloqueio de garantia.
            const newBlocked = Math.max(0, Number(storeWallet.blockedBalance) - requiredBlock);
            await tx.wallet.update({
              where: { id: storeWallet.id },
              data: {
                balance: { increment: distribution.storeAmount + requiredBlock },
                totalIncome: { increment: distribution.storeAmount },
                blockedBalance: newBlocked,
              },
            });
            await tx.walletEntry.create({ data: { walletId: storeWallet.id, type: 'credit', category: 'payment', amount: distribution.storeAmount, reason: `Venda COD - pedido ${order.id}`, relatedId: order.id } });
            await tx.walletEntry.create({ data: { walletId: storeWallet.id, type: 'credit', category: 'transfer', amount: requiredBlock, reason: `Liberação de reserva COD - pedido ${order.id}`, reference: `COD_UNBLOCK_${order.id}` } });

            // Comissão de produto no AppCashbox.
            await recordCashboxEntry(tx, {
              type: 'income', source: 'product_commission', amount: distribution.product.appCommission,
              orderId: order.id, reason: `Comissão COD - pedido ${order.id}`,
            });
          });
        } catch (txErr) {
          console.error('Erro na distribuição financeira COD:', txErr);
        }
      } catch (err) {
        console.error('Erro ao processar pagamento COD na entrega:', err);
      }
    }

    // --- NOVO FLUXO: Criar payout do motoboy + release de todos os payouts do pedido ---
    try {
      const config = await getPlatformConfig();
      const motoboyCommissionPercent = config?.motoboyCommissionPercent ?? 20;
      const motoboyCommissionDecimal = motoboyCommissionPercent / 100;
      const motoboyAmount = delivery.fee * (1 - motoboyCommissionDecimal);

      // Modo SaaS direto: o dinheiro já está na conta Asaas da loja — não há custódia a
      // liberar nem Payout de motoboy pela conta-mãe (o Pix ao motoboy é a Fase 2).
      const directOrder = isDirectOrder(order);

      // Garantir que a wallet do motoboy exista (pra receber o payout).
      if (!directOrder) await walletService.getOrCreate(userId, 'motoboy');

      const useAsaas = env.PAYMENT_GATEWAY === 'asaas';
      if (directOrder) {
        logger.info('[finalizarEntrega] pedido do modo direto — sem Payout/carteira de custódia', { orderId: order.id });
      } else if (useAsaas) {
        // Cria o Payout do motoboy (pending). A liberação (transferência real conta-mãe
        // → subcontas) só acontece automaticamente se a plataforma estiver com
        // autoApprovePayouts. Caso contrário, os payouts ficam PENDING e o admin libera
        // manualmente no painel de Payouts (que dispara a transferência no Asaas).
        if (motoboyAmount > 0) {
          await payoutService.createPendingPayout({
            recipientType: 'motoboy',
            recipientId: userId,
            orderId: order._id.toString(),
            deliveryId: delivery._id.toString(),
            amount: motoboyAmount,
          });
        }
        const cfg = await getPlatformConfig();
        if (cfg?.autoApprovePayouts === true) {
          await getPaymentProvider(order.paymentProvider).onDeliveryConfirmed(order._id.toString());
        } else {
          logger.debug(`⏸️ [finalizarEntrega] autoApprovePayouts OFF — payouts do pedido ${order._id} ficam PENDING para liberação manual do admin`);
        }
      } else {
        await prisma.$transaction(async (tx) => {
          // Criar payout do motoboy (já released — entrega concluída)
          if (motoboyAmount > 0) {
            await payoutService.createPendingPayout({
              recipientType: 'motoboy',
              recipientId: userId,
              orderId: order.id,
              deliveryId: delivery.id,
              amount: motoboyAmount,
              tx,
            });
          }

          // Liberar TODOS os payouts do pedido (loja pending→released + motoboy pending→released)
          await payoutService.releasePayoutsForOrder(order.id, tx);
        });
      }

      if (!directOrder) {
        logger.info('[finalizarEntrega] payouts do pedido processados', { orderId: order.id, motoboyAmount: Number(motoboyAmount.toFixed(2)) });
      }

      // --- Gerar nota de servico (idempotente) ---
      // Modo direto: a DROP não reteve comissão sobre a entrega (o dinheiro está na conta da
      // loja), então a nota sai com comissão 0 e a entrega inteira como valor do motoboy.
      // A cobrança da comissão/repasse ao motoboy no modo direto é a Fase 2.
      try {
        const invoice = await deliveryInvoiceService.generateInvoice({
          orderId: order._id.toString(),
          deliveryId: delivery._id.toString(),
          motoboyAmount: directOrder ? Number(delivery.fee) : motoboyAmount,
          appCommission: directOrder ? 0 : delivery.fee - motoboyAmount,
          commissionPercent: directOrder ? 0 : motoboyCommissionPercent,
        });
        logger.info('[finalizarEntrega] nota de serviço gerada', { orderId: order.id, invoiceNumber: invoice.invoiceNumber });
      } catch (invoiceErr) {
        logger.error('[finalizarEntrega] erro ao gerar nota de serviço', invoiceErr as Error, { orderId: order.id });
      }
    } catch (walletErr) {
      console.error('❌ Erro ao processar payouts na entrega:', walletErr);
    }

    // 🎉 BROADCAST 1: Notificar TODAS as partes que entrega foi completada
    emitDeliveryCompleted(delivery, order);
    
    // 🎉 BROADCAST 2: Status geral da delivery
    emitDeliveryStatusChanged(delivery);

    // 🎉 BROADCAST 3: ATUALIZAR O PEDIDO TAMBÉM - remove de 'andamento', entra em 'histórico'
    emitOrderStatusChanged(order);
    logger.debug(`✅ [finalizarEntrega] Order status changed emitted for client to update history`);

    // --- Gamificação: pontos por entrega finalizada (respeita o freio /admin/freios) ---
    if (delivery.motoboyId && (await gamificationPointsOn())) {
      const mid = delivery.motoboyId.toString();
      const gamification = (await findGamByUser(mid)) ?? defaultGam(mid);
      const pontos = 10;
      gamification.points += pontos;
      gamification.totalPoints += pontos;
      gamification.level = getLevel(gamification.totalPoints);
      gamification.history.push({ date: new Date().toISOString(), action: 'Entrega finalizada', points: pontos });

      const newBadges = await checkAndAwardBadges(mid, gamification);
      const saved = await persistGam(gamification);

      newBadges.forEach(b => emitGamificationBadgeUnlocked(mid, b));
      emitGamificationPointsEarned(mid, { points: pontos, totalPoints: saved.totalPoints, level: saved.level });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao finalizar entrega' });
  }
};

// create a delivery for an order (store owner or system)
export const createDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId, distance } = req.body;
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // only store owner can create a delivery for this order
    const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can create delivery' });
    }

    // ✅ CORRIGIDO: Usar calculateDeliveryFeeWithConfig ao invés de hardcoded
    const fee = await calculateDeliveryFeeWithConfig(Number(distance || 0));

  // Gera PIN de retirada (motoboy) e PIN de entrega (cliente)
  const pinRetirada = generatePin(6);
  const pin = generatePin(6);
  const delivery: any = toApiDelivery(await prisma.delivery.create({
    data: {
      orderId,
      distance: Number(distance || 0),
      fee,
      status: 'pending',
      pinRetirada,
      pin,
      // ✅ NOVO: Copiar endereços e coordenadas do Order para garantir dados originais
      storeAddress: order.storeAddress,
      storeLatitude: order.storeLatitude,
      storeLongitude: order.storeLongitude,
      customerAddress: order.customerAddress,
      customerLatitude: order.customerLatitude,
      customerLongitude: order.customerLongitude,
      routePolyline: order.routePolyline,
    },
  }));

  // Registrar comissão de entrega no caixa do app (usar distribuição calculada)
  let motoboyAmount: number | undefined = undefined;
  try {
    const productTotal = (order.products || []).reduce((sum: number, it: any) => sum + (it.price || 0) * (it.quantity || 1), 0);
    logger.debug(`\n🔍 [createDelivery] INICIANDO REGISTRO DE COMISSÃO:`);
    logger.debug(`   📦 Produto total: R$ ${productTotal}`);
    logger.debug(`   🚗 Taxa de entrega: R$ ${fee}`);
    logger.debug(`   📍 Distância: ${distance || 0}km`);
    logger.debug(`   🏪 Store ID: ${order.storeId.toString()}`);
    
    const distribution = await calculateOrderDistribution(productTotal, fee, order.storeId.toString(), Number(distance || 0));
    
    logger.debug(`\n✅ DISTRIBUIÇÃO CALCULADA:`);
    logger.debug(`   💳 Produto App Commission: R$ ${distribution.product.appCommission}`);
    logger.debug(`   🚗 Entrega App Commission: R$ ${distribution.delivery?.appCommission}`);
    logger.debug(`   👤 Motoboy Amount (líquido): R$ ${distribution.delivery?.motoboyAmount}`);

    if (distribution.delivery) {
      motoboyAmount = distribution.delivery.motoboyAmount;
      if (order.paymentMethod === 'cash_on_delivery') {
        await addCommissionToAppCashbox('delivery_commission', distribution.delivery.appCommission, order._id.toString(), delivery._id.toString(), 'Comissão de entrega');
      }
    }
    
    logger.debug(`✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!\n`);
  } catch (err) {
    console.error('\n❌ ERRO ao registrar comissão de entrega no caixa do app:', err);
    console.error(`   Pedido: ${order._id}`);
    console.error(`   Entrega: ${delivery._id}\n`);
  }

  // notify motoboys of new delivery (incluir valor líquido para motoboy quando disponível)
  try {
    notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: delivery._id, orderId: delivery.orderId, fee: delivery.fee, distance: delivery.distance, motoboyAmount: motoboyAmount } });
  } catch (e) {
    // ignore notifier errors
  }
  return res.status(201).json(stripDeliveryPins(delivery));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to create delivery' });
  }
};

/** Modo direto: a loja paga o motoboy por Pix, então sem chave Pix ele não pega a corrida. */
const PIX_KEY_REQUIRED = 'MOTOBOY_PIX_KEY_REQUIRED';
async function directOrderWithoutPixKey(orderId: string, motoboyId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({ where: { id: String(orderId) }, select: { paymentProvider: true } });
  if (!isDirectOrder(order)) return false;
  const { pixKey } = await motoboyPixSnapshot(prisma, motoboyId);
  return !pixKey;
}

// assign a motoboy to a delivery (store owner or system)
export const assignDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // delivery id
    const { motoboyId } = req.body;
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const motoboy = await userRepository.findById(String(motoboyId)) as any;
    if (!motoboy) return res.status(404).json({ error: 'Motoboy not found' });
    if (motoboy.role !== 'motoboy') return res.status(400).json({ error: 'User is not a motoboy' });

    // Bloquear atribuição se motoboy tem devolução pendente
    const pendingReturn = toApiDelivery(await prisma.delivery.findFirst({ where: {
      motoboyId: motoboyId,
      statusDevolucao: 'aguardando_confirmacao',
    } }));
    if (pendingReturn) {
      return res.status(400).json({
        error: 'Este motoboy possui uma devolução pendente e não pode aceitar novas entregas até confirmar o retorno na loja.',
        pendingReturnDeliveryId: pendingReturn._id,
      });
    }

    // only store owner can assign motoboy for this delivery
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Store not found' });
    const userId = req.user?.id;
    if (!userId || store.ownerId.toString() !== userId) {
      return res.status(403).json({ error: 'Forbidden - only store owner can assign motoboy' });
    }
    if ((delivery.excludedMotoboyIds ?? []).includes(String(motoboyId))) {
      return res.status(409).json({ error: 'O suporte tirou este motoboy desta corrida; ele não pode recebê-la de novo.', code: 'DELIVERY_NOT_AVAILABLE' });
    }
    if (await directOrderWithoutPixKey(order.id, String(motoboyId))) {
      return res.status(409).json({ error: 'Este motoboy ainda não cadastrou a chave Pix e não pode receber por esta entrega.', code: PIX_KEY_REQUIRED });
    }

    delivery.motoboyId = motoboyId;
    delivery.status = 'assigned';
    await persistDelivery(delivery);
    
    // ✅ Broadcast delivery assignment to relevant parties
    emitDeliveryStatusChanged(delivery);
    
    // 👤 Notificar cliente que motoboy foi atribuído (sino + push e o evento do app aberto)
    void notifyCustomerOrder(String(order.id ?? order._id), 'motoboy_assigned');
    emitToRoom(`user:${order.customerId}`, 'motoboy:assigned', {
      orderId: order._id,
      deliveryId: delivery._id,
      motoboyId: motoboy.id,
      motoboyName: motoboy.name,
      status: '🏍️ Motoboy a caminho para a loja',
      message: `${motoboy.name} está a caminho para buscar seu pedido!`,
      timestamp: new Date().toISOString()
    });
    
    // 🏪 Notificar loja que motoboy foi atribuído
    emitToRoom(`store:${order.storeId}`, 'motoboy:assigned_to_order', {
      orderId: order._id,
      deliveryId: delivery._id,
      motoboyId: motoboy.id,
      motoboyName: motoboy.name,
      message: `${motoboy.name} foi atribuído para essa entrega`
    });
    
    // 🏍️ Notificar motoboy que foi atribuído a uma entrega
    emitToRoom(`user:${motoboyId}`, 'delivery:assigned_to_you', {
      deliveryId: delivery._id,
      orderId: order._id,
      fee: delivery.fee,
      distance: delivery.distance,
      message: `Você foi atribuído a uma nova entrega`,
      timestamp: new Date().toISOString()
    });

    return res.json(stripDeliveryPins(delivery));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to assign delivery' });
  }
};

// get delivery details (customer, store owner or assigned motoboy)
export const getDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { id } = req.params;
    // Leitura pura: os PINs nascem no claim (claimDelivery). Nada é gravado aqui.
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    const storeObj: any = order?.storeId ? await prisma.store.findUnique({ where: { id: String(order.storeId) } }) : null;

    // Autoriza ANTES de carregar dados de terceiros: motoboy atribuído, cliente ou dono da loja.
    const isMotoboy = !!delivery.motoboyId && String(delivery.motoboyId) === String(user.id);
    const isCustomer = !!order && String(order.customerId) === String(user.id);
    const isStoreOwner = !!storeObj && String(storeObj.ownerId) === String(user.id);
    if (!isMotoboy && !isCustomer && !isStoreOwner) {
      return res.status(403).json({ error: 'Forbidden - cannot access this delivery' });
    }

    const storeOwner: any = storeObj?.ownerId ? await userRepository.findById(String(storeObj.ownerId)) : null;
    const customerObj: any = order?.customerId ? await userRepository.findById(String(order.customerId)) : null;

    // Dados públicos do motoboy p/ o card do entregador (Drop Maps). Só o essencial:
    // nome, foto, placa (verification.courier) e nota média (das entregas avaliadas).
    let motoboyObj: any = null;
    if (delivery.motoboyId) {
      const mb = await userRepository.findById(String(delivery.motoboyId)) as any;
      if (mb) {
        const agg = await prisma.delivery.aggregate({
          where: { motoboyId: String(delivery.motoboyId), rating: { not: null } },
          _avg: { rating: true },
        });
        motoboyObj = {
          _id: mb.id,
          name: mb.name,
          photo: mb.photo || null,
          plate: mb.verification?.courier?.plate || null,
          rating: agg._avg.rating != null ? Math.round(Number(agg._avg.rating) * 10) / 10 : null,
        };
      }
    }

    // ✅ NOVO: Obter endereço padrão para fallback
    const defaultAddress = customerObj ? getDefaultAddress(customerObj) : null;
    // Motoboy só precisa do telefone enquanto a entrega está em andamento.
    const canSeeCustomerPhone = isCustomer || isStoreOwner || ['assigned', 'picked'].includes(delivery.status);
    // Cronômetro do "cliente ausente" na tela da corrida: a tela não adivinha a espera.
    const absentWaitMin = customerAbsentWaitMinutes(await getPlatformConfig());
    // Corrida de devolução: a espera pelo cliente conta do aceite (o motoboy vai até a casa dele).
    const absentAvailableAt = isReturnRide(delivery)
      ? (delivery.status === 'assigned' && delivery.assignedAt ? new Date(new Date(delivery.assignedAt).getTime() + absentWaitMin * 60_000) : null)
      : customerAbsentAvailableAt(delivery, absentWaitMin);
    // Compensação do cancelamento: só para o motoboy desta corrida. Uma falha aqui vira 500
    // (fail closed: nunca um null que pareceria "sem compensação").
    const cancellationCompensation = delivery.status === 'cancelled' && isMotoboy
      ? await motoboyCancellationCompensation(String(delivery._id), delivery.motoboyId)
      : null;

    // Corrida de devolução: com o produto na mão, o motoboy mostra à loja o código do ReturnRequest.
    let returnPin: string | null = null;
    if (isReturnRide(delivery) && isMotoboy && delivery.status === 'picked' && delivery.returnRequestId) {
      returnPin = (await prisma.returnRequest.findUnique({ where: { id: String(delivery.returnRequestId) }, select: { pin: true } }))?.pin ?? null;
    }
    const returnRide = isReturnRide(delivery);

    // Monta objeto de resposta com campos de texto e coordenadas para retirada e entrega
    const response = {
      ...serializeDeliveryFor(delivery, user.id, { customerId: order?.customerId }),
      order,
      storeObj: storeObj ? {
        _id: storeObj.id ?? storeObj._id,
        name: storeObj.name,
        address: storeObj.address,
        latitude: storeObj.latitude,
        longitude: storeObj.longitude,
        cnpj: storeObj.cnpj,
        telefone: storeOwner?.telefone || '-'
      } : null,
      // Só o necessário para entregar: nome, telefone e o endereço DESTE pedido
      // (deliveryAddress, abaixo). Sem e-mail e sem a lista de endereços salvos.
      customerObj: customerObj ? {
        _id: customerObj.id ?? customerObj._id,
        name: customerObj.name,
        ...(canSeeCustomerPhone ? { telefone: customerObj.telefone } : {}),
        ...(delivery.customerAddress ? {} : { mainAddress: defaultAddress }),
      } : null,
      motoboyObj,
      customerAbsentWaitMin: absentWaitMin,
      customerAbsentAvailableAt: absentAvailableAt ? absentAvailableAt.toISOString() : null,
      cancellationCompensation,
      ...(returnPin ? { returnPin } : {}),
      // Campos para frontend (na devolução, a retirada é a casa do cliente: store* da corrida)
      pickupAddress: returnRide ? (delivery.storeAddress || '-') : storeObj ? `${storeObj.name || ''} - ${storeObj.address || ''}` : '-',
      pickupLat: returnRide ? (delivery.storeLatitude ?? null) : storeObj?.latitude ? parseFloat(storeObj.latitude) : null,
      pickupLng: returnRide ? (delivery.storeLongitude ?? null) : storeObj?.longitude ? parseFloat(storeObj.longitude) : null,
      // ✅ FIXO: Usar delivery.customerAddress primeiro (snapshot), fallback para defaultAddress
      deliveryAddress: delivery.customerAddress || (defaultAddress ? `${defaultAddress.label || ''} - ${defaultAddress.street}, ${defaultAddress.number}, ${defaultAddress.neighborhood}, ${defaultAddress.city} - ${defaultAddress.state}` : '-'),
      deliveryLat: (delivery.customerLatitude !== undefined && delivery.customerLatitude !== null) ? parseFloat(String(delivery.customerLatitude)) : (defaultAddress?.latitude ? parseFloat(String(defaultAddress.latitude)) : null),
      deliveryLng: (delivery.customerLongitude !== undefined && delivery.customerLongitude !== null) ? parseFloat(String(delivery.customerLongitude)) : (defaultAddress?.longitude ? parseFloat(String(defaultAddress.longitude)) : null)
    };

    return res.json(response);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to get delivery' });
  }
};

// list available deliveries for motoboys (pending and not assigned)
export const listAvailableDeliveries = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // DEBUG LOG
    // eslint-disable-next-line no-console
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });

    // ✅ GATE KYC Fase 3: motoboy não verificado não vê entregas disponíveis
    if (process.env.KYC_ENFORCED === 'true') {
      const me = await userRepository.findById(String(req.user.id)) as any;
      if (!isMotoboyVerified(me)) {
        return res.json({ deliveries: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 }, requiresVerification: true });
      }
    }

    // ✅ SEGURANÇA: Paginação
    const page = Math.max(1, Number((req.query as any).page) || 1);
    const limit = Math.min(100, Number((req.query as any).limit) || 20);
    const skip = (page - 1) * limit;

    // Despacho por raio: filtra o pool pela distância loja→motoboy, que cresce com a
    // idade da entrega. Carregamos o lote pendente (cap defensivo) e filtramos em
    // memória, pois o raio depende da idade de cada entrega + da localização atual.
    const me = await userRepository.findById(String(req.user.id)) as any;

    // Gate de disponibilidade: offline = não recebe corridas (curto-circuito antes
    // do filtro por raio). O motoboy religa pelo toggle do cockpit.
    if (!(me as any)?.isOnline) {
      return res.json({
        deliveries: [],
        offline: true,
        locationKnown: false,
        pagination: { page: 1, limit: 0, total: 0, pages: 0 },
      });
    }

    const motoboyLoc = me?.currentLocation?.lat != null && me?.currentLocation?.lng != null
      ? { lat: me.currentLocation.lat, lng: me.currentLocation.lng }
      : null;

    // Caminho PostGIS (flag GEO_DISPATCH='postgis'): filtra por raio no BANCO via
    // ST_DWithin + índice GiST. Retorna null se desligado/sem GPS/erro → cai no
    // filtro JS (haversine) legado abaixo, com comportamento idêntico.
    const geoIds = await geoVisiblePendingIds(motoboyLoc);

    let visible: any[] = [];
    if (geoIds) {
      const rows = (await prisma.delivery.findMany({ where: { id: { in: geoIds } } })).map(toApiDelivery);
      const byId = new Map(rows.map((r: any) => [String(r._id ?? r.id), r]));
      visible = geoIds.map((id) => byId.get(id)).filter(Boolean); // preserva a ordem do SQL (createdAt asc)
    } else {
      const pendingAll = (await prisma.delivery.findMany({
        where: { status: 'pending', motoboyId: null },
        orderBy: { createdAt: 'asc' },
        take: 200,
      })).map(toApiDelivery);
      const now = Date.now();
      visible = pendingAll.filter((d) => isDeliveryWithinRadius(d as any, motoboyLoc, now));
    }

    // D3b-1: o motoboy retirado da corrida pelo admin não a recebe de novo.
    const viewerId = String(req.user.id);
    visible = visible.filter((d: any) => !(d.excludedMotoboyIds ?? []).includes(viewerId));
    // Motoboy novo (antifraude): só vê pedidos até o limite de valor das primeiras entregas.
    const courier = await courierLimit(viewerId);
    if (courier.maxOrderValue !== null && visible.length > 0) {
      const values = await orderValues(visible.map((d: any) => String(d.orderId)));
      visible = visible.filter((d: any) => !overLimit(courier, values.get(String(d.orderId)) ?? 0));
    }
    const total = visible.length;
    // Pool: nunca PIN (entrega devolvida ao pool pode carregar PINs antigos).
    const deliveries = visible.slice(skip, skip + limit).map((d: any) => stripDeliveryPins(d));

    return res.json({
      deliveries,
      // Sinaliza ao app que sem GPS o pool não é filtrado por proximidade.
      locationKnown: !!motoboyLoc,
      // Limite do motoboy novo (null quando já saiu): o app explica por que não vê pedidos caros.
      newCourier: courier.maxOrderValue !== null
        ? { maxOrderValue: courier.maxOrderValue, remaining: courier.remaining, message: newCourierMessage(courier) }
        : null,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[listAvailableDeliveries] error:', err);
    return res.status(500).json({ error: 'Failed to list available deliveries' });
  }
};

// Rota de NAVEGAÇÃO do motoboy: da posição atual dele até o alvo da perna atual
// (loja se 'assigned', cliente se 'picked'). Reusa o RouteService. O front chama
// isto ao trocar de perna ou quando o motoboy anda bastante (throttle no client).
export const getDeliveryNavRoute = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params as any;
    const userId = req.user?.id;
    const fromLat = Number((req.query as any).fromLat);
    const fromLng = Number((req.query as any).fromLng);

    const delivery = await prisma.delivery.findUnique({ where: { id: String(id) } });
    if (!delivery) return res.status(404).json({ error: 'Entrega não encontrada' });
    if (String(delivery.motoboyId) !== String(userId)) return res.status(403).json({ error: 'Não é a sua entrega' });

    // Perna atual: antes de retirar vai à LOJA; depois de retirar vai ao CLIENTE.
    const target = delivery.status === 'picked' ? 'customer' : 'store';
    const tLat = target === 'store' ? delivery.storeLatitude : delivery.customerLatitude;
    const tLng = target === 'store' ? delivery.storeLongitude : delivery.customerLongitude;

    const nums = [fromLat, fromLng, Number(tLat), Number(tLng)];
    if (!nums.every((n) => Number.isFinite(n) && n !== 0)) {
      return res.json({ target, polyline: null, distanceMeters: 0, durationSeconds: 0, source: null });
    }

    const route = await getRoute({ origin: { lat: fromLat, lng: fromLng }, destination: { lat: Number(tLat), lng: Number(tLng) } });
    return res.json({
      target,
      polyline: route?.polyline || null,
      distanceMeters: route?.distanceMeters || 0,
      durationSeconds: route?.durationSeconds || 0,
      source: route?.source || null,
    });
  } catch (err) {
    console.error('[getDeliveryNavRoute] error:', err);
    return res.status(500).json({ error: 'Falha ao calcular rota de navegação' });
  }
};

// Motoboy reporta a localização atual (GPS) — alimenta o despacho por raio.
export const updateMotoboyLocation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });

    const lat = Number((req.body as any).lat);
    const lng = Number((req.body as any).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Coordenadas inválidas' });
    }
    const isOnline = (req.body as any).isOnline;
    // App Android: o sistema marca a posição vinda de app de GPS falso (risco do "cliente não
    // apareceu" na devolução). Fica guardado junto da posição para o admin conferir.
    const simulated = (req.body as any).simulated === true;

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        currentLocation: { lat, lng, updatedAt: new Date(), ...(simulated ? { simulated: true } : {}) },
        ...(typeof isOnline === 'boolean' ? { isOnline } : {}),
      },
    });

    // Em corrida, a posição também vai ao cliente e à loja: no app Android com a tela apagada
    // o socket cai e este POST (HTTP nativo) é o único caminho que continua chegando.
    const accuracy = Number((req.body as any).accuracy);
    void relayActiveRidesLocation(String(req.user.id), {
      latitude: lat, longitude: lng, ...(Number.isFinite(accuracy) ? { accuracy } : {}),
    });

    // Log de verificação: confirma que o GPS do motoboy está pingando (Coolify logs).
    logger.debug(`[gps] motoboy=${req.user.id} lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[updateMotoboyLocation] error:', err);
    return res.status(500).json({ error: 'Failed to update location' });
  }
};

// Motoboy lê o próprio status (estado inicial do cockpit).
export const getMotoboyAvailability = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isOnline: true } });
    return res.json({ isOnline: !!me?.isOnline });
  } catch (err) {
    console.error('[getMotoboyAvailability] error:', err);
    return res.status(500).json({ error: 'Failed to get availability' });
  }
};

// Motoboy liga/desliga o recebimento de corridas SEM depender de GPS.
export const setMotoboyAvailability = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role !== 'motoboy') return res.status(403).json({ error: 'Forbidden: not motoboy' });
    const isOnline = (req.body as any)?.isOnline;
    if (typeof isOnline !== 'boolean') return res.status(400).json({ error: 'isOnline deve ser boolean' });
    await prisma.user.update({ where: { id: req.user.id }, data: { isOnline } });
    return res.json({ isOnline });
  } catch (err) {
    console.error('[setMotoboyAvailability] error:', err);
    return res.status(500).json({ error: 'Failed to set availability' });
  }
};

// motoboy claims a delivery (first-claim-wins) — atomic update
// 409 do aceite: corrida já levada por outro motoboy (ou que não existe mais). A mensagem é a de
// sempre (o app antigo lê `error`); o `code` deixa a tela nova dizer "Outro entregador aceitou".
const ALREADY_CLAIMED_BODY = { error: 'Already claimed or not available', code: 'ALREADY_CLAIMED' } as const;
// D3b-1: corrida de que o admin tirou este motoboy (excludedMotoboyIds) — não volta para ele.
const NOT_AVAILABLE_BODY = { error: 'Esta corrida não está mais disponível para você.', code: 'DELIVERY_NOT_AVAILABLE' } as const;

export const claimDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    // ✅ GATE KYC Fase 3: motoboy só recebe entrega se estiver verificado
    if (process.env.KYC_ENFORCED === 'true') {
      const motoboyUser = await userRepository.findById(String(userId)) as any;
      if (!isMotoboyVerified(motoboyUser)) {
        return res.status(403).json({
          error: 'Conta de motoboy não verificada. Conclua a verificação para aceitar entregas.',
          code: 'COURIER_NOT_VERIFIED',
          missing: missingMotoboyVerifications(motoboyUser),
        });
      }
    }

    // Gerar 2 PINs: um para cliente (entrega final) e outro para loja (retirada)
    const pinEntrega = generatePin(5);
    const pinRetirada = generatePin(5);
    
    // Trava atômica de aceite (first-accept-wins): UPDATE condicional `WHERE status
    // = pending AND motoboyId IS NULL`. Sob concorrência o Postgres serializa a
    // linha e só o primeiro motoboy reivindica (count === 1); os demais veem 409.
    // O pedido precisa estar aberto (mesmo padrão do R19-b em finalizarEntrega): na mesma
    // transação, a linha do pedido é travada (FOR UPDATE) ANTES da entrega — a mesma ordem
    // de travas da recusa/cancelamento (pedido → entrega) — e pedido cancelado/rejeitado
    // desfaz o aceite (409 ORDER_CLOSED). Quem cancela depois enxerga o motoboy (compensa).
    const target = await prisma.delivery.findUnique({ where: { id }, select: { orderId: true, excludedMotoboyIds: true } });
    if (!target) return res.status(409).json(ALREADY_CLAIMED_BODY);
    if (target.excludedMotoboyIds.includes(String(userId))) return res.status(409).json(NOT_AVAILABLE_BODY);
    // Motoboy novo (antifraude): pedido acima do limite das primeiras entregas não é dele.
    const limit = await courierLimit(String(userId));
    if (limit.maxOrderValue !== null) {
      const value = (await orderValues([String(target.orderId)])).get(String(target.orderId)) ?? 0;
      if (overLimit(limit, value)) return res.status(403).json({ error: newCourierMessage(limit), code: 'NEW_COURIER_LIMIT' });
    }
    if (await directOrderWithoutPixKey(target.orderId, String(userId))) {
      return res.status(409).json({ error: 'Cadastre sua chave Pix para pegar corridas: é por ela que você recebe.', code: PIX_KEY_REQUIRED });
    }
    const ORDER_CLOSED = 'ORDER_CLOSED';
    const ORDER_MISSING = 'ORDER_MISSING';
    let claimedCount: number;
    try {
      claimedCount = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "Order" WHERE id = ${String(target.orderId)} FOR UPDATE`;
        if (rows.length === 0) throw new Error(ORDER_MISSING);
        if (rows[0].status === 'cancelado' || rows[0].status === 'rejeitado') throw new Error(ORDER_CLOSED);
        const c = await tx.delivery.updateMany({
          where: { id, status: 'pending', motoboyId: null, NOT: { excludedMotoboyIds: { has: String(userId) } } },
          data: { motoboyId: userId, status: 'assigned', assignedAt: new Date(), pin: pinEntrega, pinRetirada, pinFailedAttempts: 0, pinLockedUntil: null },
        });
        return c.count;
      });
    } catch (err) {
      const msg = (err as Error)?.message;
      if (msg === ORDER_CLOSED) {
        logger.warn('[claimDelivery] aceite recusado: pedido já cancelado/rejeitado', { deliveryId: id, orderId: target.orderId });
        return res.status(409).json({ error: 'Pedido cancelado; a corrida não está mais disponível', code: 'ORDER_CLOSED' });
      }
      if (msg === ORDER_MISSING) {
        console.error(`❌ [claimDelivery] Order not found: ${target.orderId}`);
        return res.status(404).json({ error: 'Order not found' });
      }
      throw err;
    }
    if (claimedCount === 0) {
      // Excluído entre a leitura e a trava (reassign no meio) → NOT_AVAILABLE; senão, outro levou.
      const again = await prisma.delivery.findUnique({ where: { id }, select: { excludedMotoboyIds: true } });
      return res.status(409).json(again?.excludedMotoboyIds.includes(String(userId)) ? NOT_AVAILABLE_BODY : ALREADY_CLAIMED_BODY);
    }
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id } }));

    // Buscar order para notificações
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order) {
      console.error(`❌ [claimDelivery] Order not found: ${delivery.orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Buscar motoboy para nome
    const motoboy = await userRepository.findById(String(userId)) as any;
    const motoboyName = motoboy?.name || 'Motoboy';

    // Corrida de devolução: o cliente recebe "vai buscar" (o código de retirada fica no pedido de
    // reembolso) e a loja só recarrega. Nada dos avisos da entrega normal.
    if (isReturnRide(delivery)) {
      const first = String(motoboyName).split(' ')[0];
      emitToRoom(`user:${order.customerId}`, 'return:updated', { orderId: String(order._id), status: 'devolvendo' });
      void notifyPerson(String(order.customerId), {
        title: 'Motoboy a caminho',
        message: `${first} vai buscar o produto. Na retirada, mostre o código que está no pedido.`,
        link: `/pedido/${order._id}`,
        entityId: String(order._id),
        tag: 'reembolso',
      });
      emitToRoom(`store:${order.storeId}`, 'order:updated', { orderId: String(order._id) });
      emitDeliveryStatusChanged(delivery);
      return res.json(serializeDeliveryFor(delivery, req.user!.id));
    }

    // 🔴 BROADCAST 1: Notificar CLIENTE que motoboy aceitou + enviar PIN
    emitToRoom(`user:${order.customerId}`, 'motoboy:assigned', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      motoboyId: userId.toString(),
      motoboyName: motoboyName,
      status: '🏍️ Motoboy a caminho para a loja',
      message: `${motoboyName} está a caminho para buscar seu pedido!`,
      pin: pinEntrega, // 🔑 PIN PARA O CLIENTE (entrega final)
      timestamp: new Date().toISOString()
    });
    logger.debug(`📡 [claimDelivery] Event 'motoboy:assigned' sent to client ${order.customerId}`);
    void notifyCustomerOrder(String(order.id ?? order._id), 'motoboy_assigned');

    // 🔴 BROADCAST 2: Notificar LOJA que motoboy foi atribuído
    const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
    if (store) {
      // Emit to the room keyed by the store document ID (order.storeId)
      emitToRoom(`store:${order.storeId}`, 'motoboy:assigned_to_order', {
        orderId: order._id.toString(),
        deliveryId: delivery._id.toString(),
        motoboyId: userId.toString(),
        motoboyName: motoboyName,
        message: `${motoboyName} foi atribuído para essa entrega`
      });
      logger.debug(`📡 [claimDelivery] Event 'motoboy:assigned_to_order' sent to store ${order.storeId}`);
    }

    // 🔴 BROADCAST 3: Notificar MOTOBOY que foi atribuído
    emitToRoom(`user:${userId}`, 'delivery:assigned_to_you', {
      deliveryId: delivery._id.toString(),
      orderId: order._id.toString(),
      fee: delivery.fee,
      distance: delivery.distance,
      pinRetirada: delivery.pinRetirada, // 🔑 PIN para validação com loja
      message: `Você foi atribuído a uma nova entrega`,
      timestamp: new Date().toISOString()
    });
    logger.debug(`📡 [claimDelivery] Event 'delivery:assigned_to_you' sent to motoboy ${userId}`);

    // 🔴 BROADCAST 4: Status geral da delivery
    emitDeliveryStatusChanged(delivery);
    logger.debug(`📡 [claimDelivery] Event 'delivery:status_changed' broadcast`);

    // Notifica a loja em tempo real para atualizar a lista de pedidos
    try {
      if (notifier.io) {
        logger.debug('[SOCKET][BACKEND] Emitindo order_update para', `store:${order.storeId}`, 'orderId:', order._id);
        notifier.io.to(`store:${order.storeId}`).emit('order_update', {
          orderId: String(order._id),
          type: 'motoboy_assigned',
          deliveryId: String(delivery._id),
          status: 'assigned'
        });
      }
    } catch (e) {
      console.warn(`⚠️ [claimDelivery] Failed to notify store:`, e);
    }

    // Motoboy recebe só o PIN de retirada (mostra à loja). O PIN de entrega é do
    // cliente — foi para ele no evento motoboy:assigned.
    return res.json(serializeDeliveryFor(delivery, req.user!.id));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Failed to claim delivery' });
  }
};

/**
 * Corrida de devolução (caso B): o motoboy chega na casa do cliente e digita o código de retirada
 * que o cliente mostra (pinRetirada da corrida). assigned → picked; daí o motoboy leva à loja.
 */
export const retirarDevolucao = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id);
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(req.params.id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!isReturnRide(delivery)) return res.status(400).json({ error: 'Esta não é uma corrida de devolução', code: 'NOT_RETURN_RIDE' });
    if (String(delivery.motoboyId) !== userId) return res.status(403).json({ error: 'Not your delivery' });
    if (delivery.status !== 'assigned') return res.status(400).json({ error: 'A corrida não está aguardando a retirada' });
    const lockedFor = pinLockMinutesLeft(delivery);
    if (lockedFor) return res.status(429).json(pinLockedResponse(lockedFor));
    if (!req.body?.pin || String(req.body.pin) !== delivery.pinRetirada) {
      await registerPinFailure(delivery.id);
      return res.status(400).json({ error: 'Código de retirada não confere', code: 'INVALID_PIN' });
    }
    const { count } = await prisma.delivery.updateMany({
      where: { id: delivery.id, status: 'assigned', motoboyId: userId, pinRetirada: delivery.pinRetirada },
      data: { status: 'picked', pickedAt: new Date(), pinFailedAttempts: 0, pinLockedUntil: null },
    });
    if (count !== 1) return res.status(409).json({ error: 'A corrida mudou. Atualize a tela.' });
    const fresh: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: delivery.id } }));
    const order = await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, select: { id: true, customerId: true, storeId: true } });
    if (order) {
      const motoboy = await userRepository.findById(userId) as any;
      const first = String(motoboy?.name || 'O motoboy').split(' ')[0];
      emitToRoom(`user:${order.customerId}`, 'return:updated', { orderId: order.id, status: 'devolvendo' });
      emitToRoom(`store:${order.storeId}`, 'order:updated', { orderId: order.id });
      void notifyStoreOwner(order.storeId, {
        title: 'Produto voltando',
        message: `${first} retirou o produto com o cliente e está levando à loja. Confira e digite o código de devolução.`,
        link: STORE_PANEL_LINKS.order(order.id),
        entityId: order.id,
        tag: 'reembolso',
      });
    }
    emitDeliveryStatusChanged(fresh);
    return res.json(serializeDeliveryFor(fresh, userId));
  } catch (err) {
    logger.error('Erro na retirada da devolução', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Corrida de devolução (caso B): o cliente não aparece na retirada. Passada a espera de Regras e
 * taxas (contada do aceite), a corrida fecha, o motoboy recebe a corrida inteira (paga pela loja,
 * como na entrega normal) e o pedido de reembolso volta para o cliente escolher como devolver.
 */
const RETURN_ABSENT_MAX_DISTANCE_KM = 0.3;
const RETURN_ABSENT_LOCATION_MAX_AGE_MIN = 10;

export const devolucaoClienteAusente = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.user?.id);
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(req.params.id) } }));
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (!isReturnRide(delivery)) return res.status(400).json({ error: 'Esta não é uma corrida de devolução', code: 'NOT_RETURN_RIDE' });
    if (String(delivery.motoboyId) !== userId) return res.status(403).json({ error: 'Not your delivery' });
    if (delivery.status !== 'assigned') return res.status(400).json({ error: 'A corrida não está aguardando a retirada' });
    const waitMin = customerAbsentWaitMinutes(await getPlatformConfig());
    const availableAt = new Date(new Date(delivery.assignedAt || delivery.updatedAt).getTime() + waitMin * 60_000);
    if (Date.now() < availableAt.getTime()) {
      return res.status(400).json({ error: 'Espere um pouco mais pelo cliente.', code: 'WAIT_NOT_OVER', availableAt: availableAt.toISOString() });
    }
    // Prova de presença (quem paga é a loja): a última localização do motoboy, recente e perto da
    // casa do cliente (store* da corrida de devolução).
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { currentLocation: true } });
    const loc: any = me?.currentLocation;
    const locRecent = loc?.updatedAt && Date.now() - new Date(loc.updatedAt).getTime() <= RETURN_ABSENT_LOCATION_MAX_AGE_MIN * 60_000;
    const near = loc?.lat != null && loc?.lng != null && delivery.storeLatitude != null && delivery.storeLongitude != null
      && calculateDistance(Number(loc.lat), Number(loc.lng), Number(delivery.storeLatitude), Number(delivery.storeLongitude)) <= RETURN_ABSENT_MAX_DISTANCE_KM;
    if (!locRecent || !near) {
      return res.status(400).json({ error: 'Para marcar que o cliente não apareceu, você precisa estar no endereço dele com a localização ligada.', code: 'NOT_AT_PICKUP' });
    }
    const rr = delivery.returnRequestId ? await prisma.returnRequest.findUnique({ where: { id: String(delivery.returnRequestId) } }) : null;
    if (!rr) return res.status(409).json({ error: 'Pedido de reembolso não encontrado' });

    const transfer = await prisma.$transaction(async (tx) => {
      const { count } = await tx.delivery.updateMany({
        where: { id: delivery.id, status: 'assigned', motoboyId: userId },
        data: { status: 'cancelled', cancelledAt: new Date(), pin: null, pinRetirada: null, pinFailedAttempts: 0, pinLockedUntil: null },
      });
      if (count !== 1) return 'changed' as const;
      await tx.returnRequest.updateMany({
        where: { id: rr.id, status: 'devolvendo' },
        data: {
          status: 'aprovado', mode: null, pin: null, pinFailedAttempts: 0, pinLockedUntil: null, pickupMissedAt: new Date(),
          // Arrependimento: a corrida paga foi usada; chamar de novo cobra outra.
          feeAmount: null, feeAsaasPaymentId: null, feePixPayload: null, feePixImage: null, feePixExpiresAt: null, feePaidAt: null,
        },
      });
      return createTransferForDelivery(tx, { id: delivery.id, motoboyId: userId, fee: delivery.fee }, { id: rr.orderId, storeId: rr.storeId }, 'return_delivery');
    });
    if (transfer === 'changed') return res.status(409).json({ error: 'A corrida mudou. Atualize a tela.' });
    if (transfer) notifyTransferCreated(transfer);

    const code = String(rr.orderId).slice(-6).toUpperCase();
    void notifyPerson(rr.customerId, {
      title: 'O motoboy não te encontrou',
      message: 'O motoboy não te encontrou para buscar o produto. Escolha de novo como devolver.',
      link: `/pedido/${rr.orderId}`,
      entityId: rr.orderId,
      tag: 'reembolso',
    });
    void notifyStoreOwner(rr.storeId, {
      title: 'Retirada da devolução não aconteceu',
      message: `O motoboy não encontrou o cliente do pedido #${code}. A corrida foi paga pela sua conta e o cliente vai escolher de novo como devolver.`,
      link: STORE_PANEL_LINKS.order(rr.orderId),
      entityId: rr.orderId,
      tag: 'reembolso',
    });
    emitToRoom(`user:${rr.customerId}`, 'return:updated', { orderId: rr.orderId, status: 'aprovado' });
    emitToRoom(`store:${rr.storeId}`, 'order:updated', { orderId: rr.orderId });
    const fresh: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: delivery.id } }));
    emitDeliveryStatusChanged(fresh);
    return res.json({ success: true, status: 'cancelled', compensation: transfer ? Number(transfer.amount) : 0 });
  } catch (err) {
    logger.error('Erro no cliente ausente da devolução', err as Error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ========== FLUXO DE DEVOLUÇÃO COM PIN ==========

/**
 * ✅ FIX #6: Motoboy solicita devolução e sistema gera PIN
 * Neste ponto, delivery está 'picked' e motoboy quer cancelar
 * Sistema gera um PIN de 6 dígitos que loja deve confirmar
 */
export const requestReturn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const motoboyId = req.user?.id;

    if (!motoboyId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    // Validar que é o motoboy da entrega
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(deliveryId) } }));
    if (!delivery) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    // Corrida de devolução (caso B): o destino já é a loja e quem fecha é o código do ReturnRequest;
    // o fluxo de "devolver à loja" da entrega normal nunca roda nela.
    if (isReturnRide(delivery)) {
      return res.status(400).json({ error: 'Esta é uma corrida de devolução: a loja confirma com o código de devolução.', code: 'RETURN_RIDE' });
    }

    if (delivery.motoboyId?.toString() !== motoboyId) {
      return res.status(403).json({ error: 'Apenas o motoboy designado pode solicitar devolução' });
    }

    // Só pode solicitar devolução em status 'picked'
    if (delivery.status !== 'picked') {
      return res.status(400).json({
        error: `Devolução só pode ser solicitada em status 'picked'`,
        currentStatus: delivery.status
      });
    }

    // Gerar PIN aleatório de 6 dígitos
    const pinDevolucao = generatePin(6);
    
    // Atualizar delivery com PIN e status
    delivery.pinDevolucao = pinDevolucao;
    delivery.statusDevolucao = 'aguardando_confirmacao';
    await persistDelivery(delivery);

    // Notificar loja que motoboy quer devolver
    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (order) {
      emitToRoom(
        `store:${order.storeId}`,
        'delivery:return_requested',
        {
          deliveryId: delivery._id,
          orderId: order._id,
          motoboyId: delivery.motoboyId,
          message: 'Motoboy solicitou devolução do produto',
          pinRequired: true,
          returnedAt: new Date()
        }
      );
      logger.debug(`📡 [requestReturn] Loja ${order.storeId} notificada sobre devolução`);
    }

    // Notificar motoboy que PIN foi gerado (não enviar o PIN para o cliente!)
    emitToRoom(
      `motoboy:${motoboyId}`,
      'delivery:return_initiated',
      {
        deliveryId: delivery._id,
        message: 'Devolução iniciada. Aguarde confirmação da loja.',
        status: 'aguardando_confirmacao'
      }
    );

    return res.json({
      message: 'Devolução solicitada. Aguarde confirmação da loja.',
      deliveryId,
      statusDevolucao: 'aguardando_confirmacao'
    });
  } catch (err) {
    console.error('[requestReturn] Erro:', err);
    return res.status(500).json({ error: 'Erro ao solicitar devolução' });
  }
};

/**
 * ✅ FIX #6: Loja confirma devolução inserindo o PIN
 * Apenas após confirmação com PIN correto, refund é processado
 */
export const confirmReturn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params as any;
    const { pinDevolucao } = req.body;
    const userId = req.user?.id;

    if (!userId || !pinDevolucao) {
      return res.status(400).json({ error: 'Parâmetros inválidos' });
    }

    // Validar que é a loja
    const delivery: any = toApiDelivery(await prisma.delivery.findUnique({ where: { id: String(deliveryId) } }));
    if (!delivery) {
      return res.status(404).json({ error: 'Entrega não encontrada' });
    }
    // Corrida de devolução (caso B): o destino já é a loja e quem fecha é o código do ReturnRequest;
    // o fluxo de "devolver à loja" da entrega normal nunca roda nela.
    if (isReturnRide(delivery)) {
      return res.status(400).json({ error: 'Esta é uma corrida de devolução: a loja confirma com o código de devolução.', code: 'RETURN_RIDE' });
    }

    const order: any = toApiOrder(await prisma.order.findUnique({ where: { id: String(delivery.orderId) }, include: orderInclude }));
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const store = await prisma.store.findUnique({ where: { id: String(order.storeId) } }) as any;
    logger.debug(`📋 [confirmReturn] userId: ${userId}, store.ownerId: ${store?.ownerId}`);
    if (!store || store.ownerId.toString() !== userId) {
      console.error(`📋 [confirmReturn] ❌ AUTH FAIL - userId: ${userId}, storeOwnerId: ${store?.ownerId?.toString()}`);
      return res.status(403).json({ error: 'Apenas o proprietário da loja pode confirmar devolução' });
    }

    // Validar status
    if (delivery.statusDevolucao !== 'aguardando_confirmacao') {
      return res.status(400).json({
        error: 'Devolução não está aguardando confirmação',
        currentStatus: delivery.statusDevolucao
      });
    }

    // Validar PIN (com trava de tentativas)
    const lockedFor = pinLockMinutesLeft(delivery);
    if (lockedFor) return res.status(429).json(pinLockedResponse(lockedFor));
    if (!pinDevolucao || String(pinDevolucao) !== delivery.pinDevolucao) {
      await registerPinFailure(delivery.id);
      return res.status(400).json({ error: 'PIN de devolução inválido' });
    }
    delivery.pinFailedAttempts = 0;
    delivery.pinLockedUntil = null;

    // Confirmar devolução — limpar PIN e registrar data
    const returnAction = delivery.pendingReturnAction;
    delivery.statusDevolucao = 'confirmado';
    delivery.dataConfirmacaoDevolucao = new Date();
    // null (não undefined): o Prisma ignora undefined e o PIN ficava gravado.
    delivery.pinDevolucao = null;
    delivery.pendingReturnAction = null;

    if (returnAction === 'reassign') {
      // ── REASSIGN: produto voltou à loja, entrega volta ao pool ──
      const motoboyIdNotify = delivery.motoboyId;
      delivery.status = 'pending';
      // motoboyId precisa ser `null` (não `undefined`) — Prisma ignora undefined no update.
      delivery.motoboyId = null;
      clearDeliveryPins(delivery);
      await persistDelivery(delivery);
      logger.debug(`✅ [confirmReturn] Delivery ${delivery._id} voltou ao pool para reatribuição`);

      // Notificar motoboy: pode fechar a modal
      emitToRoom(`user:${motoboyIdNotify}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        message: 'Devolução confirmada! A entrega voltou ao pool para um novo entregador.',
        statusDevolucao: 'confirmado',
        reassigned: true,
      });

      // Notificar cliente: procurando novo entregador
      emitToRoom(`user:${order.customerId}`, 'order:reassigning', {
        orderId: order._id,
        deliveryId: delivery._id,
        message: 'Produto devolvido à loja. Estamos procurando um novo entregador para você.',
      });

      // Broadcast: delivery disponível no pool para outros motobikes
      emitDeliveryStatusChanged(delivery);

      return res.json({
        message: 'Devolução confirmada. Entrega voltou ao pool.',
        deliveryId,
        orderId: order._id,
        statusDevolucao: 'confirmado',
        action: 'reassign',
        dataConfirmacao: delivery.dataConfirmacaoDevolucao,
      });

    } else {
      // ── CANCEL (padrão; ou o cliente pediu reembolso): produto voltou à loja, pedido cancelado + reembolso ──
      delivery.status = 'cancelled';
      delivery.cancelledAt = new Date();
      await persistDelivery(delivery);
      logger.debug(`📋 [confirmReturn] Cancelando Order para o cliente...`);

      // Modo direto (asaas_loja): o mesmo cancelamento com reembolso integral dos outros fluxos,
      // que estorna pela chave da loja (antes só escalava para o admin). A trava de status de lá
      // impede o segundo reembolso se o pedido já estiver encerrado.
      if (isDirectOrder(order)) {
        const result = await cancelOrderWithFullRefund(order, {
          reason: 'Produto devolvido à loja depois que o motoboy desistiu',
          reasonCode: 'motoboy_rejected',
          cancelledBy: 'motoboy',
        });
        if (!result.ok) logger.warn('[confirmReturn] pedido direto já encerrado — reembolso não repetido', { orderId: order.id, error: result.error });
        emitToRoom(`user:${delivery.motoboyId}`, 'delivery:return_confirmed', {
          deliveryId: delivery._id,
          message: 'Devolução confirmada pela loja. Pedido cancelado.',
          statusDevolucao: 'confirmado',
        });
        emitToRoom(`user:${order.customerId}`, 'delivery:return_confirmed', {
          deliveryId: delivery._id,
          orderId: order._id,
          message: 'Produto foi devolvido à loja. Seu reembolso foi pedido.',
          confirmedAt: new Date(),
        });
        return res.json({
          message: 'Devolução confirmada com sucesso. Pedido cancelado para cliente.',
          deliveryId,
          orderId: order._id,
          statusDevolucao: 'confirmado',
          action: 'cancel',
          orderStatus: 'cancelado',
          refundStatus: result.refundStatus ?? null,
          dataConfirmacao: delivery.dataConfirmacaoDevolucao,
        });
      }

      // ✅ TRAVA ATÔMICA ANTI-DUPLO-REEMBOLSO (review #1b): só reembolsa se ESTE request for
      // o que efetivamente move o pedido de um estado cancelável → 'cancelado'. Se o pedido já
      // foi cancelado/reembolsado por outro caminho (ex.: `pos-devolucao` reembolso), o
      // `count === 0` transforma o refund num no-op. Mesmo padrão de `cancelOrderByCustomer`.
      // Inclui 'aguardando_motoboy': o pedido pode estar nesse estado no momento da
      // devolução (ex.: entrega voltou ao pool). Sem ele, o claim casa 0 linhas e o
      // status NÃO persiste como 'cancelado' — o cliente segue vendo "Buscando entregador".
      const cancelClaim = await prisma.order.updateMany({
        where: { id: order.id, status: { in: ['criado', 'pago', 'aguardando_motoboy', 'enviado'] as any } },
        data: { status: 'cancelado', cancelledAt: new Date() },
      });
      order.status = 'cancelado';
      const newlyCancelled = cancelClaim.count === 1;
      logger.debug(`✅ [confirmReturn] Order ${order._id} — newlyCancelled=${newlyCancelled}`);

      // Modo direto (asaas_loja): o dinheiro está na conta da loja — nada de carteira,
      // Payout ou AppCashbox. Pago → o estorno pela chave da loja fica pendente pro admin
      // (Fase 3), mesmo escalonamento de quando o estorno da custódia falha.
      const directOrder = isDirectOrder(order);
      const directRefundPending = directOrder && order.paymentStatus === 'paid';
      if (newlyCancelled && directRefundPending) {
        logger.error('Pedido do modo direto cancelado já pago — estorno pela conta da loja pendente, escala pro admin', 'DIRECT_REFUND_PENDING', {
          orderId: order.id, flow: 'devolução confirmada pela loja',
        });
      }

      // Novo fluxo: cancelar payouts + reembolsar cliente + debitar AppCashbox.
      // SÓ quando este request reivindicou o cancelamento (evita reembolso duplicado).
      let refundHeldForReview = false;
      if (newlyCancelled && !directOrder) {
        try {
          await prisma.$transaction(async (tx) => {
            const result = await payoutService.cancelPayoutsForOrder(order.id, 'product_returned', tx);
            if (result.errors.length > 0) {
              // Repasse em liberação (releasing) ou já liquidado (requested/paid): o dinheiro
              // pode já ter saído pra loja/motoboy. NÃO reembolsar o cliente automaticamente
              // (pagamento em dobro). Desfaz a transação e escala pro admin.
              throw Object.assign(new Error('PAYOUT_ALREADY_SETTLED'), {
                needsManualReview: true,
                payoutErrors: result.errors,
              });
            }

            const refundAmount = order.totalValue || 0;
            if (refundAmount > 0) {
              await walletService.credit(
                { owner: String(order.customerId), ownerType: 'user', amount: refundAmount, reason: 'Reembolso - Produto devolvido a loja pelo motoboy', category: 'refund', relatedId: order.id },
                tx,
              );
              await recordCashboxEntry(tx, {
                type: 'expense', source: 'order_refund', amount: refundAmount, orderId: order.id,
                reason: 'Reembolso - Produto devolvido a loja',
              });
            }
          });
          logger.debug(`✅ [confirmReturn] Reembolso processado para cliente ${order.customerId}`);
        } catch (refundErr: any) {
          refundHeldForReview = true;
          if (refundErr?.needsManualReview) {
            logger.error('Devolução confirmada com repasse em liberação ou liquidado — reembolso retido para revisão manual', 'PAYOUT_ALREADY_SETTLED', {
              orderId: order.id, payoutErrors: refundErr.payoutErrors,
            });
          } else {
            logger.error('Erro ao processar o reembolso da devolução confirmada', refundErr as Error, { orderId: order.id });
          }
          emitAdminNotification({
            title: 'Reembolso de devolução retido ⚠️',
            body: `O produto do pedido ${order.id} voltou à loja, mas o reembolso do cliente não foi feito automaticamente. Confira os repasses do pedido.`,
            url: '/admin/payouts',
            tag: 'payout',
          });
        }
      } else if (!newlyCancelled) {
        logger.debug(`⏭️ [confirmReturn] Pedido ${order._id} já estava cancelado — refund pulado (anti-duplo-reembolso)`);
      }

      emitToRoom(`user:${delivery.motoboyId}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        message: 'Devolução confirmada pela loja. Pedido cancelado.',
        statusDevolucao: 'confirmado',
      });

      emitToRoom(`user:${order.customerId}`, 'order:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: 'Produto devolvido à loja',
        message: directRefundPending
          ? 'Seu pedido foi cancelado. O reembolso será feito pela loja.'
          : refundHeldForReview
            ? 'Seu pedido foi cancelado. O reembolso está em análise pela equipe.'
            : 'Seu pedido foi cancelado e o reembolso foi processado.',
        refundStatus: directRefundPending || refundHeldForReview ? 'pending' : 'processed',
        cancelledAt: order.cancelledAt,
      });

      emitToRoom(`store:${order.storeId}`, 'order:cancelled', {
        orderId: order._id,
        deliveryId: delivery._id,
        reason: 'Produto devolvido à loja pelo motoboy',
        cancelledAt: order.cancelledAt,
      });

      emitToRoom(`user:${order.customerId}`, 'delivery:return_confirmed', {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'Produto foi devolvido à loja. Seu reembolso será processado em breve.',
        confirmedAt: new Date(),
      });

      return res.json({
        message: 'Devolução confirmada com sucesso. Pedido cancelado para cliente.',
        deliveryId,
        orderId: order._id,
        statusDevolucao: 'confirmado',
        action: 'cancel',
        orderStatus: 'cancelado',
        dataConfirmacao: delivery.dataConfirmacaoDevolucao,
      });
    }
  } catch (err) {
    console.error('[confirmReturn] Erro:', err);
    return res.status(500).json({ error: 'Erro ao confirmar devolução' });
  }
};

