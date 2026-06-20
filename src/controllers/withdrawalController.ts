import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WithdrawalRequest from '../models/WithdrawalRequest';
import Wallet from '../models/Wallet';
import User from '../models/User';
import Transaction from '../models/Transaction';
import payoutService from '../services/payout.service';
import { getPayoutGateway } from '../services/payoutGateway';
import env from '../config/env';

// ✅ Motoboy/Lojista - Solicitar saque (consome payouts FIFO)
export const requestWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const role = req.user?.activeRole || req.user?.role;

    const isMotoboy = role === 'motoboy';
    const isSeller = role === 'lojista' || role === 'seller';
    if (!isMotoboy && !isSeller) {
      return res.status(403).json({ error: 'Apenas motoboys ou lojistas podem solicitar saque' });
    }

    const { amount, bankAccount, storeId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    const recipientType = isMotoboy ? 'motoboy' : 'store';
    const recipientId = isMotoboy ? userId : storeId;
    if (!recipientId) {
      return res.status(400).json({ error: 'recipientId não informado' });
    }

    // Buscar payouts released (fonte da verdade)
    const availablePayouts = await payoutService.listAvailablePayouts(recipientType as any, recipientId);
    const totalAvailable = availablePayouts.reduce((s, p) => s + p.amount, 0);

    if (totalAvailable <= 0) {
      return res.status(400).json({ error: 'Nenhum saldo disponível para saque' });
    }

    // amount === 'all' (ou >= totalAvailable) → saca tudo
    let selectedPayouts = availablePayouts;
    let actualAmount = totalAvailable;

    if (amount !== 'all' && Number(amount) < totalAvailable) {
      // Saque parcial: tenta selecionar payouts inteiros FIFO que somem exatamente o amount
      const selection = await payoutService.selectPayoutsForAmount(recipientType as any, recipientId, Number(amount));
      if ('error' in selection) {
        return res.status(400).json({
          error: 'Saque parcial só funciona com soma exata de payouts. Use "Sacar tudo" ou ajuste o valor.',
          code: selection.error,
          totalAvailable,
        });
      }
      selectedPayouts = selection.payouts;
      actualAmount = selection.total;
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const session = await mongoose.startSession();
    try {
      let withdrawal: any;
      await session.withTransaction(async () => {
        withdrawal = await WithdrawalRequest.create([{
          motoboyId: recipientId,
          motoboyName: user.name,
          motoboyEmail: user.email,
          amount: actualAmount,
          bankAccount: bankAccount || undefined,
          status: 'pending',
          requestedAt: new Date(),
          payoutIds: selectedPayouts.map(p => String(p._id)),
        }], { session }).then(docs => docs[0]);

        await payoutService.markPayoutsRequested(
          selectedPayouts.map(p => String(p._id)),
          String(withdrawal._id),
          session,
        );
      });

      await maybeAutoApproveWithdrawal(String(withdrawal._id));
      const refreshed = await WithdrawalRequest.findById(withdrawal._id);
      return res.json({
        message: 'Saque solicitado com sucesso',
        withdrawal: refreshed || withdrawal,
      });
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('❌ Erro ao solicitar saque:', err);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
};

// ✅ CEO - Ver saques pendentes
export const getPendingWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode ver saques' });
    }

    const pending = await WithdrawalRequest.find({ status: 'pending' }).sort({ requestedAt: -1 });
    return res.json(pending);
  } catch (err) {
    console.error('❌ Erro ao buscar saques:', err);
    return res.status(500).json({ error: 'Erro ao buscar saques' });
  }
};

// ✅ CEO - Ver todos os saques
export const getAllWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode ver saques' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;

    const withdrawals = await WithdrawalRequest.find()
      .sort({ requestedAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await WithdrawalRequest.countDocuments();

    return res.json({
      withdrawals,
      total,
      limit,
      skip,
    });
  } catch (err) {
    console.error('❌ Erro ao buscar saques:', err);
    return res.status(500).json({ error: 'Erro ao buscar saques' });
  }
};

// Executa aprovação + processamento. Reutilizado pelo endpoint approveWithdrawal e pelo auto-approve.
async function executeWithdrawalApproval(withdrawal: any, approverId: string) {
  const gateway = getPayoutGateway();
  const transferResult = await gateway.transfer({
    payoutIds: withdrawal.payoutIds || [],
    bankInfo: withdrawal.bankAccount as any || {},
    amount: withdrawal.amount,
    recipientName: withdrawal.motoboyName,
  });

  // ✅ Se a transferência FALHOU, NÃO marca como pago: reverte o saldo e marca o saque
  // como rejeitado. (Antes, qualquer resultado marcava pago — dinheiro "sumia" sem PIX.)
  if (transferResult.status === 'failed') {
    const failSession = await mongoose.startSession();
    try {
      await failSession.withTransaction(async () => {
        if (withdrawal.payoutIds?.length) {
          await payoutService.revertPayoutsToReleased(withdrawal.payoutIds, failSession);
        } else {
          // saque de user wallet: devolve blockedBalance → balance
          const wallet = await Wallet.findOne({ owner: withdrawal.motoboyId, ownerType: 'user' }).session(failSession);
          if (wallet) {
            wallet.blockedBalance = Math.max(0, (wallet.blockedBalance || 0) - withdrawal.amount);
            wallet.balance += withdrawal.amount;
            await wallet.save({ session: failSession });
          }
        }
      });
    } finally {
      failSession.endSession();
    }
    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = transferResult.errorMessage || 'Falha na transferência (gateway)';
    await withdrawal.save();
    throw Object.assign(new Error(withdrawal.rejectionReason), { transferFailed: true });
  }

  withdrawal.approvedAt = new Date();
  withdrawal.approvedBy = approverId;
  withdrawal.transactionId = transferResult.gatewayTransferId;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (withdrawal.payoutIds?.length) {
        await payoutService.markPayoutsPaid(
          withdrawal.payoutIds!,
          transferResult.gatewayTransferId || `manual_${Date.now()}`,
          session,
          // Em modo Asaas o dinheiro está na subconta (não no AppCashbox virtual);
          // o saque sai da subconta direto pro banco, então NÃO debita o caixa.
          { skipCashboxDebit: env.PAYOUT_GATEWAY === 'asaas' },
        );
      } else {
        // Saque de user wallet: liberar blockedBalance. NÃO debitar AppCashbox —
        // o dinheiro já saiu do cofre quando foi transferido para a carteira (payout_paid)
        // ou quando foi reembolsado (order_refund).
        const wallet = await Wallet.findOne({ owner: withdrawal.motoboyId, ownerType: 'user' }).session(session);
        if (wallet) {
          wallet.blockedBalance = Math.max(0, (wallet.blockedBalance || 0) - withdrawal.amount);
          wallet.totalSpent = (wallet.totalSpent || 0) + withdrawal.amount;
          await wallet.save({ session });
        }
      }
    });
  } finally {
    session.endSession();
  }

  withdrawal.status = 'processed';
  withdrawal.processedAt = new Date();
  await withdrawal.save();
  return transferResult;
}

// Best-effort auto-approve após criação: se falhar, saque segue pending para aprovação manual.
export async function maybeAutoApproveWithdrawal(withdrawalId: string) {
  try {
    const PlatformConfig = (await import('../models/PlatformConfig')).default;
    const config = await PlatformConfig.findOne();
    if (!config?.autoApproveWithdrawals) return;

    const w = await WithdrawalRequest.findById(withdrawalId);
    if (!w || w.status !== 'pending') return;

    await executeWithdrawalApproval(w, 'auto');
  } catch (err) {
    console.error('[AUTO-APPROVE WITHDRAWAL] falhou, saque segue pending:', err);
  }
}

// ✅ CEO - Aprovar saque (chama gateway de pagamento)
export const approveWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const ceoId = req.user?.id || (req as any).userId;
    const userRole = req.user?.activeRole || req.user?.role;
    const { withdrawalId } = req.body;

    if (userRole !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode aprovar saques' });
    }

    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Saque não está pendente' });
    }

    const transferResult = await executeWithdrawalApproval(withdrawal, ceoId);

    return res.json({
      message: 'Saque aprovado e processado',
      withdrawal,
      gatewayStatus: transferResult.status,
    });
  } catch (err: any) {
    console.error('[WITHDRAWAL ERROR]', err);
    // Falha de transferência: já revertemos o saldo; devolve a mensagem real.
    if (err?.transferFailed) {
      return res.status(502).json({ error: err.message || 'Falha na transferência do saque' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// Admin/CEO - Toggle auto-aprovação de saques
export const toggleAutoApproveWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const role = req.user?.activeRole || req.user?.role;
    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode alterar a configuração' });
    }

    const PlatformConfig = (await import('../models/PlatformConfig')).default;
    const { enabled } = req.body;

    let config = await PlatformConfig.findOne();
    if (!config) {
      config = new PlatformConfig({ updatedBy: req.user?.id });
    }
    config.autoApproveWithdrawals = !!enabled;
    config.updatedAt = new Date();
    config.updatedBy = req.user?.id;
    await config.save();

    return res.json({ autoApproveWithdrawals: config.autoApproveWithdrawals });
  } catch (err: any) {
    console.error('Erro ao toggle auto-approve withdrawals:', err);
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Ler configuração atual
export const getWithdrawalConfig = async (_req: Request & { user?: any }, res: Response) => {
  try {
    const PlatformConfig = (await import('../models/PlatformConfig')).default;
    const config = await PlatformConfig.findOne();
    return res.json({ autoApproveWithdrawals: config?.autoApproveWithdrawals ?? false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// ✅ CEO - Rejeitar saque
export const rejectWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const ceoId = req.user?.id || (req as any).userId;
    const role = req.user?.role;
    const { withdrawalId, reason } = req.body;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode rejeitar saques' });
    }

    const withdrawal = await WithdrawalRequest.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Saque não está pendente' });
    }

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = reason || 'Rejeitado pelo CEO';
    await withdrawal.save();

    // Saque do user balance: devolve o saldo bloqueado pra disponível
    if (!withdrawal.payoutIds?.length) {
      const wallet = await Wallet.findOne({ owner: withdrawal.motoboyId, ownerType: 'user' });
      if (wallet) {
        wallet.blockedBalance = Math.max(0, (wallet.blockedBalance || 0) - withdrawal.amount);
        wallet.balance += withdrawal.amount;
        wallet.history.push({
          type: 'refund',
          category: 'refund',
          amount: withdrawal.amount,
          reason: `Saque rejeitado: ${withdrawal.rejectionReason}`,
          date: new Date(),
        });
        await wallet.save();
      }
    }

    console.log('✅ Saque rejeitado:', {
      withdrawalId,
      motoboyId: withdrawal.motoboyId,
      reason,
    });

    return res.json({
      message: 'Saque rejeitado',
      withdrawal,
    });
  } catch (err) {
    console.error('❌ Erro ao rejeitar saque:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar saque' });
  }
};

// ✅ User (cliente/lojista) - Solicitar saque a partir do user wallet (sem payouts)
export const requestUserWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = req.user?.id || (req as any).userId;
    const { amount, bankAccount } = req.body;

    if (!userId) {
      await session.abortTransaction(); session.endSession();
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (!amount || amount <= 0) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'Valor inválido' });
    }
    if (!bankAccount?.bankName || !bankAccount?.accountNumber || !bankAccount?.ownerName) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ error: 'Dados bancários incompletos' });
    }

    const wallet = await Wallet.findOne({ owner: String(userId), ownerType: 'user' }).session(session);
    if (!wallet || wallet.balance < amount) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({
        error: 'Saldo insuficiente',
        available: wallet?.balance || 0,
        requested: amount,
      });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Bloqueia o saldo movendo de balance pra blockedBalance até admin processar
    wallet.balance -= amount;
    wallet.blockedBalance = (wallet.blockedBalance || 0) + amount;
    wallet.history.push({
      type: 'debit',
      category: 'withdrawal',
      amount,
      reason: 'Saque solicitado para conta bancária',
      paymentMethod: 'bank_transfer',
      date: new Date(),
    });
    await wallet.save({ session });

    const [withdrawal] = await WithdrawalRequest.create([{
      motoboyId: String(userId),
      motoboyName: user.name,
      motoboyEmail: user.email,
      amount,
      bankAccount,
      status: 'pending',
      requestedAt: new Date(),
      payoutIds: [], // saque do user balance não tem payouts vinculados
    }], { session });

    await session.commitTransaction();
    session.endSession();

    await maybeAutoApproveWithdrawal(String(withdrawal._id));
    const refreshed = await WithdrawalRequest.findById(withdrawal._id);
    return res.json({
      message: 'Saque solicitado com sucesso',
      withdrawal: refreshed || withdrawal,
    });
  } catch (err: any) {
    await session.abortTransaction(); session.endSession();
    console.error('[requestUserWithdrawal ERROR]', err);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
};

// ✅ Motoboy/Lojista - Ver seus saques
export const getMyWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const role = req.user?.activeRole || req.user?.role;

    let recipientId: string | undefined;
    if (role === 'motoboy') {
      recipientId = userId;
    } else if (role === 'lojista' || role === 'seller') {
      // Lojista passa storeId via query
      recipientId = (req.query.storeId as string) || undefined;
      if (!recipientId) return res.status(400).json({ error: 'storeId é obrigatório' });
    } else {
      return res.status(403).json({ error: 'Apenas motoboys ou lojistas podem ver saques' });
    }

    const withdrawals = await WithdrawalRequest.find({ motoboyId: recipientId })
      .sort({ requestedAt: -1 });

    return res.json(withdrawals);
  } catch (err) {
    console.error('❌ Erro ao buscar saques:', err);
    return res.status(500).json({ error: 'Erro ao buscar saques' });
  }
};

// ✅ CEO - Ver carteira CEO
export const getCEOWallet = async (req: Request & { user?: any }, res: Response) => {
  try {
    const ceoId = req.user?.id || (req as any).userId;
    const role = req.user?.role;

    if (role !== 'ceo') {
      return res.status(403).json({ error: 'Apenas CEO pode acessar esta carteira' });
    }

    const wallet = await Wallet.findOne({
      owner: ceoId,
      ownerType: 'user',
    });

    if (!wallet) {
      return res.json({
        owner: ceoId,
        ownerType: 'user',
        balance: 0,
        transactions: [],
      });
    }

    return res.json(wallet);
  } catch (err) {
    console.error('❌ Erro ao buscar carteira CEO:', err);
    return res.status(500).json({ error: 'Erro ao buscar carteira' });
  }
};
