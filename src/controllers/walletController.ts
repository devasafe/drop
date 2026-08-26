import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import walletService from '../services/wallet.prisma.service';
import { toApiWallet, loadWalletHistory, entryToHistory } from '../repositories/wallet.repository';
import { recordCashboxEntry } from '../repositories/appCashbox.repository';
import payoutService from '../services/payout.service';
import { calculateOrderDistribution, getStorePlanFee } from '../utils/walletCalculations';
import { findWRByMotoboy } from '../repositories/withdrawalRequest.repository';
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { emitWalletUpdated, emitWalletTransferCompleted } from '../utils/socketEmitter';
import env from '../config/env';

/**
 * Reconcilia os buckets de saldo de um recebedor (store/motoboy) a partir dos
 * Payouts (fonte da verdade) e persiste no cache da Wallet. Substitui o
 * `Payout.aggregate` do Mongo.
 */
async function reconcileFromPayouts(
  recipientType: 'store' | 'motoboy',
  recipientId: string,
  walletId: string,
): Promise<{ balance: number; totalIncome: number; availableBalance: number; pendingBalance: number }> {
  const grouped = await prisma.payout.groupBy({
    by: ['status'],
    where: { recipientType, recipientId },
    _sum: { amount: true },
  });
  const sums: Record<string, number> = {};
  for (const g of grouped) sums[g.status] = g._sum.amount ? Number(g._sum.amount) : 0;

  const pendingBalance = sums['pending'] || 0;
  const availableBalance = sums['released'] || 0;
  const paidTotal = sums['paid'] || 0;
  const requestedTotal = sums['requested'] || 0;
  const totalIncome = availableBalance + requestedTotal + paidTotal;
  const balance = availableBalance + requestedTotal;

  await prisma.wallet.update({
    where: { id: walletId },
    data: { availableBalance, pendingBalance, totalIncome, balance },
  });

  return { balance, totalIncome, availableBalance, pendingBalance };
}

/**
 * GET /wallets/:userId
 * Consultar saldo de um usuário
 */
export const getWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    // Carteira pessoal do usuário (para saques ao banco). Motoboys e lojistas
    // têm buckets separados (ownerType 'motoboy' e 'store') — usar endpoints dedicados.
    // Autoheal: só cria a carteira se o usuário existe.
    const existing = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: userId, ownerType: 'user' } } });
    if (!existing) {
      const userDoc = await userRepository.findById(userId);
      if (!userDoc) return res.status(404).json({ error: 'Carteira não encontrada' });
    }
    const wallet = await walletService.getOrCreate(userId, 'user');
    const history = await loadWalletHistory(wallet.id);
    const api = toApiWallet(wallet, history);

    return res.json({
      owner: userId,
      ownerType: api.ownerType,
      balance: api.balance,
      totalIncome: api.totalIncome,
      totalSpent: api.totalSpent,
      availableBalance: api.availableBalance ?? api.balance,
      pendingBalance: api.pendingBalance ?? 0,
      gamificationBenefits: api.gamificationBenefits,
      history: api.history,
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * GET /wallets/store/:storeId
 * Consultar saldo da loja
 */
export const getStoreWallet = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;

    // ✅ SEGURANÇA (IDOR): só o dono da loja ou um admin pode ver a carteira.
    const requesterId = (req as any).user?.id;
    const requesterRole = (req as any).user?.activeRole || (req as any).user?.role;
    const ADMIN_VIEW = ['ceo', 'gerente_geral', 'gerente_lojistas'];
    const storeOwner = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
    if (!storeOwner) return res.status(404).json({ error: 'Carteira da loja não encontrada' });
    if (String(storeOwner.ownerId) !== String(requesterId) && !ADMIN_VIEW.includes(requesterRole)) {
      return res.status(403).json({ error: 'Acesso negado à carteira da loja' });
    }

    const wallet = await walletService.getOrCreate(storeId, 'store');

    // Reconcilia saldos a partir dos Payouts (self-healing): a fonte da verdade
    // são os registros de Payout, não os contadores denormalizados na wallet.
    const { balance, totalIncome, availableBalance, pendingBalance } = await reconcileFromPayouts('store', storeId, wallet.id);

    const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
    const plan = store?.plan || 1;
    const feePercent = await getStorePlanFee(storeId);
    const history = (await loadWalletHistory(wallet.id)).map(entryToHistory);

    return res.json({
      owner: storeId,
      ownerType: 'store',
      plan,
      feePercent,
      balance,
      totalIncome,
      totalSpent: Number(wallet.totalSpent),
      availableBalance,
      pendingBalance,
      history,
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/:userId/topup — recarrega o saldo com pagamento REAL via Asaas.
 * body: { amount, method: 'pix'|'credit_card'|'debit_card', card?, holder? }
 * Cria a cobrança e um WalletTopup 'pending'. O saldo SÓ é creditado quando o
 * webhook confirmar o pagamento (creditWalletTopupByPayment) — nada de crédito fake.
 */
export const createWalletTopup = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (String((req as any).user?.id) !== String(userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { amount, method, card, holder } = req.body || {};
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'Valor inválido' });
    if (!['pix', 'credit_card', 'debit_card'].includes(method)) return res.status(400).json({ error: 'Forma de pagamento inválida' });
    if (env.PAYMENT_GATEWAY !== 'asaas') return res.status(400).json({ error: 'Pagamento online não está configurado' });

    const { ensureAsaasCustomer, createPixCharge, createCardCharge } = await import('../services/asaas/payment');
    const customerId = await ensureAsaasCustomer(String(userId)); // lança msg clara se faltar CPF
    if (!customerId) return res.status(400).json({ error: 'Não foi possível iniciar o pagamento (cliente Asaas).' });

    const topup = await prisma.walletTopup.create({ data: { userId: String(userId), amount: value, method, status: 'pending' } });

    try {
      if (method === 'pix') {
        const charge = await createPixCharge({ customerId, value, orderId: topup.id, description: 'Recarga de saldo Drop' });
        await prisma.walletTopup.update({ where: { id: topup.id }, data: { asaasPaymentId: charge.paymentId } });
        return res.json({
          topupId: topup.id, method, status: charge.status, asaasPaymentId: charge.paymentId,
          pix: { qrCodeImage: charge.qrCodeImage, qrCodePayload: charge.qrCodePayload, expiresAt: charge.expiresAt },
        });
      }
      // Cartão (crédito/débito) — mesma cobrança de cartão do checkout.
      if (!card || !holder) return res.status(400).json({ error: 'Dados do cartão incompletos' });
      const remoteIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
      const result = await createCardCharge({ customerId, value, orderId: topup.id, description: 'Recarga de saldo Drop', remoteIp, card, holder });
      await prisma.walletTopup.update({ where: { id: topup.id }, data: { asaasPaymentId: result.paymentId } });
      // Cartão costuma confirmar na hora (CONFIRMED/RECEIVED) → credita já.
      const paidNow = ['CONFIRMED', 'RECEIVED'].includes(String(result.status));
      if (paidNow) {
        const { creditWalletTopupByPayment } = await import('../services/asaas/walletTopup');
        await creditWalletTopupByPayment(result.paymentId);
      }
      return res.json({ topupId: topup.id, method, status: result.status, asaasPaymentId: result.paymentId, paid: paidNow });
    } catch (err: any) {
      await prisma.walletTopup.update({ where: { id: topup.id }, data: { status: 'failed' } }).catch(() => {});
      const msg = err?.errors?.[0]?.description || err?.message || 'Falha ao processar o pagamento';
      return res.status(400).json({ error: msg });
    }
  } catch (err: any) {
    console.error('[WALLET TOPUP ERROR]', err);
    return res.status(500).json({ error: err?.message || 'Erro ao iniciar recarga' });
  }
};

/** GET /wallets/topup/:topupId/status — polling do status da recarga (PIX). */
export const getWalletTopupStatus = async (req: Request, res: Response) => {
  try {
    const { topupId } = req.params;
    const topup = await prisma.walletTopup.findUnique({ where: { id: String(topupId) } });
    if (!topup) return res.status(404).json({ error: 'Recarga não encontrada' });
    if (String((req as any).user?.id) !== String(topup.userId)) return res.status(403).json({ error: 'Acesso negado' });
    return res.json({ status: topup.status, amount: Number(topup.amount), method: topup.method });
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao consultar recarga' });
  }
};

/**
 * GET /wallets/:userId/client-summary — resumo POSITIVO da carteira do cliente.
 * Só métricas com base real (nada inventado):
 *   available       = saldo em dinheiro (wallet.balance)
 *   refundPending   = reembolsos ainda em processamento (Cancellation refundStatus='pending')
 *   refundReceived  = total que já voltou pra carteira (WalletEntry category='refund')
 *   totalSaved      = economia com cupons = Σ max(0, subtotal + deliveryFee - totalValue)
 *                     dos pedidos válidos (o desconto do cupom é embutido no totalValue).
 * NÃO expõe gasto total (decisão de produto). Cashback e crédito promocional NÃO
 * existem no backend → não são incluídos.
 */
export const getClientWalletSummary = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (String((req as any).user?.id) !== String(userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const wallet = await walletService.getOrCreate(String(userId), 'user');

    const [pendingRow] = await prisma.$queryRaw<Array<{ v: number }>>`
      SELECT COALESCE(SUM(c."refundAmount"), 0)::float8 AS v
      FROM "Cancellation" c JOIN "Order" o ON o.id = c."orderId"
      WHERE o."customerId" = ${String(userId)} AND c."refundStatus" = 'pending'`;
    const [savedRow] = await prisma.$queryRaw<Array<{ v: number }>>`
      SELECT COALESCE(SUM(GREATEST(0, "subtotal" + "deliveryFee" - "totalValue")), 0)::float8 AS v
      FROM "Order"
      WHERE "customerId" = ${String(userId)}
        AND "status" NOT IN ('cancelado', 'rejeitado')
        AND "subtotal" IS NOT NULL`;
    const refundAgg = await prisma.walletEntry.aggregate({
      where: { walletId: wallet.id, category: 'refund' },
      _sum: { amount: true },
    });

    return res.json({
      available: Number(wallet.balance),
      refundPending: Number(pendingRow?.v || 0),
      refundReceived: refundAgg._sum.amount ? Number(refundAgg._sum.amount) : 0,
      totalSaved: Number(savedRow?.v || 0),
    });
  } catch (err: any) {
    console.error('[CLIENT WALLET SUMMARY ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar resumo da carteira' });
  }
};

// Estados de pedido que reconhecem receita (não cancelados/rejeitados).
const STORE_BILLABLE_STATUSES: any[] = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];

/**
 * GET /wallets/store/:storeId/summary — central financeira da loja.
 *
 * Buckets LÍQUIDOS (após comissão) vêm dos Payouts da loja (fonte da verdade,
 * cada payout em um status por vez → sem dupla contagem):
 *   netEarned = pending + released(available) + requested + paid
 * Buckets BRUTOS vêm dos Orders billable (produto, sem entrega):
 *   grossSales = Σ (totalValue - deliveryFee) dos pedidos billable
 *   commission = grossSales - netEarned  (única dedução da loja = comissão do plano)
 * Cancelado = Σ (totalValue - deliveryFee) dos pedidos cancelados/rejeitados.
 */
export const getStoreFinancialSummary = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const requesterId = (req as any).user?.id;
    const requesterRole = (req as any).user?.activeRole || (req as any).user?.role;
    const ADMIN_VIEW = ['ceo', 'gerente_geral', 'gerente_lojistas'];
    const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    if (String(store.ownerId) !== String(requesterId) && !ADMIN_VIEW.includes(requesterRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buckets líquidos (payouts) — mesma agregação do resumo do motoboy.
    const net = await payoutService.getEarningsSummary('store', String(storeId));

    // Vendas brutas (produto = totalValue - deliveryFee) por período, só billable.
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const grossOf = async (where: any) => {
      const agg = await prisma.order.aggregate({ where, _sum: { totalValue: true, deliveryFee: true } });
      return Math.max(0, Number(agg._sum.totalValue || 0) - Number(agg._sum.deliveryFee || 0));
    };
    const [grossSales, grossThisMonth, grossToday, cancelledValue, billableCount, cancelledCount] = await Promise.all([
      grossOf({ storeId: String(storeId), status: { in: STORE_BILLABLE_STATUSES } }),
      grossOf({ storeId: String(storeId), status: { in: STORE_BILLABLE_STATUSES }, createdAt: { gte: startMonth } }),
      grossOf({ storeId: String(storeId), status: { in: STORE_BILLABLE_STATUSES }, createdAt: { gte: startDay } }),
      grossOf({ storeId: String(storeId), status: { in: ['cancelado', 'rejeitado'] as any } }),
      prisma.order.count({ where: { storeId: String(storeId), status: { in: STORE_BILLABLE_STATUSES } } }),
      prisma.order.count({ where: { storeId: String(storeId), status: { in: ['cancelado', 'rejeitado'] as any } } }),
    ]);

    const commissionPercent = await getStorePlanFee(String(storeId)); // % que a Drop retém
    const commission = Math.max(0, Math.round((grossSales - net.totalEarned) * 100) / 100);
    const ticketMedio = billableCount > 0 ? Math.round((grossSales / billableCount) * 100) / 100 : 0;

    return res.json({
      pending: net.pending,
      available: net.available,
      requested: net.requested,
      paid: net.paid,
      netEarned: net.totalEarned,
      netThisMonth: net.earnedThisMonth,
      netToday: net.earnedToday,
      grossSales,
      grossThisMonth,
      grossToday,
      cancelledValue,
      commission,
      commissionPercent,
      retainPercent: Math.round((100 - commissionPercent) * 100) / 100,
      plan: store.plan || 1,
      billableCount,
      cancelledCount,
      ticketMedio,
    });
  } catch (err: any) {
    console.error('[STORE FINANCIAL SUMMARY ERROR]', err);
    return res.status(500).json({ error: 'Erro ao carregar resumo financeiro' });
  }
};

/**
 * POST /wallets/store/:storeId/transfer-to-owner
 * Lojista transfere o saldo disponível (payouts released) para a carteira de usuário
 * do dono da loja. O dinheiro continua na plataforma — só muda de bucket.
 * Para sacar pro banco, o user usa a flow de saque a partir do user wallet.
 */
export const transferStoreToOwner = async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const store = await prisma.store.findUnique({ where: { id: String(storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
    if (String(store.ownerId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o dono da loja pode transferir' });
    }

    // Payouts released (disponíveis para transferência)
    const releasedPayouts = await prisma.payout.findMany({
      where: { recipientType: 'store', recipientId: String(storeId), status: 'released' },
    });
    const total = releasedPayouts.reduce((s, p) => s + Number(p.amount), 0);
    if (total <= 0) return res.status(400).json({ error: 'Nenhum saldo disponível para transferir' });

    const transferId = `internal_store_to_owner_${storeId}_${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      // Marca payouts como pagos (transferência interna — não debita AppCashbox).
      await payoutService.markPayoutsPaid(
        releasedPayouts.map((p) => p.id), transferId, tx, { skipCashboxDebit: true },
      );

      // Credita a carteira de usuário do dono.
      const credited = await walletService.credit(
        { owner: String(userId), ownerType: 'user', amount: total, reason: `Transferência da carteira da loja "${store.name || storeId}"`, category: 'transfer', relatedId: storeId, reference: transferId },
        tx,
      );

      // Anota o débito no ledger da carteira da loja (reconciliada por Payout).
      const storeWallet = await walletService.getOrCreate(storeId, 'store', tx);
      await tx.wallet.update({ where: { id: storeWallet.id }, data: { totalSpent: { increment: total } } });
      await tx.walletEntry.create({ data: { walletId: storeWallet.id, type: 'debit', category: 'transfer', amount: total, reason: 'Transferência para carteira do dono', relatedId: String(userId), reference: transferId } });

      return credited;
    });

    return res.json({
      success: true,
      transferred: total,
      newUserBalance: Number(result.balance),
      payoutsTransferred: releasedPayouts.length,
    });
  } catch (err: any) {
    console.error('[transferStoreToOwner ERROR]', err);
    return res.status(500).json({ error: 'Erro ao transferir saldo' });
  }
};

/**
 * GET /wallets/motoboy/:motoboyId
 * Consulta a carteira de repasse do motoboy (ownerType='motoboy'), reconciliada
 * a partir dos Payouts. Autoheal se não existir ainda.
 */
export const getMotoboyWallet = async (req: Request, res: Response) => {
  try {
    const { motoboyId } = req.params;

    // ✅ SEGURANÇA (IDOR): só o próprio motoboy ou um admin pode ver a carteira.
    const requesterId = (req as any).user?.id;
    const requesterRole = (req as any).user?.activeRole || (req as any).user?.role;
    const ADMIN_VIEW = ['ceo', 'gerente_geral', 'gerente_motoboys'];
    if (String(motoboyId) !== String(requesterId) && !ADMIN_VIEW.includes(requesterRole)) {
      return res.status(403).json({ error: 'Acesso negado à carteira do motoboy' });
    }

    const existing = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: motoboyId, ownerType: 'motoboy' } } });
    if (!existing) {
      const exists = await userRepository.findById(motoboyId);
      if (!exists) return res.status(404).json({ error: 'Carteira do motoboy não encontrada' });
    }
    const wallet = await walletService.getOrCreate(motoboyId, 'motoboy');

    // Reconcilia saldos a partir dos Payouts (fonte da verdade)
    const { balance, totalIncome, availableBalance, pendingBalance } = await reconcileFromPayouts('motoboy', motoboyId, wallet.id);
    const history = (await loadWalletHistory(wallet.id)).map(entryToHistory);

    return res.json({
      owner: motoboyId,
      ownerType: 'motoboy',
      balance,
      totalIncome,
      totalSpent: Number(wallet.totalSpent),
      availableBalance,
      pendingBalance,
      gamificationBenefits: wallet.gamificationBenefits || {},
      history,
    });
  } catch (err: any) {
    console.error('[getMotoboyWallet ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/motoboy/:motoboyId/transfer-to-owner
 * Motoboy transfere o saldo disponível (payouts released) da carteira de repasse
 * para a carteira pessoal (ownerType='user'). Para sacar pro banco, usa o flow de
 * saque a partir do user wallet.
 */
export const transferMotoboyToOwner = async (req: Request, res: Response) => {
  try {
    const { motoboyId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    if (String(motoboyId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o próprio motoboy pode transferir' });
    }

    const releasedPayouts = await prisma.payout.findMany({
      where: { recipientType: 'motoboy', recipientId: String(motoboyId), status: 'released' },
    });
    const total = releasedPayouts.reduce((s, p) => s + Number(p.amount), 0);
    if (total <= 0) return res.status(400).json({ error: 'Nenhum saldo disponível para transferir' });

    const transferId = `internal_motoboy_to_owner_${motoboyId}_${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      await payoutService.markPayoutsPaid(releasedPayouts.map((p) => p.id), transferId, tx, { skipCashboxDebit: true });

      const credited = await walletService.credit(
        { owner: String(userId), ownerType: 'user', amount: total, reason: 'Transferência da carteira de motoboy', category: 'transfer', relatedId: String(motoboyId), reference: transferId },
        tx,
      );

      const motoboyWallet = await walletService.getOrCreate(motoboyId, 'motoboy', tx);
      await tx.wallet.update({ where: { id: motoboyWallet.id }, data: { totalSpent: { increment: total } } });
      await tx.walletEntry.create({ data: { walletId: motoboyWallet.id, type: 'debit', category: 'transfer', amount: total, reason: 'Transferência para carteira pessoal', relatedId: String(userId), reference: transferId } });

      return credited;
    });

    return res.json({
      success: true,
      transferred: total,
      newUserBalance: Number(result.balance),
      payoutsTransferred: releasedPayouts.length,
    });
  } catch (err: any) {
    console.error('[transferMotoboyToOwner ERROR]', err);
    return res.status(500).json({ error: 'Erro ao transferir saldo' });
  }
};

/**
 * POST /wallets/:userId/credit
 * Cliente adiciona saldo (carrega crédito)
 */
export const creditWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, paymentMethod, reference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const wallet = await walletService.credit({
      owner: userId, ownerType: 'user', amount,
      reason: `Carregamento de saldo via ${paymentMethod}`,
      category: 'deposit', paymentMethod, reference,
    });

    // 💰 Notificar usuário em tempo real
    emitWalletUpdated(userId, 'cliente', {
      balance: Number(wallet.balance),
      totalIncome: Number(wallet.totalIncome),
      totalSpent: Number(wallet.totalSpent),
      updatedAt: new Date(),
    });

    return res.json({
      success: true,
      newBalance: Number(wallet.balance),
      transactionId: wallet.id,
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/:userId/transfer
 * Motoboy ou Lojista saca para banco
 */
export const transferWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, bankAccount, reason } = req.body;

    const existing = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: userId, ownerType: 'user' } } });
    if (!existing) return res.status(404).json({ error: 'Carteira não encontrada' });
    if (Number(existing.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente', available: Number(existing.balance), requested: amount });
    }

    // Débito atômico (WHERE balance >= amount por dentro do serviço).
    const wallet = await walletService.debit({
      owner: userId, ownerType: 'user', amount,
      reason: reason || `Transferência para banco (${bankAccount.banco})`,
      category: 'withdrawal', paymentMethod: 'bank_transfer', reference: `TRF_${Date.now()}`,
    });

    // 💸 Notificar usuário do saldo atualizado
    emitWalletUpdated(userId, 'motoboy', {
      balance: Number(wallet.balance),
      totalIncome: Number(wallet.totalIncome),
      totalSpent: Number(wallet.totalSpent),
      updatedAt: new Date(),
    });

    // TODO: Integrar com sistema de transferência bancária (gateway)

    return res.json({
      success: true,
      newBalance: Number(wallet.balance),
      transferId: `TRF_${Date.now()}`,
      status: 'pending'
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * GET /wallets/:userId/history
 * Histórico de transações
 */
export const getWalletHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // `owner` sem ownerType: acha a carteira de qualquer papel do id.
    let wallet = await prisma.wallet.findFirst({ where: { owner: userId } });

    if (!wallet) {
      // Autoheal: cria wallet sob demanda (user, motoboy ou store)
      const [userDoc, storeDoc] = await Promise.all([
        userRepository.findById(userId),
        prisma.store.findUnique({ where: { id: String(userId) } }),
      ]);
      if (!userDoc && !storeDoc) {
        return res.status(404).json({ error: 'Carteira não encontrada' });
      }
      let ownerType: 'user' | 'motoboy' | 'store' = 'user';
      if (storeDoc) ownerType = 'store';
      else if ((userDoc as any)?.role === 'motoboy') ownerType = 'motoboy';
      wallet = await walletService.getOrCreate(userId, ownerType);
    }

    const total = await prisma.walletEntry.count({ where: { walletId: wallet.id } });
    const entries = await prisma.walletEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: Number(offset),
      take: Number(limit),
    });

    return res.json({
      total,
      limit: Number(limit),
      offset: Number(offset),
      history: entries.map(entryToHistory),
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * GET /wallets/platform/metrics
 * Métricas gerais da plataforma (CEO only)
 */
export const getPlatformMetrics = async (req: Request, res: Response) => {
  try {
    const platformWallet = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: 'platform', ownerType: 'platform' } } });
    if (!platformWallet) {
      return res.status(404).json({ error: 'Carteira da plataforma não encontrada' });
    }
    const history = (await loadWalletHistory(platformWallet.id, 20)).map(entryToHistory);

    return res.json({
      totalBalance: Number(platformWallet.balance),
      totalIncome: Number(platformWallet.totalIncome),
      totalSpent: Number(platformWallet.totalSpent),
      history,
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * GET /my-wallet
 * Carteira do usuário logado
 */
export const getMyWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      console.warn('⚠️ getMyWallet: No user ID');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Buscar user com segurança
    let user: any = null;
    try {
      user = await userRepository.findById(userId);
      console.log('✅ User encontrado:', { userId, name: user?.name });
    } catch (userErr: any) {
      console.warn('⚠️ Erro ao buscar user:', userErr.message);
    }

    // ✅ NOVO: Buscar role do parâmetro ou usar activeRole do user
    let role = req.params.role || user?.activeRole || user?.role || 'cliente';
    console.log('🔍 getMyWallet chamado:', { userId, role, storeId: user?.storeId });
    
    // Determinar ownerType baseado no role
    let ownerType = 'user';
    let owner = userId;

    if (role === 'lojista' && user?.storeId) {
      // Se é lojista e tem loja, buscar carteira da loja
      ownerType = 'store';
      owner = user.storeId.toString();
      console.log('🏪 Buscando carteira de LOJA:', { owner, ownerType });
    } else if (role === 'motoboy') {
      // Se é motoboy, buscar carteira de motoboy
      ownerType = 'motoboy';
      console.log('🏍️ Buscando carteira de MOTOBOY:', { owner, ownerType, userId });
    } else {
      console.log('👤 Buscando carteira de CLIENTE:', { owner, ownerType });
    }

    // Busca/cria a wallet do papel.
    const walletRow = await walletService.getOrCreate(owner, ownerType as any);
    const walletEntries = await loadWalletHistory(walletRow.id, 50);
    const wallet: any = toApiWallet(walletRow, walletEntries);

    // Preparar response data PADRONIZADO
    let userInfo: any = {
      name: user?.name || 'Usuário',
      email: user?.email || '',
      id: userId
    };

    let storeInfo: any = null;
    if (role === 'lojista' && user?.storeId) {
      try {
        const store = await prisma.store.findUnique({ where: { id: String(user.storeId) } }) as any;
        storeInfo = {
          _id: user.storeId,
          name: store?.name || 'Loja'
        };
      } catch (storeErr: any) {
        console.warn('⚠️ Erro ao buscar data de loja:', storeErr.message);
      }
    }

    // ✅ ESTRUTURA PADRONIZADA
    let responseData: any = {
      // Identificação
      _id: wallet._id,
      owner,
      ownerType,
      role,
      
      // Saldos (sempre presentes)
      balance: wallet.balance || 0,
      totalIncome: wallet.totalIncome || 0,
      totalSpent: wallet.totalSpent || 0,
      
      // Informações do usuário
      user: userInfo,
      
      // Informações da loja (para lojistas)
      store: storeInfo,
      
      // Benefícios de gamificação
      gamificationBenefits: wallet.gamificationBenefits || {
        freeDeliveriesAvailable: 0,
        discountPercentage: 0
      },
      
      // Histórico transacional (últimas 50)
      history: (wallet.history || [])
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 50)
        .map((h: any) => ({
          date: h.date,
          type: h.type,
          category: h.category,
          amount: h.amount,
          reason: h.reason,
          paymentMethod: h.paymentMethod,
          relatedId: h.relatedId,
          reference: h.reference
        }))
    };

    // ✅ Dados específicos para MOTOBOY
    if (role === 'motoboy') {
      responseData.motoboy = {
        withdrawalRequests: [],
        minimumWithdraw: 50,
        totalRequestedAmount: 0,
        totalApprovedAmount: 0,
        pendingWithdrawals: 0
      };
      
      // Tentar buscar withdrawal requests
      try {
        console.log('🔄 Buscando WithdrawalRequests...');
        const withdrawals = await findWRByMotoboy(String(userId));
        const pending = withdrawals.filter((w: any) => w.status === 'pending');
        const approved = withdrawals.filter((w: any) => w.status === 'approved');
        
        responseData.motoboy.withdrawalRequests = withdrawals || [];
        responseData.motoboy.totalRequestedAmount = withdrawals.reduce((sum: number, w: any) => sum + w.amount, 0);
        responseData.motoboy.totalApprovedAmount = approved.reduce((sum: number, w: any) => sum + w.amount, 0);
        responseData.motoboy.pendingWithdrawals = pending.length;
        console.log('✅ WithdrawalRequests encontrados:', withdrawals?.length || 0);
      } catch (withdrawalErr: any) {
        console.warn('⚠️ Erro ao buscar WithdrawalRequests (continuando):', withdrawalErr.message);
      }
      
      // Buscar config do sistema
      try {
        console.log('🔄 Buscando PlatformConfig...');
        const config = await getPlatformConfig();
        responseData.motoboy.minimumWithdraw = config?.motoboyMinimumWithdraw || 50;
        responseData.motoboy.motoboyCutPerDelivery = config?.motoboyCutPerDelivery || 5;
        responseData.motoboy.motoboyCutPerKm = config?.motoboyCutPerKm || 1;
        console.log('✅ PlatformConfig encontrado');
      } catch (configErr: any) {
        console.warn('⚠️ Erro ao buscar PlatformConfig (continuando):', configErr.message);
      }
    }

    // ✅ Dados específicos para LOJISTA
    if (role === 'lojista') {
      responseData.lojista = {
        platformFeeRate: wallet.platformFeeRate || 0,
        storeId: user?.storeId || null
      };
    }

    console.log('✅ Retornando response:', { owner, ownerType, balance: responseData.balance, role });
    return res.json(responseData);
    
  } catch (err: any) {
    console.error('❌ ERRO FATAL em getMyWallet:', { 
      message: err.message, 
      stack: err.stack,
      name: err.name 
    });
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/transfer
 * Transferência entre carteiras (usuário logado)
 */
export const transferBetweenWallets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { toUserId, toWalletId, amount, reason, fromStoreId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    // ✅ Determinar carteira de ORIGEM
    // - Se fromStoreId foi fornecido: é da loja para usuário
    // - Senão: é do usuário para loja
    // ORIGEM
    let fromRef: { owner: string; ownerType: 'user' | 'store' };
    if (fromStoreId) {
      const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: fromStoreId, ownerType: 'store' } } });
      if (!w) return res.status(404).json({ error: 'Carteira de loja não encontrada' });
      fromRef = { owner: fromStoreId, ownerType: 'store' };
    } else {
      const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: userId, ownerType: 'user' } } });
      if (!w) return res.status(404).json({ error: 'Sua carteira não encontrada' });
      fromRef = { owner: userId, ownerType: 'user' };
    }

    // DESTINO
    let toRef: { owner: string; ownerType: 'user' | 'store' } | null = null;
    if (toUserId) {
      const targetUser = await userRepository.findById(toUserId);
      if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado' });
      if (fromStoreId) {
        toRef = { owner: toUserId, ownerType: 'user' };
      } else {
        if (!targetUser.storeId) return res.status(404).json({ error: 'Usuário não possui loja' });
        toRef = { owner: String(targetUser.storeId), ownerType: 'store' };
      }
    } else if (toWalletId) {
      const w = await prisma.wallet.findUnique({ where: { id: String(toWalletId) } });
      if (!w) return res.status(404).json({ error: 'Carteira destino não encontrada' });
      toRef = { owner: w.owner, ownerType: w.ownerType as any };
    } else {
      return res.status(400).json({ error: 'Carteira destino não especificada' });
    }

    const fromWalletRow = await walletService.getOrCreate(fromRef.owner, fromRef.ownerType);
    if (Number(fromWalletRow.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const transferRef = `TRF_${Date.now()}`;
    // Transferência atômica: débito da origem + crédito do destino, tudo-ou-nada.
    const { from: updatedFrom } = await walletService.transfer({
      from: fromRef, to: toRef, amount, reason: reason || 'Transferência', reference: transferRef,
    });

    const fromOwnerId = fromStoreId || userId;
    const fromOwnerType = fromStoreId ? 'lojista' : 'cliente';
    emitWalletUpdated(fromOwnerId as string, fromOwnerType as any, {
      balance: Number(updatedFrom.balance),
      totalIncome: Number(updatedFrom.totalIncome),
      totalSpent: Number(updatedFrom.totalSpent),
      updatedAt: new Date(),
    });
    if (toUserId) {
      emitWalletTransferCompleted(fromOwnerId as string, toUserId, amount, transferRef);
    }

    return res.json({
      success: true,
      message: 'Transferência realizada com sucesso',
      newBalance: Number(updatedFrom.balance),
      transferId: transferRef,
    });
  } catch (err: any) {
    console.error('❌ Transfer error:', err.message);
    return res.status(500).json({ error: 'Erro ao processar transferência' });
  }
};

/**
 * POST /wallets/platform/initialize
 * Inicializa carteira da plataforma (apenas para setup)
 */
export const initializePlatformWallet = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: 'platform', ownerType: 'platform' } } });
    if (existing) {
      return res.status(400).json({ error: 'Carteira da plataforma já existe' });
    }

    const wallet = await walletService.getOrCreate('platform', 'platform');

    return res.json({
      success: true,
      wallet: toApiWallet(wallet),
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/:userId/refund
 * Processa reembolso para carteira do usuário
 * Usado quando pedido é cancelado
 */
export const refundWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, orderId, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor de reembolso inválido' });
    }

    // Reembolso é `type: 'refund'` e NÃO conta como entrada (totalIncome). Além disso
    // reduz totalSpent (o gasto foi desfeito). Por isso não usa walletService.credit.
    const base = await walletService.getOrCreate(userId, 'user');
    const newTotalSpent = Math.max(0, Number(base.totalSpent) - amount);
    const wallet = await prisma.$transaction(async (tx) => {
      await tx.walletEntry.create({
        data: {
          walletId: base.id, type: 'refund', category: 'refund', amount,
          reason: reason || `Reembolso do pedido ${orderId}`, paymentMethod: 'refund',
          relatedId: orderId, reference: `REFUND_${orderId}`,
        },
      });
      return tx.wallet.update({
        where: { id: base.id },
        data: { balance: { increment: amount }, totalSpent: newTotalSpent },
      });
    });

    return res.json({
      success: true,
      newBalance: Number(wallet.balance),
      refundAmount: amount,
      orderId,
      refundedAt: new Date()
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/:walletId/withdraw
 * Saque simples: remove saldo da carteira
 */
export const withdrawWallet = async (req: Request, res: Response) => {
  try {
    const { walletId } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const walletRow = await prisma.wallet.findUnique({ where: { id: String(walletId) } });
    if (!walletRow) return res.status(404).json({ error: 'Carteira não encontrada' });
    if (Number(walletRow.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    // Débito atômico via serviço (WHERE balance >= amount).
    const wallet = await walletService.debit({
      owner: walletRow.owner, ownerType: walletRow.ownerType as any, amount,
      reason: reason || 'Saque', category: 'withdrawal', paymentMethod: 'bank_transfer', reference: `WITHDRAW_${Date.now()}`,
    });

    return res.json({
      success: true,
      message: 'Saque realizado com sucesso',
      newBalance: Number(wallet.balance),
      withdrawAmount: amount,
      withdrawId: `WITHDRAW_${Date.now()}`
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/transfer-to-motoboy
 * Transferir saldo de carteira de usuário para carteira de motoboy
 * ✅ Apenas o próprio motoboy pode transferir seu saldo
 */
export const transferToMotoboyWallet = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const userWallet = await walletService.getOrCreate(userId, 'user');
    if (Number(userWallet.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const transferAmount = Number(amount);
    const reference = `MOTOBOY_TRANSFER_${Date.now()}`;

    // Transferência atômica user → motoboy (mesmo dono, buckets diferentes).
    const { from: updatedUser, to: updatedMotoboy } = await walletService.transfer({
      from: { owner: userId, ownerType: 'user' },
      to: { owner: userId, ownerType: 'motoboy' },
      amount: transferAmount, reason: 'Transferência para carteira de motoboy', reference,
    });

    return res.json({
      success: true,
      message: 'Transferência para carteira de motoboy realizada com sucesso',
      userWalletBalance: Number(updatedUser.balance),
      motoboyWalletBalance: Number(updatedMotoboy.balance),
      transferedAmount: transferAmount,
      transferId: reference
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

