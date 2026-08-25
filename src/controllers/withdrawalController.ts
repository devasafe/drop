import { Request, Response } from 'express';
import {
  createWR,
  findWRById,
  findWRByStatus,
  findAllWR,
  countWR,
  findWRByMotoboy,
  updateWR,
} from '../repositories/withdrawalRequest.repository';
import walletService from '../services/wallet.prisma.service';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';

import payoutService from '../services/payout.service';
import { getPayoutGateway } from '../services/payoutGateway';
import env from '../config/env';
import { emitAdminNotification } from '../utils/socketEmitter';

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

/**
 * Verifica se o recebedor (motoboy/loja) está pronto para sacar via Asaas:
 * subconta criada/ativa (apiKeyEncrypted) + chave PIX cadastrada. Usado para
 * barrar o saque cedo, com mensagem acionável, em vez de falhar na aprovação.
 */
async function checkAsaasReceiverReady(
  recipientType: 'motoboy' | 'store',
  recipientId: string,
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  // `+asaas.apiKeyEncrypted` inclui o campo oculto SEM excluir o resto do doc.
  // (Misturar com a inclusão de `asaas` causa colisão de projeção → erro 500.)
  const asaas =
    recipientType === 'store'
      ? (await prisma.store.findUnique({ where: { id: String(recipientId) } }) as any)?.asaas
      : (await userRepository.findById(String(recipientId)) as any)?.asaas;

  // A subconta é considerada utilizável se TEM apiKeyEncrypted (foi criada com
  // sucesso no Asaas). O campo `status` local pode ficar 'pending' (cosmético —
  // "aguardando ativação" do login do titular) mesmo a subconta já recebendo/sacando,
  // então NÃO bloqueamos por status — só por subconta inexistente ou erro real.
  if (!asaas?.apiKeyEncrypted) {
    return {
      ok: false,
      code: 'SUBACCOUNT_NOT_READY',
      message:
        asaas?.status === 'error' && asaas?.lastError
          ? `Sua subconta de recebimento falhou: ${asaas.lastError}. Reenvie seus dados em Dados de Recebimento.`
          : 'Sua subconta de recebimento ainda não foi criada. Configure seus dados de recebimento (PIX + endereço) para poder sacar.',
    };
  }
  if (!asaas.pixKey) {
    return {
      ok: false,
      code: 'PIX_KEY_MISSING',
      message: 'Você ainda não cadastrou uma chave PIX para receber. Configure em Dados de Recebimento.',
    };
  }
  return { ok: true };
}

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

    // No modo Asaas, o saque transfere da subconta do recebedor para a chave PIX dele.
    // Barrar AQUI (e não só na aprovação do admin) quando faltar subconta ativa ou chave
    // PIX — evita criar um saque que vai falhar lá na frente com "Subconta não configurada"
    // / "Chave não encontrada". Mensagem aponta o caminho pra resolver.
    if (env.PAYOUT_GATEWAY === 'asaas') {
      const asaasReady = await checkAsaasReceiverReady(recipientType, recipientId);
      if (asaasReady.ok === false) {
        return res.status(400).json({
          error: asaasReady.message,
          code: asaasReady.code,
          action: '/dados-recebimento',
        });
      }
    }

    // Buscar payouts released (fonte da verdade)
    const availablePayouts = await payoutService.listAvailablePayouts(recipientType as any, recipientId);
    const totalAvailable = availablePayouts.reduce((s, p) => s + Number(p.amount), 0);

    if (totalAvailable <= 0) {
      return res.status(400).json({ error: 'Nenhum saldo disponível para saque' });
    }

    // amount === 'all' (ou >= totalAvailable) → saca tudo
    let selectedPayouts = availablePayouts;
    let actualAmount = totalAvailable;

    if (amount !== 'all' && Number(amount) < totalAvailable) {
      // Saque parcial: pega o maior conjunto FIFO de payouts que cabe ABAIXO do
      // valor pedido (respeita teto diário sem fracionar repasse).
      const selection = await payoutService.selectPayoutsUpTo(recipientType as any, recipientId, Number(amount));
      if (selection.payouts.length === 0) {
        // Nenhum repasse cabe abaixo do valor pedido (repasse não pode ser fracionado).
        return res.status(400).json({
          error: `O menor saque possível é ${brl(selection.minPayout)} — um repasse não pode ser dividido. Ajuste o valor para pelo menos isso.`,
          code: 'AMOUNT_TOO_LOW',
          minWithdrawable: selection.minPayout,
          totalAvailable,
        });
      }
      selectedPayouts = selection.payouts;
      actualAmount = selection.total;
    }

    const user = await userRepository.findById(String(userId)) as any;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // WithdrawalRequest segue no Mongo; os Payouts (Postgres) mudam de estado numa
    // transação Prisma. Cria a solicitação primeiro para ter o id de referência.
    const withdrawal: any = await createWR({
      motoboyId: recipientId,
      motoboyName: user.name,
      motoboyEmail: user.email,
      amount: actualAmount,
      bankAccount: bankAccount || undefined,
      status: 'pending',
      requestedAt: new Date(),
      payoutIds: selectedPayouts.map(p => p.id),
    });

    await prisma.$transaction(async (tx) => {
      await payoutService.markPayoutsRequested(selectedPayouts.map(p => p.id), String(withdrawal._id), tx);
    });

    await maybeAutoApproveWithdrawal(String(withdrawal._id));
    const refreshed = await findWRById(withdrawal._id);
    // Notifica o admin só quando NÃO foi aprovado no automático (fica pendente).
    if ((refreshed?.status || withdrawal.status) === 'pending') {
      emitAdminNotification({
        title: 'Saque pendente 💸',
        body: `${user.name} solicitou um saque de ${brl(actualAmount)} — precisa de aprovação.`,
        url: '/admin/withdrawals',
        tag: 'withdrawal',
      });
    }
    return res.json({
      message: 'Saque solicitado com sucesso',
      withdrawal: refreshed || withdrawal,
    });
  } catch (err) {
    console.error('❌ Erro ao solicitar saque:', err);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
};

// ✅ CEO - Ver saques pendentes
export const getPendingWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const pending = await findWRByStatus('pending');
    return res.json(pending);
  } catch (err) {
    console.error('❌ Erro ao buscar saques:', err);
    return res.status(500).json({ error: 'Erro ao buscar saques' });
  }
};

// ✅ CEO - Ver todos os saques
export const getAllWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;

    const withdrawals = await findAllWR(limit, skip);

    const total = await countWR();

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
    await prisma.$transaction(async (tx) => {
      if (withdrawal.payoutIds?.length) {
        await payoutService.revertPayoutsToReleased(withdrawal.payoutIds, tx);
      } else {
        // saque de user wallet: devolve blockedBalance → balance
        const w = await walletService.getOrCreate(withdrawal.motoboyId, 'user', tx);
        const newBlocked = Math.max(0, Number(w.blockedBalance) - withdrawal.amount);
        await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, balance: { increment: withdrawal.amount } } });
      }
    });
    const rejectionReason = transferResult.errorMessage || 'Falha na transferência (gateway)';
    await updateWR(withdrawal._id, { status: 'rejected', rejectionReason });
    throw Object.assign(new Error(rejectionReason), { transferFailed: true });
  }

  await prisma.$transaction(async (tx) => {
    if (withdrawal.payoutIds?.length) {
      await payoutService.markPayoutsPaid(
        withdrawal.payoutIds!,
        transferResult.gatewayTransferId || `manual_${Date.now()}`,
        tx,
        // Em modo Asaas o dinheiro está na subconta (não no AppCashbox virtual);
        // o saque sai da subconta direto pro banco, então NÃO debita o caixa.
        { skipCashboxDebit: env.PAYOUT_GATEWAY === 'asaas' },
      );
    } else {
      // Saque de user wallet: liberar blockedBalance. NÃO debitar AppCashbox —
      // o dinheiro já saiu do cofre quando foi transferido para a carteira (payout_paid)
      // ou quando foi reembolsado (order_refund).
      const w = await walletService.getOrCreate(withdrawal.motoboyId, 'user', tx);
      const newBlocked = Math.max(0, Number(w.blockedBalance) - withdrawal.amount);
      await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, totalSpent: { increment: withdrawal.amount } } });
    }
  });

  await updateWR(withdrawal._id, {
    approvedAt: new Date(),
    approvedBy: approverId,
    transactionId: transferResult.gatewayTransferId,
    status: 'processed',
    processedAt: new Date(),
  });
  return transferResult;
}

// Best-effort auto-approve após criação: se falhar, saque segue pending para aprovação manual.
export async function maybeAutoApproveWithdrawal(withdrawalId: string) {
  try {
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const config = await getPlatformConfig();
    if (!config?.autoApproveWithdrawals) return;

    const w = await findWRById(withdrawalId);
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
    const { withdrawalId } = req.body;

    const withdrawal = await findWRById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }
    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Saque não está pendente' });
    }

    const transferResult = await executeWithdrawalApproval(withdrawal, ceoId);
    const updated = await findWRById(withdrawalId);

    return res.json({
      message: 'Saque aprovado e processado',
      withdrawal: updated || withdrawal,
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
    const { updatePlatformConfig } = await import('../repositories/platformConfig.repository');
    const { enabled } = req.body;

    const config = await updatePlatformConfig({ autoApproveWithdrawals: !!enabled }, req.user?.id);

    return res.json({ autoApproveWithdrawals: config.autoApproveWithdrawals });
  } catch (err: any) {
    console.error('Erro ao toggle auto-approve withdrawals:', err);
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// Admin/CEO - Ler configuração atual
export const getWithdrawalConfig = async (_req: Request & { user?: any }, res: Response) => {
  try {
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const config = await getPlatformConfig();
    return res.json({ autoApproveWithdrawals: config?.autoApproveWithdrawals ?? false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro' });
  }
};

// ✅ CEO - Rejeitar saque
export const rejectWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const ceoId = req.user?.id || (req as any).userId;
    const { withdrawalId, reason } = req.body;

    const withdrawal = await findWRById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Saque não está pendente' });
    }

    const rejectionReason = reason || 'Rejeitado pelo CEO';
    const updatedWithdrawal = await updateWR(withdrawal._id, { status: 'rejected', rejectionReason });

    // Saque do user balance: devolve o saldo bloqueado pra disponível
    if (!withdrawal.payoutIds?.length) {
      const w = await walletService.getOrCreate(withdrawal.motoboyId, 'user');
      const newBlocked = Math.max(0, Number(w.blockedBalance) - withdrawal.amount);
      await prisma.$transaction(async (tx) => {
        await tx.wallet.update({ where: { id: w.id }, data: { blockedBalance: newBlocked, balance: { increment: withdrawal.amount } } });
        await tx.walletEntry.create({ data: { walletId: w.id, type: 'refund', category: 'refund', amount: withdrawal.amount, reason: `Saque rejeitado: ${rejectionReason}` } });
      });
    }

    console.log('✅ Saque rejeitado:', {
      withdrawalId,
      motoboyId: withdrawal.motoboyId,
      reason,
    });

    return res.json({
      message: 'Saque rejeitado',
      withdrawal: updatedWithdrawal,
    });
  } catch (err) {
    console.error('❌ Erro ao rejeitar saque:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar saque' });
  }
};

// ✅ User (cliente/lojista) - Solicitar saque a partir do user wallet (sem payouts)
export const requestUserWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id || (req as any).userId;
    const { amount, bankAccount } = req.body;

    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor inválido' });
    if (!bankAccount?.bankName || !bankAccount?.accountNumber || !bankAccount?.ownerName) {
      return res.status(400).json({ error: 'Dados bancários incompletos' });
    }

    const wallet = await walletService.getOrCreate(String(userId), 'user');
    if (Number(wallet.balance) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente', available: Number(wallet.balance), requested: amount });
    }

    const user = await userRepository.findById(String(userId)) as any;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Bloqueia o saldo movendo de balance → blockedBalance, atomicamente, até o
    // admin processar. `WHERE balance >= amount` evita saldo negativo sob corrida.
    const blocked = await prisma.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: amount } },
      data: { balance: { decrement: amount }, blockedBalance: { increment: amount } },
    });
    if (blocked.count === 0) {
      return res.status(400).json({ error: 'Saldo insuficiente', available: Number(wallet.balance), requested: amount });
    }
    await prisma.walletEntry.create({
      data: { walletId: wallet.id, type: 'debit', category: 'withdrawal', amount, reason: 'Saque solicitado para conta bancária', paymentMethod: 'bank_transfer' },
    });

    const withdrawal: any = await createWR({
      motoboyId: String(userId),
      motoboyName: user.name,
      motoboyEmail: user.email,
      amount,
      bankAccount,
      status: 'pending',
      requestedAt: new Date(),
      payoutIds: [], // saque do user balance não tem payouts vinculados
    });

    await maybeAutoApproveWithdrawal(String(withdrawal._id));
    const refreshed = await findWRById(withdrawal._id);
    if ((refreshed?.status || withdrawal.status) === 'pending') {
      emitAdminNotification({
        title: 'Saque pendente 💸',
        body: `${user.name} solicitou um saque de ${brl(amount)} — precisa de aprovação.`,
        url: '/admin/withdrawals',
        tag: 'withdrawal',
      });
    }
    return res.json({
      message: 'Saque solicitado com sucesso',
      withdrawal: refreshed || withdrawal,
    });
  } catch (err: any) {
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

    const withdrawals = await findWRByMotoboy(String(recipientId));

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

    const wallet = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: ceoId, ownerType: 'user' } } });

    if (!wallet) {
      return res.json({
        owner: ceoId,
        ownerType: 'user',
        balance: 0,
        transactions: [],
      });
    }

    return res.json({ ...wallet, balance: Number(wallet.balance) });
  } catch (err) {
    console.error('❌ Erro ao buscar carteira CEO:', err);
    return res.status(500).json({ error: 'Erro ao buscar carteira' });
  }
};
