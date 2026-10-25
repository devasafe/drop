import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { customerRefundStage } from '../utils/customerRefund';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { toApiDelivery, serializeDeliveryFor, stripDeliveryPins } from '../repositories/delivery.repository';

import { getRoute } from '../services/routeService';
import { routeQuoteWithRoute, storePoint, straightKm, validPoint, resolvePlan1Free } from '../services/deliveryQuote/quote';
import { getDeliveryConfig, effectiveRadiusKm } from '../services/deliveryQuote/config';
import { prisma } from '../lib/prisma';
import { publicStoreVisibilityWhere } from '../services/catalog/visibility';
import { emitStockChanged } from '../services/storeIntegration';
import userRepository from '../repositories/user.repository';


import notifier from '../services/notifier';
import logger from '../config/logger';
import {
  emitOrderCreated,
  emitOrderStatusChanged,
  emitDeliveryCreated,
  emitToRoom,
} from '../utils/socketEmitter';
import { notifyStoreOwner } from '../services/pushService';
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
import { findPendingDebt, claimPendingDebt, linkCollectedDebt } from '../repositories/customerDebt.repository';
import { isStoreCurrentlyOpen } from './storeController';
import { computeCouponDiscount } from './couponController';
import { findCouponById, incrementCouponUse } from '../repositories/coupon.repository';
import env from '../config/env';
import { ensureAsaasCustomer, createPixCharge, createCardCharge, getPixQrCode, getPaymentStatus, PixCharge } from '../services/asaas/payment';
import { finalizeWalletPaidOrder, confirmOrderPaidByPayment } from '../services/asaas/orderPayment';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { getActivePaymentProviderName } from '../services/paymentProvider';
import { computeCardTotal } from '../utils/cardInstallments';
import { compensateFailedOrder } from '../services/orderCompensation';
import { isDirectMode, isDirectOrder } from '../utils/settlement';
import { precheckDirectOrder, finishDirectOrder, sendAppError, directDeliveryFee } from '../services/asaasLoja/directCheckout';
import { precheckBuyerCpf } from '../utils/buyerCpf';
import { AppError } from '../utils/AppError';
import { isStorePaused } from '../utils/storeOpen';
import { isAdminPaused, STORE_ADMIN_PAUSED_CUSTOMER_MESSAGE } from '../services/adminAccounts/storePause';
import { assertProductsActive, pausedProductError } from '../services/catalog/activeProduct';
import { storeSafeLastError } from '../utils/safeErrorText';
import { getStorePaymentStatus, getStorePixQrCode } from '../services/asaasLoja/charge';
import { confirmDirectOrderPaid } from '../services/asaasLoja/orderPaymentDirect';

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

    // 📲 Push pro dono da loja: recebeu uma avaliação nova.
    notifyStoreOwner(order.storeId, {
      title: 'Nova avaliação ⭐',
      body: `Sua loja recebeu uma avaliação de ${storeRating} estrela${storeRating > 1 ? 's' : ''}.`,
      url: '/seller/avaliacoes',
      tag: 'nova-avaliacao',
    });

    return res.json({ success: true });
  } catch (err) {
    logger.error('Erro ao avaliar loja', err as Error);
    return res.status(500).json({ error: 'Erro ao avaliar loja' });
  }
};

/** Devolve o estoque baixado por este pedido (Product fora de transação: compensação explícita). */
async function restoreStock(items: Array<{ productId: unknown; quantity: number }>): Promise<void> {
  for (const item of items) {
    await prisma.product.updateMany({ where: { id: String(item.productId) }, data: { quantity: { increment: item.quantity } } });
  }
}

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  // Itens com estoque baixado e ainda sem pedido que os "segure": se algo lançar nesse intervalo,
  // o catch externo devolve o estoque (os `return` explícitos devolvem por conta própria).
  let heldStock: Array<{ productId: any; quantity: number }> | null = null;

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
    // D3b-2a: loja pausada pelo DROP (admin), nos dois modos e antes de qualquer escrita. Vem antes
    // da pausa do lojista e do horário: só o admin libera.
    if (isAdminPaused(storeForCheck)) {
      return sendAppError(res, new AppError(STORE_ADMIN_PAUSED_CUSTOMER_MESSAGE, 409, true, 'STORE_ADMIN_PAUSED'));
    }
    // D1: loja pausada pelo lojista — a mesma regra da vitrine (utils/storeOpen), nos dois modos,
    // antes de qualquer escrita. Vem antes do "fechada" para o cliente ver o motivo certo.
    if (isStorePaused(storeForCheck)) {
      return sendAppError(res, new AppError('A loja pausou os pedidos por um tempo. Tente de novo mais tarde.', 409, true, 'STORE_PAUSED'));
    }
    if (!isStoreCurrentlyOpen(storeForCheck)) {
      return res.status(400).json({ error: 'Loja fechada no momento. Tente novamente quando estiver aberta.' });
    }

    // D1: item pausado pelo lojista é recusado ANTES de qualquer escrita (CPF, estoque, pedido),
    // nos dois modos — o direto passa por aqui antes do precheckDirectOrder/finishDirectOrder.
    try {
      await assertProductsActive(products.map((p: any) => String(p?.productId ?? '')));
    } catch (e) {
      if (e instanceof AppError && e.code) return sendAppError(res, e);
      throw e;
    }

    // Preço mostrado ≠ preço atual (lojista editou com a sacola aberta): recusa ANTES de baixar
    // estoque, criar pedido ou cobrar, e devolve os preços atuais para o app atualizar a sacola.
    // Opcional: app antigo (sem expectedPrice) segue como sempre, cobrando o preço do banco.
    const expected = products.filter((p: any) => typeof p?.expectedPrice === 'number');
    // Guardado para a 2ª conferência, no laço de estoque: entre aqui e lá rodam a rota e as
    // prechecagens, e o lojista pode editar o preço nessa janela.
    const expectedCentsById = new Map<string, number>(expected.map((p: any) => [String(p.productId), Math.round(Number(p.expectedPrice) * 100)]));
    const priceChangedBody = (items: Array<{ productId: string; price: number }>) =>
      ({ error: 'Os preços mudaram. Confira a sacola.', code: 'PRICE_CHANGED', items });
    if (expected.length > 0) {
      const current = await prisma.product.findMany({
        where: { id: { in: [...new Set(expected.map((p: any) => String(p.productId)))] as string[] } },
        select: { id: true, price: true },
      });
      const priceById = new Map(current.map((c) => [c.id, c.price.toNumber()]));
      const changed: Array<{ productId: string; price: number }> = [];
      const seen = new Set<string>();
      for (const p of expected) {
        const id = String(p.productId);
        const now = priceById.get(id);
        if (now === undefined || seen.has(id)) continue; // inexistente: o laço abaixo devolve 404
        if (Math.round(now * 100) !== Math.round(Number(p.expectedPrice) * 100)) { changed.push({ productId: id, price: now }); seen.add(id); }
      }
      if (changed.length > 0) {
        return res.status(409).json(priceChangedBody(changed));
      }
    }

    // ✅ SEGURANÇA + CONSISTÊNCIA: NUNCA confiar na distância enviada pelo frontend.
    // A FONTE DA VERDADE da taxa é o backend, usando DISTÂNCIA DE ROTA (pelas ruas)
    // via RouteService — o mesmo cálculo que o checkout exibe (endpoint /quote).
    // O RouteService já cai em haversine sozinho se o gateway de rota falhar.
    // Área de entrega: a distância em LINHA RETA loja→cliente tem de caber no raio efetivo
    // (a mesma regra de cards e sacola); a rota só define taxa e prazo. Tudo isso ANTES de
    // qualquer escrita (CPF do modo direto) e da baixa de estoque: fora da área não toca em nada.
    let serverDistanceKm = 0;
    let routeDurationSeconds = 0;
    let routePolyline: string | undefined;
    const storeLoc = storePoint(storeForCheck);
    const customerLoc = { lat: Number(latitude), lng: Number(longitude) };
    // Plano 1 da custódia (vitrine, sem entrega integrada, taxa 0) fica FORA da área e do
    // NO_ADDRESS — o /checkout-vitrine nem manda coordenadas. Mesma regra da cotação
    // (resolvePlan1Free); no modo direto o plano não existe e a checagem vale sempre.
    const plan1Free = await resolvePlan1Free(storeIdStr);
    if (!storeLoc && !plan1Free) {
      // Sem localização da loja não há área nem rota: o card e a sacola já dizem
      // STORE_NO_LOCATION; aceitar aqui cobraria só a base (km 0).
      return sendAppError(res, new AppError('Esta loja ainda não configurou a localização.', 409, true, 'STORE_NO_LOCATION'));
    }
    if (storeLoc && validPoint(customerLoc)) {
      const radiusKm = effectiveRadiusKm(storeForCheck, await getDeliveryConfig());
      if (!plan1Free && straightKm(storeLoc, customerLoc) > radiusKm) {
        return sendAppError(res, new AppError('Esta loja não entrega nesse endereço.', 409, true, 'OUT_OF_AREA'));
      }
      const route = await getRoute({ origin: storeLoc, destination: customerLoc });
      if (route) {
        serverDistanceKm = route.distanceKm;
        routeDurationSeconds = route.durationSeconds;
        routePolyline = route.polyline;
        if (route.source === 'haversine') {
          logger.warn('Taxa calculada por estimativa (haversine) — gateway de rota indisponível', { storeId: storeIdStr, distanceKm: serverDistanceKm });
        }
      }
    } else if (storeLoc && !plan1Free) {
      // Fail closed: loja com localização e pedido sem coordenadas válidas cobraria km 0 e
      // escaparia da área. (Loja sem localização já saiu acima, salvo o Plano 1 da custódia.)
      return sendAppError(res, new AppError('Informe o endereço de entrega.', 400, true, 'NO_ADDRESS'));
    } else if (deliveryDistanceKm) {
      logger.warn('Pedido sem coordenadas completas — distância do frontend não confiável, usando 0', { storeId: storeIdStr });
    }

    // Modo SaaS "direto" (Task 1.5): independe de PAYMENT_GATEWAY. Pré-checagens
    // (método, cupom global, conta Asaas da loja, CPF) ANTES de baixar estoque.
    const directMode = await isDirectMode();
    let directCpf = '';
    if (directMode) {
      try {
        ({ cpf: directCpf } = await precheckDirectOrder({ storeId: storeIdStr, customerId, paymentMethod, cupomCode, cpf: req.body.cpf }));
      } catch (e) {
        if (e instanceof AppError && e.code) return sendAppError(res, e);
        throw e;
      }
    }

    // Método de pagamento aceito pelo Asaas: validado ANTES de baixar o estoque (senão repetir
    // a chamada com um método inválido zerava o estoque da loja). Modo direto tem a sua checagem.
    if (!directMode && env.PAYMENT_GATEWAY === 'asaas' && paymentMethod !== 'pix' && paymentMethod !== 'credit_card') {
      return res.status(400).json({ error: 'No momento apenas PIX ou cartão estão disponíveis.' });
    }

    // Custódia + Pix (Task 8): CPF de cobrança ANTES de baixar estoque, mesma regra do modo
    // direto (perfil → KYC → body). Diferenças: documento presente porém inválido e sem CPF
    // no body segue o caminho atual (Asaas recusa → pedido compensado, 502); e quem paga com
    // saldo positivo (`useWalletBalance`) não é barrado aqui — o total só é conhecido depois e
    // o Pix 100% pago com saldo não cobra no Asaas.
    let custodyCpf: string | null = null;
    if (!directMode && env.PAYMENT_GATEWAY === 'asaas' && paymentMethod === 'pix') {
      const bodyCpf = (req.body as any).cpf;
      const hasBodyCpf = typeof bodyCpf === 'string' && bodyCpf.replace(/\D/g, '') !== '';
      // Só pula com saldo positivo (pode cobrir o total); flag ligada com saldo zero exige CPF.
      const walletForCpf = useWalletBalance && !hasBodyCpf ? await walletService.getOrCreate(customerId, 'user') : null;
      if (!walletForCpf || !(Number(walletForCpf.balance) > 0)) {
        try {
          custodyCpf = await precheckBuyerCpf(String(customerId), bodyCpf);
        } catch (e) {
          if (e instanceof AppError && e.code) return sendAppError(res, e);
          throw e;
        }
      }
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
        await restoreStock(items); // itens anteriores deste pedido já baixaram estoque
        return res.status(400).json({ error: `Produto inválido: ${JSON.stringify(p)}` });
      }

      // Sem `.session(session)`: Product vive no Postgres e não entra na transação Mongo.
      const prod = await prisma.product.findUnique({ where: { id: String(p.productId) } });
      if (!prod) {
        await restoreStock(items); // itens anteriores deste pedido já baixaram estoque
        return res.status(404).json({ error: `Produto ${p.productId} não encontrado` });
      }
      // O pedido é de UMA loja: produto de outra loja baixaria o estoque dela com o
      // dinheiro e a notificação indo para esta.
      if (String(prod.storeId) !== storeIdStr) {
        await restoreStock(items);
        return res.status(400).json({ error: `O produto ${prod.name} não é desta loja`, code: 'PRODUCT_FROM_OTHER_STORE' });
      }
      // D1: corrida com a pausa (o lojista pausou entre a checagem lá de cima e este ponto).
      if (!prod.isActive) {
        await restoreStock(items);
        return sendAppError(res, pausedProductError(prod.name));
      }

      // ✅ SEGURANÇA: NUNCA confiar no preço enviado pelo frontend.
      // O preço é SEMPRE o que está no banco de dados (fonte da verdade).
      // `price` é Decimal no Postgres; o Order ainda vive no Mongo com number.
      // Convertemos na fronteira — quando o Order migrar (Fatia 3), a cadeia
      // fica Decimal ponta a ponta e esta conversão sai.
      const productPrice = prod.price.toNumber();
      if (productPrice <= 0) {
        await restoreStock(items); // itens anteriores deste pedido já baixaram estoque
        return res.status(400).json({ error: `Produto ${prod.name} com preço inválido` });
      }
      // 2ª conferência do preço mostrado, com o preço que de fato vai ser cobrado (a 1ª, lá em cima,
      // pode ter ficado velha durante a rota/prechecagens). Antes de baixar o estoque deste item.
      const expectedCents = expectedCentsById.get(String(p.productId));
      if (expectedCents !== undefined && Math.round(productPrice * 100) !== expectedCents) {
        await restoreStock(items);
        return res.status(409).json(priceChangedBody([{ productId: prod.id, price: productPrice }]));
      }

      // Decremento atômico com verificação de estoque.
      // O `WHERE quantity >= n` deixa a checagem no banco: sob concorrência o
      // estoque nunca fica negativo, nem transitoriamente (antes o valor era
      // decrementado e só depois conferido).
      const dec = await prisma.product.updateMany({
        // isActive no WHERE: a baixa nunca acontece num produto pausado, nem na corrida.
        where: { id: String(p.productId), isActive: true, quantity: { gte: p.quantity } },
        data: { quantity: { decrement: p.quantity } },
      });

      if (dec.count === 0) {
        // Devolve o que já havia sido decrementado neste pedido. Product está no
        // Postgres e não participa do rollback da transação Mongo — a compensação
        // é explícita (já era assim, agora é obrigatória).
        await restoreStock(items);
        const current = await prisma.product.findUnique({ where: { id: String(p.productId) }, select: { quantity: true, isActive: true } });
        if (current && !current.isActive) return sendAppError(res, pausedProductError(prod.name));
        const available = current?.quantity ?? 0;
        return res.status(409).json({
          error: `Estoque insuficiente para ${prod.name}. Disponível: ${available}.`,
        });
      }

      subtotal += productPrice * p.quantity;
      items.push({ productId: prod.id, quantity: p.quantity, price: productPrice });
    }

    heldStock = items;

    if (subtotal <= 0) {
      await restoreStock(items);
      return res.status(400).json({ error: 'Subtotal inválido' });
    }

    // Aplicar cupom de desconto (se informado)
    let couponDiscount = 0;
    let couponType: 'store' | 'global' | null = null;
    let appliedCouponId: any = null;
    if (cupomCode) {
      const couponResult = await computeCouponDiscount(cupomCode, storeIdStr, subtotal);
      if (!couponResult.valid) {
        // O estoque já foi baixado acima (o cupom depende do subtotal): devolve antes do 400,
        // senão repetir a chamada com cupom inválido zera o estoque da loja.
        await restoreStock(items);
        return res.status(400).json({ error: couponResult.reason || 'Cupom inválido' });
      }
      couponDiscount = couponResult.discount;
      couponType = couponResult.coupon?.type ?? null;
      appliedCouponId = couponResult.coupon?._id;
    }

    // Modo direto: daqui em diante o caminho é outro (sem carteira/custódia/payout).
    if (directMode) {
      heldStock = null; // finishDirectOrder compensa por conta própria
      // `return await`: rejeição inesperada cai no catch abaixo (500) em vez de pendurar a requisição.
      return await finishDirectOrder(res, {
        customerId, store: storeForCheck, items, subtotal, couponDiscount, appliedCouponId, cupomCode,
        serverDistanceKm, routeDurationSeconds, routePolyline, idempotentKey, address, latitude, longitude,
        cpf: directCpf,
      });
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

    // (Asaas aceita só PIX e cartão: checado lá em cima, antes da baixa de estoque.)

    // Cobrar dívida pendente (apenas para pedidos não-COD)
    let pendingDebt: any = null;
    let debtAmount = 0;
    // D3b-2a: quanto da multa foi DE FATO cobrado (0 se o admin perdoou no meio, ou fora da carteira).
    let debtCharged = 0;
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
        await restoreStock(items);
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
      // D3b-2a: a multa só é cobrada se a dívida AINDA estiver pendente — o admin pode tê-la
      // perdoado depois da leitura lá em cima. A baixa condicional decide quem vence, e ela e o
      // débito da multa vão na mesma transação: ou os dois acontecem, ou nenhum (um perdão
      // concorrente espera o lock da linha e, depois do commit, não acha mais `pending`).
      if (debtAmount > 0) {
        const debtId = String(pendingDebt._id);
        const charged = await prisma.$transaction(async (tx) => {
          if (!(await claimPendingDebt(debtId, tx))) return false;
          await walletService.debit({
            owner: customerId, ownerType: 'user', amount: debtAmount,
            reason: 'Cobrança de multa de cancelamento tardio pendente',
            category: 'penalty', relatedId: debtId,
          }, tx);
          return true;
        }, { maxWait: 15_000, timeout: 20_000 }); // as mesmas folgas do walletService (pool sob concorrência)
        if (charged) debtCharged = debtAmount;
      }

      // --- Custódia: todo o dinheiro entra no AppCashbox ---
      await recordCashboxEntry(prisma, {
        type: 'income', source: 'order_payment', amount: totalValue,
        reason: 'Pagamento de pedido (custódia)',
      });

      // Garantir a carteira da loja (pra receber o payout).
      await walletService.getOrCreate(storeIdStr, 'store');

      // Multa cobrada (a baixa para collected já aconteceu acima): credita a loja de origem.
      if (debtCharged > 0) {
        const debtSourceOrder = await prisma.order.findUnique({ where: { id: String(pendingDebt.sourceOrderId) } });
        if (debtSourceOrder) {
          await walletService.credit({
            owner: String(debtSourceOrder.storeId), ownerType: 'store', amount: debtCharged,
            reason: 'Reembolso de multa de cancelamento tardio pago pelo cliente',
            category: 'transfer', relatedId: String(pendingDebt._id),
          });
        }
      }
    }

    // ✅ Saldo da carteira abatendo o total (só no fluxo Asaas). Debita o saldo e o
    // restante vai pra cobrança PIX. O dinheiro do saldo (cashback/recarga) já está
    // na conta-mãe, então cobre o repasse na entrega.
    // paymentMethod 'wallet' = pagar 100% com saldo (exige saldo suficiente).
    const payFullyWithWallet = paymentMethod === 'wallet';
    let walletApplied = 0;
    const clientBalance = Number(clientWallet.balance);
    if (payFullyWithWallet && clientBalance < totalValue) {
      await restoreStock(items);
      return res.status(400).json({ error: 'Saldo insuficiente na carteira para pagar o pedido.', code: 'WALLET_INSUFFICIENT' });
    }
    if (useAsaas && (useWalletBalance || payFullyWithWallet) && clientBalance > 0) {
      walletApplied = round2(Math.min(clientBalance, totalValue));
      await walletService.debit({
        owner: customerId, ownerType: 'user', amount: walletApplied,
        reason: 'Saldo usado no pedido', category: 'payment', relatedId: storeIdStr,
      });
    }

    // Buscar dados da loja para snapshot no pedido
    const store: any = await prisma.store.findUnique({ where: { id: storeIdStr } });
    if (!store) {
      await restoreStock(items);
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    // O Order vive no Postgres — criado por ÚLTIMO, depois das escritas Mongo da
    // transação. Se o restante do lado Mongo (Payout/dívida/commit) falhar, o Order
    // é apagado como compensação (mesmo padrão do estoque, Fatia 2). `products[]`
    // virou a tabela relacionada `OrderItem` (nested create).
    const activeProvider = await getActivePaymentProviderName();
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
        subtotal, // persistido p/ o resumo financeiro (antes ficava nulo → R$0,00 na tela)
        totalValue,
        deliveryFee,
        deliveryDistance: serverDistanceKm,
        deliveryDuration: routeDurationSeconds || undefined,
        routePolyline: routePolyline || undefined,
        status: 'criado',
        paymentMethod: (paymentMethod || 'money') as any,
        debtCollected: debtCharged > 0 ? debtCharged : undefined,
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
        paymentProvider: activeProvider,
        walletApplied,
        // Cupom aplicado (validado acima por computeCouponDiscount): base de "vendas por cupom".
        couponId: appliedCouponId ? String(appliedCouponId) : undefined,
      },
      include: orderInclude,
    });
    heldStock = null; // o pedido existe: daqui em diante a compensação é do compensateFailedOrder

    // Estoque baixou (venda) → avisa os webhooks de integração da loja.
    void emitStockChanged(storeIdStr, items.map((it) => String(it.productId)));

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

      if (debtCharged > 0) {
        await linkCollectedDebt(String(pendingDebt._id), createdOrder.id);
      }

    } catch (commitErr) {
      // Falha após criar o Order no Postgres: desfaz como compensação.
      await prisma.order.delete({ where: { id: createdOrder.id } }).catch(() => { /* nada a fazer */ });
      heldStock = items; // sem pedido de novo: o catch externo devolve o estoque
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

    // A rota (distância/duração/polyline) agora é calculada ANTES da taxa e já foi
    // gravada na criação do pedido (routePolyline/deliveryDuration/deliveryDistance),
    // via RouteService — fonte única. O antigo cálculo pós-commit (Directions) foi
    // removido: era redundante e a taxa saía de haversine, divergindo do checkout.

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
        // ensureAsaasCustomer LANÇA com CPF inválido: sem este try o erro caía no catch
        // externo (500) sem compensar — pedido órfão e estoque baixado. Igual ao PIX:
        // compensa e devolve 502 com o motivo em `detail`.
        let asaasCustomerId: string | null;
        try {
          asaasCustomerId = await ensureAsaasCustomer(String(customerId));
        } catch (custErr: any) {
          logger.error('Falha ao iniciar pagamento com cartão (cliente Asaas)', custErr as Error, { orderId: order.id });
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          const detail = custErr?.errors?.[0]?.description || custErr?.message || 'erro desconhecido';
          return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.', detail });
        }
        if (!asaasCustomerId) {
          logger.error('Falha ao iniciar pagamento com cartão (cliente Asaas indisponível)', undefined, { orderId: order.id });
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' });
        }
        // Parcelamento: o total cobrado é SEMPRE recalculado no servidor a partir da
        // config vigente (gross-up) — nunca confiar em um total vindo do cliente. O
        // gross-up vale para TODO N, inclusive 1x: o cliente paga o custo exato do
        // Asaas em qualquer opção, a plataforma fica neutra (decisão do dono do produto —
        // o front já exibe o 1x grosseado, isso alinha o backend). Só N>1 é "parcelamento"
        // de fato pro Asaas (installmentCount/installmentValue); 1x manda `value` plano.
        const installmentCount = Number((req.body as any).installmentCount) || 1;
        const cfg = await getPlatformConfig();
        if (!cfg) {
          logger.error('Configuração de parcelamento indisponível', undefined, { orderId: order.id });
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          return res.status(500).json({ error: 'Configuração de parcelamento inválida' });
        }
        // Limite de parcelas definido pelo admin (o schema Zod só garante 1..21) —
        // reforça no servidor pra uma chamada direta à API não driblar o limite.
        if (installmentCount > Number(cfg.cardInstallmentMaxCount)) {
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          return res.status(400).json({ error: 'Número de parcelas acima do permitido.' });
        }
        let cardValue = chargeAmount;
        let installmentValue: number | undefined;
        try {
          const { total, installmentValue: iv } = computeCardTotal(chargeAmount, installmentCount, {
            cardFeePercent: Number(cfg.cardFeePercent),
            cardFeeFixed: Number(cfg.cardFeeFixed),
            cardAnticipationMonthlyRate: Number(cfg.cardAnticipationMonthlyRate),
          });
          cardValue = total;
          if (installmentCount > 1) {
            // Valor mínimo de parcela definido pelo admin — só faz sentido para N>1
            // (em 1x o "valor da parcela" é o total inteiro).
            if (iv < Number(cfg.cardInstallmentMinValue)) {
              await compensateFailedOrder(order.id, items, walletApplied, customerId);
              return res.status(400).json({ error: 'Valor da parcela abaixo do mínimo.' });
            }
            installmentValue = iv;
          }
        } catch (cfgErr) {
          logger.error('Configuração de parcelamento inválida', cfgErr as Error, { orderId: order.id });
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          return res.status(500).json({ error: 'Configuração de parcelamento inválida' });
        }
        let cardResult;
        try {
          cardResult = await createCardCharge({
            customerId: asaasCustomerId, value: cardValue, orderId: String(order.id),
            remoteIp: req.ip || '', description: `Pedido em ${store.name || 'loja'}`,
            card, holder: cardHolder,
            installmentCount, installmentValue,
          });
        } catch (cardErr: any) {
          await compensateFailedOrder(order.id, items, walletApplied, customerId);
          const detail = cardErr?.errors?.[0]?.description || cardErr?.message || 'cartão recusado';
          logger.error('Cartão recusado/erro', cardErr as Error, { orderId: order.id }); // NUNCA logar card
          return res.status(402).json({ error: 'Pagamento com cartão recusado.', detail });
        }
        order.asaasPaymentId = cardResult.paymentId;
        order.installmentCount = installmentCount;
        // Persiste o total REALMENTE cobrado no cartão (grosseado, com juros) e o
        // valor da parcela (N>1). O `totalValue` do pedido continua sendo o BASE
        // (à vista, base da distribuição); estes campos preservam o que o cliente
        // pagou pra exibição fiel no histórico — sem recalcular depois com uma
        // config que pode ter mudado.
        order.cardChargedTotal = cardValue as any;
        order.installmentValue = (installmentValue ?? null) as any;
        await prisma.order.update({
          where: { id: order.id },
          data: {
            asaasPaymentId: cardResult.paymentId,
            installmentCount,
            cardChargedTotal: cardValue,
            installmentValue: installmentValue ?? null,
          },
        });
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
          const ensureBuyer = () => (custodyCpf ? ensureAsaasCustomer(String(customerId), custodyCpf) : ensureAsaasCustomer(String(customerId)));
          let asaasCustomerId = await ensureBuyer();
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
            asaasCustomerId = await ensureBuyer();
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
    if (heldStock) {
      await restoreStock(heldStock).catch((e) => logger.error('Falha ao devolver estoque após erro no pedido', e as Error));
    }
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

    // Modo SaaS direto: a cobrança está na conta Asaas DA LOJA — concilia e busca o QR
    // com a chave dela. Nunca consulta a conta-mãe (lá essa cobrança não existe).
    if (order.paymentProvider === 'asaas_loja') {
      return await getDirectOrderPix(order, res);
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

/** `getOrderPix` de pedido `asaas_loja`: status e QR pela chave da loja. */
async function getDirectOrderPix(order: { id: string; storeId: string; asaasPaymentId: string | null }, res: Response) {
  const paymentId = String(order.asaasPaymentId);
  try {
    const raw = await getStorePaymentStatus(order.storeId, paymentId);
    if (raw && ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(raw)) {
      await confirmDirectOrderPaid(order.storeId, paymentId, raw);
      const fresh = await prisma.order.findUnique({ where: { id: order.id }, select: { paymentStatus: true } });
      if (fresh?.paymentStatus === 'paid') return res.json({ paid: true });
    }
  } catch (e) {
    logger.warn('Falha na reconciliação do Pix na conta da loja (segue mostrando o QR)', { orderId: order.id, storeId: order.storeId });
  }

  try {
    const qr = await getStorePixQrCode(order.storeId, paymentId);
    return res.json({ paid: false, orderId: String(order.id), ...qr });
  } catch (err) {
    if (err instanceof AppError) return sendAppError(res, err);
    return res.status(502).json({ error: 'Não foi possível obter a cobrança PIX' });
  }
}

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

    // Task 3.4: resumo do estorno (pedido direto) só para dono da loja/admin — nunca para o cliente.
    let directRefund: { status: string; amount: number; lastError: string | null; attempts: number } | null = null;
    if ((isStoreOwner || isAdmin) && order.paymentProvider === 'asaas_loja') {
      const dr = await prisma.directRefund.findUnique({
        where: { orderId: id },
        select: { status: true, amount: true, lastError: true, attempts: true },
      });
      if (dr) directRefund = { status: dr.status, amount: Number(dr.amount), lastError: storeSafeLastError(dr.lastError), attempts: dr.attempts };
    }

    // Fase C2: o cliente do pedido direto vê a etapa do estorno (sem lastError/attempts).
    let customerRefund: { stage: string; amount: number; requestedAt: Date; acceptedAt: Date | null; doneAt: Date | null } | null = null;
    if (isCustomer && order.paymentProvider === 'asaas_loja') {
      const dr = await prisma.directRefund.findUnique({
        where: { orderId: id },
        select: { status: true, amount: true, createdAt: true, acceptedAt: true, doneAt: true },
      });
      if (dr) customerRefund = { stage: customerRefundStage(dr.status), amount: Number(dr.amount), requestedAt: dr.createdAt, acceptedAt: dr.acceptedAt, doneAt: dr.doneAt };
    }

    // Reembolso de pedido entregue (caso B): o resumo para as telas do pedido (o código nunca vai aqui).
    const rr = await prisma.returnRequest.findUnique({ where: { orderId: id }, select: { status: true, reason: true, amount: true } });
    const returnRequest = rr ? { status: rr.status, reason: rr.reason, amount: Number(rr.amount) } : null;

    return res.json({
      ...order,
      returnRequest,
      ...((isStoreOwner || isAdmin) ? { directRefund } : {}),
      ...(isCustomer ? { customerRefund } : {}),
      products: productsWithNames,
      // PIN só para quem deve ver: o cliente recebe o de entrega; loja/admin nenhum.
      delivery: delivery ? { ...serializeDeliveryFor(toApiDelivery(delivery), userId, { customerId: order.customerId }), motoboyName } : null,
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
      logger.debug(`[Plan1] Pedido ${order.id} — loja ${store.id} é Plano 1 (Vitrine). Aceitando sem criar Delivery.`);
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
    if (existingDelivery) return res.json(stripDeliveryPins(toApiDelivery(existingDelivery)));

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
        routePolyline: order.routePolyline, // rota loja→cliente (p/ mapa do motoboy/cliente)
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

    return res.status(201).json(stripDeliveryPins(toApiDelivery(delivery)));
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

    // Modo direto: plano único, entrega sempre pelo pool de motoboys (fecha pelo PIN do cliente).
    if (isDirectOrder(order)) {
      return res.status(400).json({ error: 'Este pedido é entregue por motoboy; não há confirmação manual de recebimento.', code: 'PLAN1_DISABLED' });
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
      // paidAt marca a confirmação (o prazo de aceite da loja conta daqui) — só na transição.
      data: {
        paymentStatus,
        status: newStatus,
        ...(paymentStatus === 'paid' && existing.paymentStatus !== 'paid' ? { paidAt: new Date() } : {}),
      },
      include: orderInclude,
    });

    return res.json({ message: `Status de pagamento alterado para ${paymentStatus}`, order: toApiOrder(updated) });
  } catch (err: any) {
    logger.error('Erro ao alterar status de pagamento', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Orçamento da entrega (PREVIEW do checkout / sacola) — MESMA fonte da cobrança final.
 * POST /orders/quote  body: { storeId, latitude, longitude }
 *
 * Responde a `DeliveryQuote` da rota real (`routeQuoteWithRoute`: área, prazo, taxa, aberta)
 * MAIS os campos antigos do checkout (`plan`, `deliveryFee`, `distanceMeters`,
 * `durationSeconds`, `polyline`). Nos nomes que colidem (`distanceKm`, `source`) vale a
 * DeliveryQuote; o `source` antigo do RouteService sai como `routeSource`.
 * Fora da área / sem endereço: 200 com `inArea` false/null e `deliveryFee: null` (o checkout
 * antigo lê distância 0 e não deixa fechar, como fazia com o 400/422 de antes).
 * A taxa é a mesma função e a mesma distância de rota que o createOrder cobra.
 */
export const quoteDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { storeId, latitude, longitude } = req.body || {};
    if (!storeId) return res.status(400).json({ error: 'Loja não informada' });

    const store: any = await prisma.store.findUnique({ where: { id: String(storeId) } });
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    // Modo direto: plano único (decisão do usuário) — Store.plan/StoreSubscription saem do
    // fluxo e a taxa é sempre a da fórmula da rota, a MESMA do createOrder direto.
    const direct = await isDirectMode();
    let storePlan: number | null = null;
    if (!direct) {
      const storeSub = await findSubByStoreId(String(storeId));
      const planNumberMap: Record<string, number> = { plan1: 1, plan2: 2, plan3: 3 };
      storePlan = storeSub ? (planNumberMap[(storeSub as any).currentPlan] ?? 1) : 1;
    }

    const point = { lat: Number(latitude), lng: Number(longitude) };
    const { quote, route } = await routeQuoteWithRoute(store, point);

    let legacy: Record<string, unknown>;
    if (storePlan === 1) {
      // Plano 1 (Vitrine) na custódia: sem entrega integrada — taxa sempre zero, sem rotear.
      legacy = { plan: 1, deliveryFee: 0, distanceMeters: 0, durationSeconds: 0, polyline: null, routeSource: null };
    } else if (quote.inArea === true && route) {
      legacy = {
        plan: storePlan,
        deliveryFee: direct ? await directDeliveryFee(route.distanceKm) : await calculateDeliveryFeeWithConfig(route.distanceKm),
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        polyline: route.polyline || null,
        routeSource: route.source, // 'routes' | 'directions' | 'haversine' (transparência)
      };
    } else {
      // Fora da área, sem endereço, loja sem localização ou rota indisponível: nada a cobrar.
      legacy = { plan: storePlan, deliveryFee: null, distanceMeters: null, durationSeconds: null, polyline: null, routeSource: route?.source ?? null };
    }
    return res.json({ ...legacy, ...quote });
  } catch (err: any) {
    logger.error('Erro ao gerar orçamento de entrega', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * GET /orders/:id/reorder — "Comprar de novo". Só o dono (cliente) do pedido.
 * Preço e estoque vêm do banco AGORA; o snapshot do OrderItem só serve para `previousPrice`.
 * Loja invisível na vitrine (KYC e/ou mensalidade) deixa todos os itens como STORE_UNAVAILABLE.
 */
export const getReorder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (order.customerId !== userId) return res.status(403).json({ error: 'Sem permissão para acessar este pedido' });

    const visibility = await publicStoreVisibilityWhere();
    const [store, visible, products] = await Promise.all([
      prisma.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } }),
      prisma.store.count({ where: { AND: [{ id: order.storeId }, visibility] } }),
      prisma.product.findMany({ where: { id: { in: order.items.map((i) => i.productId) } } }),
    ]);
    const storeAvailable = Boolean(store) && visible > 0;
    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = order.items.map((it) => {
      const p = productMap.get(it.productId);
      const previousPrice = Number(it.price);
      const stock = p ? Math.max(0, p.quantity) : 0;
      let reason: 'DELETED' | 'OUT_OF_STOCK' | 'STORE_UNAVAILABLE' | null = null;
      if (!storeAvailable) reason = 'STORE_UNAVAILABLE';
      else if (!p) reason = 'DELETED';
      // D1: pausado pelo lojista = indisponível (mesmo motivo do esgotado; o front já trata).
      else if (!p.isActive || stock <= 0) reason = 'OUT_OF_STOCK';
      const price = p ? Number(p.price) : previousPrice;
      return {
        productId: it.productId,
        name: p?.name ?? 'Produto removido',
        image: p?.image ?? p?.images?.[0] ?? null,
        price,
        previousPrice,
        quantity: reason ? 0 : Math.min(it.quantity, stock),
        requestedQuantity: it.quantity,
        available: reason === null,
        priceChanged: Boolean(p) && price !== previousPrice,
        reason,
      };
    });

    return res.json({
      success: true,
      data: { storeId: order.storeId, storeName: store?.name ?? '', storeAvailable, items },
    });
  } catch (err: any) {
    logger.error('Erro ao montar "comprar de novo"', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
