import { Request, Response } from 'express';
import AppCashbox from '../models/AppCashbox';
import Withdrawal from '../models/Withdrawal';
import payoutService from '../services/payout.service';

/**
 * GET /admin/app-cashbox
 * Retorna saldo atual, renda total e despesas totais
 */
// Sources que pertencem ao fluxo operacional de saques, não ao fluxo do pedido.
// Ficam ocultos do extrato do caixa (já existe aba Saques dedicada).
const OPERATIONAL_SOURCES = new Set(['manual_withdrawal', 'withdrawal_fee']);

// Lucro REAL da plataforma = só as comissões que ela de fato embolsa.
// O `balance` mistura custódia (order_payment entra e payout_paid sai), por isso
// dava negativo. As comissões são lançadas como income no momento da entrega.
const COMMISSION_SOURCES = new Set(['product_commission', 'delivery_commission']);

// Soma líquida das comissões no history (income soma, reversão subtrai).
export function computeCommissionProfit(history: { type: string; source: string; amount: number }[]): number {
  return history.reduce((sum, h) => {
    if (!COMMISSION_SOURCES.has(h.source)) return sum;
    return h.type === 'income' ? sum + h.amount : sum - h.amount;
  }, 0);
}

export const getAppCashbox = async (req: Request & { user?: any }, res: Response) => {
  try {
    let cashbox = await AppCashbox.findOne();

    if (!cashbox) {
      cashbox = await AppCashbox.create({
        balance: 0,
        totalIncome: 0,
        totalExpenses: 0,
        history: [],
      });
    }

    // Calcular obrigações pendentes (custódia a repassar) e o lucro líquido REAL.
    // Lucro = só as comissões que a plataforma embolsa (não o dinheiro que entrou
    // e depois foi repassado às subcontas). `balance`/`pendingObligations` seguem
    // expostos como números contábeis de custódia.
    const pendingObligations = await payoutService.getPendingObligations();
    const platformNet = computeCommissionProfit(cashbox.history as any);
    const custodyBalance = cashbox.balance - pendingObligations;

    // Filtrar fluxos operacionais de saque do extrato (aba Saques já lista) e ordenar por data desc
    const cashboxObj = cashbox.toObject();
    cashboxObj.history = [...cashboxObj.history]
      .filter((h: any) => !OPERATIONAL_SOURCES.has(h.source))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // No modo Asaas o dinheiro real NÃO fica no AppCashbox (legado): a custódia está na
    // conta-mãe Asaas e os repasses nas subcontas. Buscamos o saldo real da conta-mãe
    // para o caixa refletir o que de fato está disponível. Best-effort: se o Asaas falhar
    // ou não estiver configurado, devolvemos null (não quebra o caixa).
    let asaas: { enabled: boolean; balance: number | null; error?: string } = {
      enabled: process.env.PAYMENT_GATEWAY === 'asaas',
      balance: null,
    };
    if (asaas.enabled) {
      try {
        const asaasClient = (await import('../services/asaas/client')).default;
        const data: any = await asaasClient.get('/finance/balance');
        asaas.balance = typeof data?.balance === 'number' ? data.balance : Number(data?.balance ?? 0);
      } catch (e: any) {
        asaas.error = e?.message || 'Falha ao consultar saldo da conta-mãe Asaas';
      }
    }

    return res.json({
      ...cashboxObj,
      pendingObligations,
      platformNet,      // lucro real = comissões embolsadas
      custodyBalance,   // saldo de custódia (entrada − obrigações), contábil
      asaas,
    });
  } catch (err) {
    console.error('❌ Erro ao buscar caixa do app:', err);
    return res.status(500).json({ error: 'Erro ao buscar caixa do app' });
  }
};

/**
 * GET /admin/app-cashbox/statement
 * Retorna extrato detalhado com filtros por data e tipo
 */
export const getAppCashboxStatement = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { startDate, endDate, source, type, page = 1, limit = 50 } = req.query;
    
    let cashbox = await AppCashbox.findOne();
    if (!cashbox) {
      return res.json({
        statement: [],
        total: 0,
        income: 0,
        expenses: 0,
        pages: 0,
      });
    }

    let history = [...cashbox.history].filter(h => !OPERATIONAL_SOURCES.has(h.source));

    // Filtrar por data
    if (startDate) {
      const start = new Date(startDate as string);
      history = history.filter(h => h.date >= start);
    }
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      history = history.filter(h => h.date <= end);
    }

    // Filtrar por source
    if (source) {
      history = history.filter(h => h.source === source);
    }

    // Filtrar por type
    if (type) {
      history = history.filter(h => h.type === type);
    }

    // Ordenar por data descendente
    history.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Paginação
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const totalPages = Math.ceil(history.length / limitNum);
    const start = (pageNum - 1) * limitNum;
    const paginatedHistory = history.slice(start, start + limitNum);

    // Calcular totais
    const totalIncome = history.filter(h => h.type === 'income').reduce((sum, h) => sum + h.amount, 0);
    const totalExpenses = history.filter(h => h.type === 'expense').reduce((sum, h) => sum + h.amount, 0);

    return res.json({
      statement: paginatedHistory,
      total: history.length,
      income: totalIncome,
      expenses: totalExpenses,
      page: pageNum,
      pages: totalPages,
      cashbox: {
        balance: cashbox.balance,
        totalIncome: cashbox.totalIncome,
        totalExpenses: cashbox.totalExpenses,
      },
    });
  } catch (err) {
    console.error('❌ Erro ao buscar extrato:', err);
    return res.status(500).json({ error: 'Erro ao buscar extrato' });
  }
};

/**
 * POST /admin/app-cashbox/withdrawal
 * Cria uma solicitação de saque
 */
export const requestWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { amount, bankInfo, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    let cashbox = await AppCashbox.findOne();
    if (!cashbox) {
      return res.status(400).json({ error: 'Caixa do app não encontrado' });
    }

    if (cashbox.balance < amount) {
      return res.status(400).json({ 
        error: 'Saldo insuficiente',
        available: cashbox.balance,
        requested: amount,
      });
    }

    // ✅ Criar solicitação de saque
    const withdrawal = new Withdrawal({
      appCashboxId: cashbox._id.toString(),
      amount,
      status: 'pending',
      bankInfo,
      reason,
    });

    await withdrawal.save();

    // ✅ Registrar no histórico (apenas o débito vai quando aprovado)
    console.log('✅ Solicitação de saque criada:', withdrawal._id);

    return res.json({
      success: true,
      withdrawal,
      message: 'Solicitação de saque criada. Aguardando aprovação.',
    });
  } catch (err) {
    console.error('❌ Erro ao solicitar saque:', err);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
};

/**
 * GET /admin/app-cashbox/withdrawals
 * Lista histórico de saques
 */
export const getWithdrawals = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    let query: any = {};
    if (status) query.status = status;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;

    const total = await Withdrawal.countDocuments(query);
    const withdrawals = await Withdrawal.find(query)
      .sort({ requestedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.json({
      withdrawals,
      total,
      pages: Math.ceil(total / limitNum),
      page: pageNum,
    });
  } catch (err) {
    console.error('❌ Erro ao listar saques:', err);
    return res.status(500).json({ error: 'Erro ao listar saques' });
  }
};

/**
 * PUT /admin/app-cashbox/withdrawals/:id/approve
 * Aprova um saque (só pode ser feito por CEO)
 */
export const approveWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `Saque já foi ${withdrawal.status}` });
    }

    // ✅ Validar se ainda tem saldo
    const cashbox = await AppCashbox.findById(withdrawal.appCashboxId);
    if (!cashbox || cashbox.balance < withdrawal.amount) {
      return res.status(400).json({ error: 'Saldo insuficiente para aprovar saque' });
    }

    // ✅ Atualizar status
    withdrawal.status = 'approved';
    withdrawal.approvedAt = new Date();
    withdrawal.processedBy = userId;
    await withdrawal.save();

    // ✅ Registrar no caixa
    cashbox.balance -= withdrawal.amount;
    cashbox.totalExpenses += withdrawal.amount;
    cashbox.history.push({
      type: 'withdrawal',
      source: 'manual_withdrawal',
      amount: withdrawal.amount,
      withdrawalId: withdrawal._id.toString(),
      reason: `Saque aprovado - ${withdrawal.reason || 'Sem motivo'}`,
      date: new Date(),
    });
    await cashbox.save();

    console.log('✅ Saque aprovado:', withdrawal._id);

    return res.json({
      success: true,
      withdrawal,
      message: 'Saque aprovado com sucesso!',
    });
  } catch (err) {
    console.error('❌ Erro ao aprovar saque:', err);
    return res.status(500).json({ error: 'Erro ao aprovar saque' });
  }
};

/**
 * PUT /admin/app-cashbox/withdrawals/:id/reject
 * Rejeita um saque
 */
export const rejectWithdrawal = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `Saque já foi ${withdrawal.status}` });
    }

    // ✅ Atualizar status
    withdrawal.status = 'rejected';
    withdrawal.rejectedAt = new Date();
    withdrawal.rejectionReason = rejectionReason;
    withdrawal.processedBy = userId;
    await withdrawal.save();

    console.log('✅ Saque rejeitado:', withdrawal._id);

    return res.json({
      success: true,
      withdrawal,
      message: 'Saque rejeitado.',
    });
  } catch (err) {
    console.error('❌ Erro ao rejeitar saque:', err);
    return res.status(500).json({ error: 'Erro ao rejeitar saque' });
  }
};

/**
 * POST /admin/app-cashbox/deposit
 * Registra um depósito manual no caixa (com comprovante)
 */
export const registerDeposit = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    let cashbox = await AppCashbox.findOne();
    if (!cashbox) {
      cashbox = await AppCashbox.create({
        balance: 0,
        totalIncome: 0,
        totalExpenses: 0,
        history: [],
      });
    }

    // ✅ Adicionar ao caixa
    cashbox.balance += amount;
    cashbox.totalIncome += amount;
    cashbox.history.push({
      type: 'deposit',
      source: 'manual_deposit',
      amount,
      reason: reason || 'Depósito manual',
      date: new Date(),
    });

    await cashbox.save();

    console.log('✅ Depósito registrado:', amount);

    return res.json({
      success: true,
      cashbox,
      message: 'Depósito registrado com sucesso!',
    });
  } catch (err) {
    console.error('❌ Erro ao registrar depósito:', err);
    return res.status(500).json({ error: 'Erro ao registrar depósito' });
  }
};

/**
 * ✨ Função auxiliar: Registrar comissão no caixa
 * Chamada quando um order é criado ou entrega é completada
 */
/**
 * Registra um repasse "reservado" no extrato do AppCashbox (saída informativa).
 * Em pedidos pagos antecipadamente, o dinheiro total entrou via order_payment; essa
 * função apenas documenta no histórico o que está provisionado para loja/motoboy.
 * Não afeta balance — a saída real é registrada quando o payout é pago (payout_paid).
 */
export async function recordReservedPayout(
  target: 'store' | 'motoboy',
  amount: number,
  orderId?: string,
  deliveryId?: string,
  reason?: string
) {
  try {
    if (!(amount > 0)) return;
    let cashbox = await AppCashbox.findOne();
    if (!cashbox) {
      cashbox = await AppCashbox.create({ balance: 0, totalIncome: 0, totalExpenses: 0, history: [] });
    }
    cashbox.history.push({
      type: 'expense',
      source: target === 'store' ? 'store_payout_reserved' : 'motoboy_payout_reserved',
      amount,
      orderId,
      deliveryId,
      reason,
      date: new Date(),
    });
    await cashbox.save();
  } catch (err) {
    console.error(`❌ Erro ao registrar repasse reservado:`, err);
  }
}

export async function addCommissionToAppCashbox(
  type: 'product_commission' | 'delivery_commission' | 'coupon_discount',
  amount: number,
  orderId?: string,
  deliveryId?: string,
  reason?: string,
  opts?: { affectsBalance?: boolean }
) {
  try {
    let cashbox = await AppCashbox.findOne();
    if (!cashbox) {
      cashbox = await AppCashbox.create({
        balance: 0,
        totalIncome: 0,
        totalExpenses: 0,
        history: [],
      });
    }

    // Em pedidos pagos antecipadamente (não-COD), o dinheiro total já entrou via order_payment.
    // A comissão é só uma anotação no extrato do que já está contido na entrada total.
    const affectsBalance = opts?.affectsBalance ?? true;
    if (affectsBalance) {
      cashbox.balance += amount;
      cashbox.totalIncome += amount;
    }
    cashbox.history.push({
      type: 'income',
      source: type,
      amount,
      orderId,
      deliveryId,
      reason,
      date: new Date(),
    });

    await cashbox.save();
    console.log(`✅ Comissão adicionada ao caixa: ${type} = R$ ${amount} (affectsBalance=${affectsBalance})`);
  } catch (err) {
    console.error(`❌ Erro ao adicionar comissão ao caixa:`, err);
  }
}
