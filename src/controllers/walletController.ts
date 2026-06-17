import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Wallet from '../models/Wallet';
import User from '../models/User';
import Store from '../models/Store';
import Payout from '../models/Payout';
import payoutService from '../services/payout.service';
import {
  calculateOrderDistribution,
  getStorePlanFee
} from '../utils/walletCalculations';
import WithdrawalRequest from '../models/WithdrawalRequest';
import PlatformConfig from '../models/PlatformConfig';
import { emitWalletUpdated, emitWalletTransferCompleted } from '../utils/socketEmitter';

/**
 * GET /wallets/:userId
 * Consultar saldo de um usuário
 */
export const getWallet = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    // Carteira pessoal do usuário (para saques ao banco). Motoboys e lojistas
    // têm buckets separados (ownerType 'motoboy' e 'store') — usar endpoints dedicados.
    let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });

    if (!wallet) {
      // Autoheal: cria carteira pessoal sob demanda se o user existe
      const userDoc = await User.findById(userId).select('_id').lean();
      if (!userDoc) return res.status(404).json({ error: 'Carteira não encontrada' });
      wallet = await Wallet.create({ owner: userId, ownerType: 'user' });
    }

    return res.json({
      owner: userId,
      ownerType: wallet.ownerType,
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      availableBalance: wallet.availableBalance ?? wallet.balance,
      pendingBalance: wallet.pendingBalance ?? 0,
      gamificationBenefits: wallet.gamificationBenefits || {},
      history: wallet.history.slice(-10)
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
    const storeOwner = await Store.findById(storeId).select('ownerId');
    if (!storeOwner) return res.status(404).json({ error: 'Carteira da loja não encontrada' });
    if (String(storeOwner.ownerId) !== String(requesterId) && !ADMIN_VIEW.includes(requesterRole)) {
      return res.status(403).json({ error: 'Acesso negado à carteira da loja' });
    }

    let wallet = await Wallet.findOne({ owner: storeId, ownerType: 'store' });

    if (!wallet) {
      // Cria carteira sob demanda (autoheal) — a loja já foi validada acima
      wallet = await Wallet.create({ owner: storeId, ownerType: 'store' });
    }

    // Reconcilia saldos a partir dos Payouts (self-healing): a fonte da verdade
    // são os registros de Payout, não os contadores denormalizados na wallet.
    const agg = await Payout.aggregate([
      { $match: { recipientType: 'store', recipientId: new mongoose.Types.ObjectId(storeId) } },
      { $group: { _id: '$status', total: { $sum: '$amount' } } },
    ]);
    const sums: Record<string, number> = {};
    for (const row of agg) sums[row._id] = row.total;
    const pendingBalance = sums['pending'] || 0;
    const availableBalance = sums['released'] || 0;
    const paidTotal = sums['paid'] || 0;
    const requestedTotal = sums['requested'] || 0;
    // totalIncome = tudo que já foi reconhecido como receita (released + requested + paid)
    const totalIncome = availableBalance + requestedTotal + paidTotal;
    // balance = saldo disponível na carteira interna (released + requested, ainda não pago externamente)
    const balance = availableBalance + requestedTotal;

    // Atualiza o cache na wallet se divergiu (não-bloqueante, mas await pra consistência)
    if (
      wallet.availableBalance !== availableBalance ||
      wallet.pendingBalance !== pendingBalance ||
      wallet.totalIncome !== totalIncome ||
      wallet.balance !== balance
    ) {
      wallet.availableBalance = availableBalance;
      wallet.pendingBalance = pendingBalance;
      wallet.totalIncome = totalIncome;
      wallet.balance = balance;
      await wallet.save();
    }

    const store = await Store.findById(storeId);
    const plan = store?.plan || 1;
    const feePercent = await getStorePlanFee(storeId);

    return res.json({
      owner: storeId,
      ownerType: 'store',
      plan,
      feePercent,
      balance,
      totalIncome,
      totalSpent: wallet.totalSpent,
      availableBalance,
      pendingBalance,
      history: wallet.history.slice(-10)
    });
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * POST /wallets/store/:storeId/transfer-to-owner
 * Lojista transfere o saldo disponível (payouts released) para a carteira de usuário
 * do dono da loja. O dinheiro continua na plataforma — só muda de bucket.
 * Para sacar pro banco, o user usa a flow de saque a partir do user wallet.
 */
export const transferStoreToOwner = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { storeId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const store = await Store.findById(storeId).session(session);
    if (!store) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    if (String(store.ownerId) !== String(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Apenas o dono da loja pode transferir' });
    }

    // Payouts released (disponíveis para transferência)
    const releasedPayouts = await Payout.find({
      recipientType: 'store',
      recipientId: new mongoose.Types.ObjectId(storeId),
      status: 'released',
    }).session(session);

    const total = releasedPayouts.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Nenhum saldo disponível para transferir' });
    }

    const transferId = `internal_store_to_owner_${storeId}_${Date.now()}`;

    // Marca payouts como pagos e debita AppCashbox (dinheiro sai do cofre para a carteira do dono)
    await payoutService.markPayoutsPaid(
      releasedPayouts.map((p) => String(p._id)),
      transferId,
      session,
    );

    // Credita user wallet do dono
    let userWallet = await Wallet.findOne({ owner: String(userId), ownerType: 'user' }).session(session);
    const historyEntry = {
      type: 'credit' as const,
      category: 'transfer' as const,
      amount: total,
      reason: `Transferência da carteira da loja "${store.name || storeId}"`,
      relatedId: storeId,
      reference: transferId,
      date: new Date(),
    };

    if (!userWallet) {
      const [created] = await Wallet.create([{
        owner: String(userId),
        ownerType: 'user',
        balance: total,
        totalIncome: total,
        history: [historyEntry],
      }], { session });
      userWallet = created;
    } else {
      userWallet.balance += total;
      userWallet.totalIncome += total;
      userWallet.history.push(historyEntry);
      await userWallet.save({ session });
    }

    // Adiciona history entry no store wallet (debit)
    const storeWallet = await Wallet.findOne({ owner: storeId, ownerType: 'store' }).session(session);
    if (storeWallet) {
      storeWallet.history.push({
        type: 'debit',
        category: 'transfer',
        amount: total,
        reason: 'Transferência para carteira do dono',
        relatedId: String(userId),
        reference: transferId,
        date: new Date(),
      });
      storeWallet.totalSpent = (storeWallet.totalSpent || 0) + total;
      await storeWallet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      transferred: total,
      newUserBalance: userWallet.balance,
      payoutsTransferred: releasedPayouts.length,
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
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

    let wallet = await Wallet.findOne({ owner: motoboyId, ownerType: 'motoboy' });

    if (!wallet) {
      const exists = await User.findById(motoboyId).select('_id role').lean();
      if (!exists) return res.status(404).json({ error: 'Carteira do motoboy não encontrada' });
      wallet = await Wallet.create({ owner: motoboyId, ownerType: 'motoboy' });
    }

    // Reconcilia saldos a partir dos Payouts (fonte da verdade)
    const agg = await Payout.aggregate([
      { $match: { recipientType: 'motoboy', recipientId: new mongoose.Types.ObjectId(motoboyId) } },
      { $group: { _id: '$status', total: { $sum: '$amount' } } },
    ]);
    const sums: Record<string, number> = {};
    for (const row of agg) sums[row._id] = row.total;
    const pendingBalance = sums['pending'] || 0;
    const availableBalance = sums['released'] || 0;
    const paidTotal = sums['paid'] || 0;
    const requestedTotal = sums['requested'] || 0;
    const totalIncome = availableBalance + requestedTotal + paidTotal;
    const balance = availableBalance + requestedTotal;

    if (
      wallet.availableBalance !== availableBalance ||
      wallet.pendingBalance !== pendingBalance ||
      wallet.totalIncome !== totalIncome ||
      wallet.balance !== balance
    ) {
      wallet.availableBalance = availableBalance;
      wallet.pendingBalance = pendingBalance;
      wallet.totalIncome = totalIncome;
      wallet.balance = balance;
      await wallet.save();
    }

    return res.json({
      owner: motoboyId,
      ownerType: 'motoboy',
      balance,
      totalIncome,
      totalSpent: wallet.totalSpent,
      availableBalance,
      pendingBalance,
      gamificationBenefits: wallet.gamificationBenefits || {},
      history: wallet.history.slice(-10)
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { motoboyId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ error: 'Não autenticado' });
    }

    if (String(motoboyId) !== String(userId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Apenas o próprio motoboy pode transferir' });
    }

    const releasedPayouts = await Payout.find({
      recipientType: 'motoboy',
      recipientId: new mongoose.Types.ObjectId(motoboyId),
      status: 'released',
    }).session(session);

    const total = releasedPayouts.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Nenhum saldo disponível para transferir' });
    }

    const transferId = `internal_motoboy_to_owner_${motoboyId}_${Date.now()}`;

    await payoutService.markPayoutsPaid(
      releasedPayouts.map((p) => String(p._id)),
      transferId,
      session,
    );

    let userWallet = await Wallet.findOne({ owner: String(userId), ownerType: 'user' }).session(session);
    const historyEntry = {
      type: 'credit' as const,
      category: 'transfer' as const,
      amount: total,
      reason: 'Transferência da carteira de motoboy',
      relatedId: String(motoboyId),
      reference: transferId,
      date: new Date(),
    };

    if (!userWallet) {
      const [created] = await Wallet.create([{
        owner: String(userId),
        ownerType: 'user',
        balance: total,
        totalIncome: total,
        history: [historyEntry],
      }], { session });
      userWallet = created;
    } else {
      userWallet.balance += total;
      userWallet.totalIncome += total;
      userWallet.history.push(historyEntry);
      await userWallet.save({ session });
    }

    const motoboyWallet = await Wallet.findOne({ owner: motoboyId, ownerType: 'motoboy' }).session(session);
    if (motoboyWallet) {
      motoboyWallet.history.push({
        type: 'debit',
        category: 'transfer',
        amount: total,
        reason: 'Transferência para carteira pessoal',
        relatedId: String(userId),
        reference: transferId,
        date: new Date(),
      });
      motoboyWallet.totalSpent = (motoboyWallet.totalSpent || 0) + total;
      await motoboyWallet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      transferred: total,
      newUserBalance: userWallet.balance,
      payoutsTransferred: releasedPayouts.length,
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
    console.error('[transferMotoboyToOwner ERROR]', err);
    return res.status(500).json({ error: 'Erro ao transferir saldo' });
  }
};

/**
 * POST /wallets/:userId/credit
 * Cliente adiciona saldo (carrega crédito)
 */
export const creditWallet = async (req: Request, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const { amount, paymentMethod, reference } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const historyEntry = {
      type: 'credit' as const,
      category: 'deposit' as const,
      amount,
      reason: `Carregamento de saldo via ${paymentMethod}`,
      paymentMethod,
      date: new Date(),
      reference
    };

    let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' }).session(session);

    if (!wallet) {
      const [created] = await Wallet.create([{
        owner: userId,
        ownerType: 'user',
        balance: amount,
        totalIncome: amount,
        history: [historyEntry]
      }], { session });
      wallet = created;
    } else {
      wallet.balance += amount;
      wallet.totalIncome += amount;
      wallet.history.push(historyEntry);
      await wallet.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // 💰 Notificar usuário em tempo real
    emitWalletUpdated(userId, 'cliente', {
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      updatedAt: new Date(),
    });

    return res.json({
      success: true,
      newBalance: wallet.balance,
      transactionId: wallet._id
    });
  } catch (err: any) {
    await session.abortTransaction();
    session.endSession();
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

    const wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });

    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        error: 'Saldo insuficiente',
        available: wallet.balance,
        requested: amount
      });
    }

    // Debita carteira
    wallet.balance -= amount;
    wallet.totalSpent += amount;
    wallet.history.push({
      type: 'debit',
      category: 'withdrawal',
      amount,
      reason: reason || `Transferência para banco (${bankAccount.banco})`,
      paymentMethod: 'bank_transfer',
      date: new Date(),
      reference: `TRF_${Date.now()}`
    });

    await wallet.save();

    // 💸 Notificar usuário do saldo atualizado
    emitWalletUpdated(userId, 'motoboy', {
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      updatedAt: new Date(),
    });

    // TODO: Integrar com sistema de transferência bancária (gateway)

    return res.json({
      success: true,
      newBalance: wallet.balance,
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

    let wallet = await Wallet.findOne({ owner: userId });

    if (!wallet) {
      // Autoheal: cria wallet sob demanda (user, motoboy ou store)
      const [userDoc, storeDoc] = await Promise.all([
        User.findById(userId).select('_id role').lean(),
        Store.findById(userId).select('_id').lean(),
      ]);
      if (!userDoc && !storeDoc) {
        return res.status(404).json({ error: 'Carteira não encontrada' });
      }
      let ownerType: 'user' | 'motoboy' | 'store' = 'user';
      if (storeDoc) ownerType = 'store';
      else if ((userDoc as any)?.role === 'motoboy') ownerType = 'motoboy';
      wallet = await Wallet.create({ owner: userId, ownerType });
    }

    const history = wallet.history
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(Number(offset), Number(offset) + Number(limit));

    return res.json({
      total: wallet.history.length,
      limit: Number(limit),
      offset: Number(offset),
      history
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
    const platformWallet = await Wallet.findOne({
      owner: 'platform',
      ownerType: 'platform'
    });

    if (!platformWallet) {
      return res.status(404).json({ error: 'Carteira da plataforma não encontrada' });
    }

    return res.json({
      totalBalance: platformWallet.balance,
      totalIncome: platformWallet.totalIncome,
      totalSpent: platformWallet.totalSpent,
      history: platformWallet.history.slice(-20)
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
      user = await User.findById(userId);
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

    // Buscar wallet
    let wallet: any = null;
    try {
      wallet = await Wallet.findOne({ owner, ownerType });
      console.log('💰 Wallet query resultado:', { found: !!wallet, owner, ownerType });
    } catch (walletErr: any) {
      console.error('❌ Erro em Wallet.findOne:', { message: walletErr.message, owner, ownerType });
      throw walletErr;
    }

    // Se não existir, criar automaticamente
    if (!wallet) {
      try {
        console.log('📝 Criando wallet automaticamente:', { owner, ownerType });
        wallet = await Wallet.create({
          owner,
          ownerType,
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          history: [{
            date: new Date(),
            type: 'credit',
            amount: 0,
            reason: ownerType === 'user' ? 'Carteira de usuário criada automaticamente' : (ownerType === 'store' ? 'Carteira de loja criada automaticamente' : 'Carteira de motoboy criada automaticamente')
          }]
        });
        console.log('✅ Wallet criada com sucesso:', { walletId: wallet._id, owner, ownerType });
      } catch (createErr: any) {
        console.error('❌ Erro ao criar wallet:', { message: createErr.message, owner, ownerType });
        throw createErr;
      }
    }

    // Preparar response data PADRONIZADO
    let userInfo: any = {
      name: user?.name || 'Usuário',
      email: user?.email || '',
      id: userId
    };

    let storeInfo: any = null;
    if (role === 'lojista' && user?.storeId) {
      try {
        const store = await Store.findById(user.storeId).select('name').lean();
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
        const withdrawals = await WithdrawalRequest.find({ motoboyId: userId }).lean();
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
        const config = await PlatformConfig.findOne().lean();
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
    let fromWallet;
    if (fromStoreId) {
      // Transferência de LOJA para USUÁRIO
      console.log('↙️ Transferência de loja para usuário:', { fromStoreId, toUserId, amount });
      fromWallet = await Wallet.findOne({ owner: fromStoreId, ownerType: 'store' });
      
      if (!fromWallet) {
        return res.status(404).json({ error: 'Carteira de loja não encontrada' });
      }
    } else {
      // Transferência de USUÁRIO para LOJA (padrão)
      console.log('↗️ Transferência de usuário para loja:', { userId, toUserId, amount });
      fromWallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
      
      if (!fromWallet) {
        return res.status(404).json({ error: 'Sua carteira não encontrada' });
      }
    }

    // ✅ Determinar carteira de DESTINO
    let toWallet;
    if (toUserId) {
      // Destino é um USUÁRIO
      console.log('🔍 Buscando carteira de destino para usuário:', toUserId);
      const targetUser = await User.findById(toUserId);
      
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Se a origem foi de loja, o destino é carteira de USUÁRIO
      if (fromStoreId) {
        toWallet = await Wallet.findOne({ owner: toUserId, ownerType: 'user' });
        
        if (!toWallet) {
          // Auto-criar carteira de usuário se não existir
          toWallet = new Wallet({
            owner: toUserId,
            ownerType: 'user',
            balance: 0,
            totalIncome: 0,
            totalSpent: 0,
            history: []
          });
          await toWallet.save();
        }
      } else {
        // Se a origem foi de usuário, o destino é carteira de LOJA
        if (!targetUser.storeId) {
          return res.status(404).json({ error: 'Usuário não possui loja' });
        }

        toWallet = await Wallet.findOne({ owner: targetUser.storeId.toString(), ownerType: 'store' });
        
        if (!toWallet) {
          // Auto-criar carteira de loja se não existir
          toWallet = new Wallet({
            owner: targetUser.storeId.toString(),
            ownerType: 'store',
            balance: 0,
            totalIncome: 0,
            totalSpent: 0,
            history: []
          });
          await toWallet.save();
        }
      }
    } else if (toWalletId) {
      toWallet = await Wallet.findById(toWalletId);
    } else {
      return res.status(400).json({ error: 'Carteira destino não especificada' });
    }

    if (!toWallet) {
      return res.status(404).json({ error: 'Carteira destino não encontrada' });
    }

    if (fromWallet.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const transferRef = `TRF_${Date.now()}`;
      const transferDate = new Date();

      // Debita origem
      fromWallet.balance -= amount;
      fromWallet.totalSpent += amount;
      fromWallet.history.push({
        type: 'debit',
        category: 'transfer',
        amount,
        reason: reason || 'Transferência enviada',
        paymentMethod: 'wallet_transfer',
        date: transferDate,
        reference: transferRef
      });

      // Credita destino
      toWallet.balance += amount;
      toWallet.totalIncome += amount;
      toWallet.history.push({
        type: 'credit',
        category: 'transfer',
        amount,
        reason: reason || 'Transferência recebida',
        paymentMethod: 'wallet_transfer',
        date: transferDate,
        reference: transferRef
      });

      await fromWallet.save({ session });
      await toWallet.save({ session });

      await session.commitTransaction();
      session.endSession();

      // 💸 Notificar ambas as partes em tempo real
      const fromOwnerId = fromStoreId || userId;
      const fromOwnerType = fromStoreId ? 'lojista' : 'cliente';
      emitWalletUpdated(fromOwnerId as string, fromOwnerType as any, {
        balance: fromWallet.balance,
        totalIncome: fromWallet.totalIncome,
        totalSpent: fromWallet.totalSpent,
        updatedAt: new Date(),
      });

      if (toUserId) {
        emitWalletTransferCompleted(fromOwnerId as string, toUserId, amount, transferRef);
      }

      return res.json({
        success: true,
        message: 'Transferência realizada com sucesso',
        newBalance: fromWallet.balance,
        transferId: transferRef
      });
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();
      throw txErr;
    }
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
    const existing = await Wallet.findOne({
      owner: 'platform',
      ownerType: 'platform'
    });

    if (existing) {
      return res.status(400).json({ error: 'Carteira da plataforma já existe' });
    }

    const wallet = await Wallet.create({
      owner: 'platform',
      ownerType: 'platform',
      balance: 0,
      totalIncome: 0,
      totalSpent: 0,
      history: [
        {
          date: new Date(),
          type: 'credit',
          amount: 0,
          reason: 'Inicialização da carteira da plataforma'
        }
      ]
    });

    return res.json({
      success: true,
      wallet
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

    let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });

    if (!wallet) {
      // Cria carteira se não existir
      wallet = await Wallet.create({
        owner: userId,
        ownerType: 'user',
        balance: amount,
        totalIncome: 0,  // ✅ NOVO: Reembolso NÃO conta como entrada
        history: [
          {
            type: 'refund',  // ✅ NOVO: Tipo 'refund' em vez de 'credit'
            category: 'refund',
            amount,
            reason: reason || `Reembolso do pedido ${orderId}`,
            paymentMethod: 'refund',
            date: new Date(),
            reference: `REFUND_${orderId}`
          }
        ]
      });
    } else {
      // Adiciona crédito na carteira existente
      wallet.balance += amount;
      // ✅ NOVO: NÃO adiciona a totalIncome (reembolso não é entrada)
      wallet.totalSpent = Math.max(0, wallet.totalSpent - amount);
      wallet.history.push({
        type: 'refund',  // ✅ NOVO: Tipo 'refund' em vez de 'credit'
        category: 'refund',
        amount,
        reason: reason || `Reembolso do pedido ${orderId}`,
        paymentMethod: 'refund',
        date: new Date(),
        reference: `REFUND_${orderId}`
      });
      await wallet.save();
    }

    return res.json({
      success: true,
      newBalance: wallet.balance,
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

    const wallet = await Wallet.findById(walletId);

    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    // Remove o saldo
    wallet.balance -= amount;
    wallet.totalSpent += amount;
    wallet.history.push({
      type: 'debit',
      category: 'withdrawal',
      amount,
      reason: reason || 'Saque',
      paymentMethod: 'bank_transfer',
      date: new Date(),
      reference: `WITHDRAW_${Date.now()}`
    });

    await wallet.save();

    return res.json({
      success: true,
      message: 'Saque realizado com sucesso',
      newBalance: wallet.balance,
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

    // Buscar carteira de USUÁRIO (pré-validação fora da transação)
    const userWallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });
    if (!userWallet) {
      return res.status(404).json({ error: 'Sua carteira de usuário não foi encontrada' });
    }

    if (userWallet.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const transferAmount = Number(amount);
      const reference = `MOTOBOY_TRANSFER_${Date.now()}`;
      const transferDate = new Date();

      // Re-buscar dentro da transação para garantir consistência
      const userWalletTx = await Wallet.findOne({ owner: userId, ownerType: 'user' }).session(session);
      if (!userWalletTx || userWalletTx.balance < transferAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }

      // Buscar ou criar carteira de MOTOBOY
      let motoboyWallet = await Wallet.findOne({ owner: userId, ownerType: 'motoboy' }).session(session);
      if (!motoboyWallet) {
        const [created] = await Wallet.create([{
          owner: userId,
          ownerType: 'motoboy',
          balance: 0,
          totalIncome: 0,
          totalSpent: 0,
          history: []
        }], { session });
        motoboyWallet = created;
      }

      // Debita carteira de usuário
      userWalletTx.balance -= transferAmount;
      userWalletTx.totalSpent += transferAmount;
      userWalletTx.history.push({
        type: 'debit',
        category: 'transfer',
        amount: transferAmount,
        reason: 'Transferência para carteira de motoboy',
        paymentMethod: 'wallet_transfer',
        date: transferDate,
        reference
      });

      // Credita carteira de motoboy
      motoboyWallet.balance += transferAmount;
      motoboyWallet.totalIncome += transferAmount;
      motoboyWallet.history.push({
        type: 'credit',
        category: 'transfer',
        amount: transferAmount,
        reason: 'Recebido de carteira de usuário',
        paymentMethod: 'wallet_transfer',
        date: transferDate,
        reference
      });

      await userWalletTx.save({ session });
      await motoboyWallet.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message: 'Transferência para carteira de motoboy realizada com sucesso',
        userWalletBalance: userWalletTx.balance,
        motoboyWalletBalance: motoboyWallet.balance,
        transferedAmount: transferAmount,
        transferId: reference
      });
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();
      throw txErr;
    }
  } catch (err: any) {
    console.error('[WALLET ERROR]', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

