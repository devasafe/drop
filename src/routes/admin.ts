import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import User from '../models/User';
import { emitForceLogout } from '../utils/socketEmitter';

const router = Router();

// Middleware para verificar se é admin
const checkAdmin = async (req: any, res: Response, next: any) => {
  try {
    // O middleware authenticate passa req.user, não req.userId
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findById(req.user.id);
    
    // ✅ NOVO: Verificar activeRole ou roles[]
    const userRoles = user?.roles || (user?.role ? [user.role] : []);
    const activeRole = user?.activeRole || user?.role || '';
    const isAdmin = ['ceo', 'gerente_geral'].includes(activeRole) || 
                    userRoles.some((r: string) => ['ceo', 'gerente_geral'].includes(r));
    
    if (!user || !isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════
// 👥 GERENCIAR USUÁRIOS
// ═══════════════════════════════════════════════════════════

// GET /admin/users - Listar todos os usuários
router.get('/users', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const users = await User.find({}, {
      name: 1,
      email: 1,
      role: 1,
      roles: 1,
      activeRole: 1,
      permissions: 1,
      status: 1,
      blockedAt: 1,
      blockReason: 1,
      createdAt: 1,
      updatedAt: 1
    }).sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const ALLOWED_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'];

// PUT /admin/users/:id/role - Atualizar role do usuário
router.put('/users/:id/role', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'Role is required' });
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
    }

    // Nao permite admin rebaixar a si mesmo (evita lockout: se for o unico CEO, perde acesso)
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode alterar o proprio role. Peca para outro admin.' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        role,
        activeRole: role,
        roles: [role],
      },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'Role updated successfully', user });
  } catch (err) {
    console.error('Erro ao atualizar role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// PUT /admin/users/:id/status - Bloquear/Desbloquear usuário
router.put('/users/:id/status', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['active', 'blocked', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Nao permite admin bloquear a si mesmo
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode bloquear a propria conta' });
    }

    const update: any = { status };
    if (status === 'blocked') {
      update.blockedAt = new Date();
      update.blockedBy = String(req.user.id);
      update.blockReason = (reason || '').trim() || 'Sem motivo informado';
    } else if (status === 'active') {
      update.blockedAt = null;
      update.blockedBy = null;
      update.blockReason = null;
    }

    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ao bloquear, emite force_logout via socket (best-effort). Se o user estiver
    // offline o evento se perde — login continua bloqueado pelo status no DB.
    if (status === 'blocked') {
      emitForceLogout(String(id), 'blocked', update.blockReason);
    }

    res.json({ message: 'Status updated successfully', user });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /admin/users/:id/disconnect - Força logout via socket sem bloquear a conta
router.post('/users/:id/disconnect', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode desconectar a propria conta' });
    }

    const user = await User.findById(id).select('_id name').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    emitForceLogout(String(id), 'admin_disconnect');

    res.json({ message: 'Disconnect event emitted', userId: id });
  } catch (err) {
    console.error('Erro ao desconectar usuario:', err);
    res.status(500).json({ error: 'Failed to disconnect user' });
  }
});

// ═══════════════════════════════════════════════════════════
// ⚙️ CONFIGURAÇÕES DO SISTEMA
// ═══════════════════════════════════════════════════════════

// GET /admin/settings - Obter configurações
router.get('/settings', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    // Por enquanto, retorna configurações padrão
    const settings = {
      commissions: {
        lojista: 5, // 5% de comissão para lojista
        motoboy: 8, // 8% para motoboy
        platform: 87 // 87% para plataforma
      },
      motoboy: {
        earnings: {
          min: 10,
          max: 100,
          perDelivery: 5
        },
        withdrawalMinimum: 50
      },
      payments: {
        enabled: true,
        minAmount: 50,
        maxAmount: 10000
      },
      features: {
        wallets: true,
        gamification: true,
        notifications: true,
        deliveries: true
      }
    };

    res.json(settings);
  } catch (err) {
    console.error('Erro ao obter configurações:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /admin/settings - Atualizar configurações
router.put('/settings', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings) {
      return res.status(400).json({ error: 'Settings data is required' });
    }

    // Aqui você pode salvar as configurações em um modelo Settings no MongoDB
    // Por enquanto, apenas retornamos as configurações atualizadas

    res.json({ 
      message: 'Settings updated successfully',
      settings 
    });
  } catch (err) {
    console.error('Erro ao atualizar configurações:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ═══════════════════════════════════════════════════════════
// 📊 DASHBOARD
// ═══════════════════════════════════════════════════════════

// GET /admin/dashboard - Dados do dashboard
router.get('/dashboard', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: { $in: ['ceo', 'marketing', 'gerente_geral'] } });
    const activeUsers = await User.countDocuments({ status: 'active' });
    const blockedUsers = await User.countDocuments({ status: 'blocked' });

    res.json({
      stats: {
        totalUsers,
        totalAdmins,
        activeUsers,
        blockedUsers
      },
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Erro ao obter dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// ═══════════════════════════════════════════════════════════
// 💰 GERENCIAR CARTEIRAS
// ═══════════════════════════════════════════════════════════

// GET /admin/wallets - Listar carteiras SEM saldos (admin precisa pedir acesso individual)
router.get('/wallets', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const Wallet = require('../models/Wallet').default || require('../models/Wallet');
    const { hasValidWalletAccess } = require('../controllers/walletAccessController');

    const wallets = await Wallet.find({ ownerType: 'user' }).sort({ updatedAt: -1 });
    const requesterId = String(req.user?.id);

    // Por padrão: sem saldo. Só revela se existe acesso aprovado vigente pra esse alvo.
    const formattedWallets = await Promise.all(wallets.map(async (w: any) => {
      const userData = await User.findById(w.owner, 'name email role');
      const hasAccess = await hasValidWalletAccess(requesterId, String(w.owner));
      return {
        _id: w._id,
        userId: w.owner,
        userName: userData?.name || 'Usuário Desconhecido',
        userEmail: userData?.email || 'N/A',
        userRole: userData?.role || 'cliente',
        balance: hasAccess ? (w.balance || 0) : null,
        totalEarnings: hasAccess ? (w.totalIncome || 0) : null,
        totalSpent: hasAccess ? (w.totalSpent || 0) : null,
        totalWithdrawn: 0,
        hasAccess,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt
      };
    }));

    res.json(formattedWallets);
  } catch (err) {
    console.error('Erro ao listar carteiras:', err);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// GET /admin/wallets/:id/transactions - Listar transações de uma carteira
router.get('/wallets/:id/transactions', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const Wallet = require('../models/Wallet').default || require('../models/Wallet');
    
    const wallet = await Wallet.findById(id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Gating: precisa ter acesso aprovado vigente para ver transações
    const { hasValidWalletAccess } = require('../controllers/walletAccessController');
    const requesterId = String(req.user?.id);
    const isOwner = String(wallet.owner) === requesterId;
    if (!isOwner) {
      const granted = await hasValidWalletAccess(requesterId, String(wallet.owner));
      if (!granted) {
        return res.status(403).json({ error: 'ACCESS_NOT_GRANTED', message: 'Solicite acesso ao dono da carteira' });
      }
    }

    // Retornar histórico de transações
    const transactions = (wallet.history || []).map((h: any, index: number) => ({
      _id: `${wallet._id}-${index}`,
      walletId: wallet._id,
      type: h.type === 'credit' ? 'credit' : h.type === 'refund' ? 'refund' : 'debit',
      category: h.category || null,
      amount: h.amount,
      reason: h.reason,
      description: h.reason,
      paymentMethod: h.paymentMethod || null,
      status: 'completed',
      createdAt: h.date
    }));

    res.json(transactions.slice(0, 50)); // Últimas 50
  } catch (err) {
    console.error('Erro ao listar transações:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /admin/wallets/:id/add-balance - Adicionar saldo à carteira
router.post('/wallets/:id/add-balance', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0 || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const Wallet = require('../models/Wallet').default || require('../models/Wallet');

    let wallet = await Wallet.findById(id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Adicionar saldo
    wallet.balance += amount;
    wallet.totalIncome += amount;
    wallet.history.push({
      date: new Date(),
      type: 'credit',
      amount,
      reason: reason || 'Adição manual de saldo (admin)',
      reference: `ADMIN_${Date.now()}`
    });

    await wallet.save();

    res.json({
      success: true,
      message: 'Saldo adicionado com sucesso',
      newBalance: wallet.balance,
      transactionId: `ADMIN_${Date.now()}`
    });
  } catch (err) {
    console.error('Erro ao adicionar saldo:', err);
    res.status(500).json({ error: 'Failed to add balance' });
  }
});

// PUT /admin/wallets/:id/balance - Adicionar saldo manual (ajuste administrativo)
router.put('/wallets/:id/balance', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const Wallet = require('../models/Wallet').default || require('../models/Wallet');

    const wallet = await Wallet.findById(id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Atualizar saldo
    wallet.balance = (wallet.balance || 0) + amount;
    if (amount > 0) {
      wallet.totalIncome = (wallet.totalIncome || 0) + amount;
    } else {
      wallet.totalSpent = (wallet.totalSpent || 0) + Math.abs(amount);
    }

    // Registrar no histórico
    wallet.history = wallet.history || [];
    wallet.history.push({
      date: new Date(),
      type: amount > 0 ? 'credit' : 'debit',
      amount: Math.abs(amount),
      reason: reason || `Admin adjustment: ${amount > 0 ? 'credit' : 'debit'}`
    });

    await wallet.save();

    res.json({ 
      message: 'Wallet balance updated',
      wallet 
    });
  } catch (err) {
    console.error('Erro ao atualizar saldo:', err);
    res.status(500).json({ error: 'Failed to update wallet balance' });
  }
});

// ═══════════════════════════════════════════════════════════
// 💳 CAIXA DO APP
// ═══════════════════════════════════════════════════════════

// ✨ Importar controllers do caixa do app
import {
  getAppCashbox,
  getAppCashboxStatement,
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  registerDeposit,
} from '../controllers/appCashboxController';

// GET /admin/app-cashbox - Ver saldo e resumo
router.get('/app-cashbox', authenticate, checkAdmin, getAppCashbox);

// GET /admin/app-cashbox/statement - Ver extrato detalhado
router.get('/app-cashbox/statement', authenticate, checkAdmin, getAppCashboxStatement);

// POST /admin/app-cashbox/withdrawal - Solicitar saque
router.post('/app-cashbox/withdrawal', authenticate, checkAdmin, requestWithdrawal);

// GET /admin/app-cashbox/withdrawals - Ver saques
router.get('/app-cashbox/withdrawals', authenticate, checkAdmin, getWithdrawals);

// PUT /admin/app-cashbox/withdrawals/:id/approve - Aprovar saque
router.put('/app-cashbox/withdrawals/:id/approve', authenticate, checkAdmin, approveWithdrawal);

// PUT /admin/app-cashbox/withdrawals/:id/reject - Rejeitar saque
router.put('/app-cashbox/withdrawals/:id/reject', authenticate, checkAdmin, rejectWithdrawal);

// POST /admin/app-cashbox/deposit - Registrar depósito
router.post('/app-cashbox/deposit', authenticate, checkAdmin, registerDeposit);

// ═══════════════════════════════════════════════════════════
// 🏦 SUBCONTAS ASAAS (gateway) — criar/backfill p/ recebedores já verificados
// ═══════════════════════════════════════════════════════════
import Store from '../models/Store';
import { ensureStoreSubaccount, ensureMotoboySubaccount } from '../services/asaas/subaccount';

// POST /admin/asaas/subaccount/store/:storeId
// body opcional: { pixKey, pixKeyType, address:{ street, number, neighborhood, city, state, zip } }
router.post('/asaas/subaccount/store/:storeId', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const store = await Store.findById(req.params.storeId);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    // Preenche endereço da loja se enviado (necessário p/ a subconta Asaas)
    const a = req.body?.address;
    if (a) {
      if (a.street) store.street = a.street;
      if (a.number) store.number = a.number;
      if (a.neighborhood) store.neighborhood = a.neighborhood;
      if (a.city) store.city = a.city;
      if (a.state) store.state = a.state;
      if (a.zip || a.cep) store.zip = a.zip || a.cep;
      await store.save();
    }

    await ensureStoreSubaccount(req.params.storeId);
    const fresh = await Store.findById(req.params.storeId).select('name asaas');
    if (fresh && req.body?.pixKey) {
      fresh.asaas!.pixKey = String(req.body.pixKey).trim();
      if (req.body.pixKeyType) fresh.asaas!.pixKeyType = req.body.pixKeyType;
      fresh.markModified('asaas');
      await fresh.save();
    }
    return res.json({ name: fresh?.name, asaas: fresh?.asaas });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao criar subconta' });
  }
});

// POST /admin/asaas/subaccount/motoboy/:userId
// body opcional: { pixKey, pixKeyType, address:{ street, number, neighborhood, city, state, zip } }
router.post('/asaas/subaccount/motoboy/:userId', authenticate, checkAdmin, async (req: any, res: Response) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Adiciona endereço ao motoboy se enviado (necessário p/ a subconta Asaas)
    const a = req.body?.address;
    if (a?.street) {
      user.addresses = user.addresses || [];
      user.addresses.push({
        street: a.street,
        number: a.number || 'S/N',
        neighborhood: a.neighborhood || 'Centro',
        city: a.city || '',
        state: a.state || '',
        cep: a.zip || a.cep || '',
        latitude: '0',
        longitude: '0',
        isDefault: true,
      } as any);
      await user.save();
    }

    await ensureMotoboySubaccount(req.params.userId);
    const fresh = await User.findById(req.params.userId).select('name asaas');
    if (fresh && req.body?.pixKey) {
      fresh.asaas!.pixKey = String(req.body.pixKey).trim();
      if (req.body.pixKeyType) fresh.asaas!.pixKeyType = req.body.pixKeyType;
      fresh.markModified('asaas');
      await fresh.save();
    }
    return res.json({ name: fresh?.name, asaas: fresh?.asaas });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao criar subconta' });
  }
});

// GET /admin/asaas/subaccounts — diagnóstico: recebedores e status da subconta
router.get('/asaas/subaccounts', authenticate, checkAdmin, async (_req: any, res: Response) => {
  try {
    const stores = await Store.find({ isVerified: true }).select('name cnpj asaas').lean();
    const motoboys = await User.find({ roles: 'motoboy' }).select('name cpf asaas').lean();
    const fmt = (a: any) => ({ status: a?.status || 'none', hasWallet: !!a?.walletId, hasPix: !!a?.pixKey, lastError: a?.lastError });
    return res.json({
      stores: stores.map((s: any) => ({ id: String(s._id), name: s.name, asaas: fmt(s.asaas) })),
      motoboys: motoboys.map((u: any) => ({ id: String(u._id), name: u.name, asaas: fmt(u.asaas) })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro' });
  }
});

export default router;
