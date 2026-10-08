import { requireSettlement } from '../middleware/requireSettlement';
import walletService from '../services/wallet.prisma.service';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizePermission } from '../middleware/authorize';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { emitForceLogout } from '../utils/socketEmitter';
import { disconnectUser } from '../services/notifier';
import asaasClient from '../services/asaas/client';
import env from '../config/env';
import { decryptSensitiveData } from '../utils/encryption';
import { z } from 'zod';
import logger from '../config/logger';

const router = Router();

// ═══════════════════════════════════════════════════════════
// 👥 GERENCIAR USUÁRIOS
// ═══════════════════════════════════════════════════════════

// GET /admin/users - Listar todos os usuários
router.get('/users', authenticate, authorizePermission('user:view_all'), async (req: any, res: Response) => {
  try {
    const found = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roles: true,
        activeRole: true,
        permissions: true,
        status: true,
        blockedAt: true,
        blockReason: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // `_id` junto de `id`: o painel admin ainda lê `_id`.
    const users = found.map((u) => ({ ...u, _id: u.id }));

    res.json(users);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const ALLOWED_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'];
// Papéis administrativos: só um CEO atribui (user:manage_roles é delegável, isso não).
const ADMIN_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

// Campos devolvidos ao painel após alterar um usuário (nunca o hash da senha).
const SAFE_USER_SELECT = {
  id: true, name: true, email: true, role: true, activeRole: true, roles: true,
  status: true, blockedAt: true, blockReason: true, createdAt: true,
} as const;

// PUT /admin/users/:id/role - Atualizar role do usuário
router.put('/users/:id/role', authenticate, authorizePermission('user:manage_roles'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'Role is required' });
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
    }

    const actorRole = req.user?.activeRole || req.user?.role;
    if (actorRole !== 'ceo') {
      if (ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ error: 'Somente o CEO pode atribuir papéis administrativos' });
      }
      // Também não pode rebaixar quem já é da equipe administrativa.
      const target = await prisma.user.findUnique({ where: { id }, select: { roles: true, role: true } });
      const targetRoles = [...(target?.roles || []), target?.role].filter(Boolean) as string[];
      if (targetRoles.some((r) => ADMIN_ROLES.includes(r))) {
        return res.status(403).json({ error: 'Somente o CEO pode alterar o papel de um administrador' });
      }
    }

    // Nao permite admin rebaixar a si mesmo (evita lockout: se for o unico CEO, perde acesso)
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode alterar o proprio role. Peca para outro admin.' });
    }

    const current = await prisma.user.findUnique({ where: { id }, select: { roles: true } });
    if (!current) return res.status(404).json({ error: 'User not found' });
    // Mantém os papéis-base (cliente/lojista/motoboy); só o papel administrativo
    // anterior é substituído. Antes, `roles: [role]` apagava os demais papéis.
    const roles = Array.from(new Set([...(current.roles || []).filter((r) => !ADMIN_ROLES.includes(r)), role]));

    const user = await prisma.user.update({
      where: { id },
      data: { role, activeRole: role, roles },
      select: SAFE_USER_SELECT,
    }).catch(() => null);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // O token antigo carrega o papel anterior: derruba o socket (o HTTP já recusa).
    disconnectUser(String(id));
    res.json({ message: 'Role updated successfully', user });
  } catch (err) {
    console.error('Erro ao atualizar role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// PUT /admin/users/:id/status - Bloquear/Desbloquear usuário
router.put('/users/:id/status', authenticate, authorizePermission('user:block'), async (req: any, res: Response) => {
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

    const user = await prisma.user.update({ where: { id }, data: update, select: SAFE_USER_SELECT }).catch(() => null);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ao bloquear, emite force_logout via socket (best-effort). Se o user estiver
    // offline o evento se perde — login continua bloqueado pelo status no DB.
    if (status === 'blocked') {
      emitForceLogout(String(id), 'blocked', update.blockReason);
      disconnectUser(String(id)); // não depende do cliente obedecer ao force_logout
    }

    res.json({ message: 'Status updated successfully', user });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /admin/users/:id/disconnect - Força logout via socket sem bloquear a conta
router.post('/users/:id/disconnect', authenticate, authorizePermission('user:block'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode desconectar a propria conta' });
    }

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    emitForceLogout(String(id), 'admin_disconnect');
    disconnectUser(String(id));

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
router.get('/settings', authenticate, authorizePermission('settings:manage'), async (req: any, res: Response) => {
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
router.put('/settings', authenticate, authorizePermission('settings:manage'), async (req: any, res: Response) => {
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
router.get('/dashboard', authenticate, authorizePermission('dashboard:view_all'), async (req: any, res: Response) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalAdmins = await prisma.user.count({ where: { role: { in: ['ceo', 'marketing', 'gerente_geral'] } } });
    const activeUsers = await prisma.user.count({ where: { status: 'active' } });
    const blockedUsers = await prisma.user.count({ where: { status: 'blocked' } });

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

// GET /admin/wallets - Listar carteiras de TODOS os papéis (clientes, lojistas, motoboys).
// Carteira de cliente continua protegida: saldo só aparece com acesso aprovado vigente.
// Carteiras de loja/motoboy são contas operacionais de recebimento → o admin vê o saldo direto.
router.get('/wallets', authenticate, authorizePermission('wallet:view_all'), async (req: any, res: Response) => {
  try {
    const { hasValidWalletAccess } = require('../controllers/walletAccessController');

    const wallets = await prisma.wallet.findMany({
      where: { ownerType: { in: ['user', 'store', 'motoboy'] } },
      orderBy: { updatedAt: 'desc' },
    });
    const requesterId = String(req.user?.id);

    const formattedWallets = await Promise.all(wallets.map(async (w: any) => {
      // Resolver dono e papel conforme o tipo da carteira
      let ownerName = 'Usuário Desconhecido';
      let ownerEmail = 'N/A';
      let userRole = 'cliente';
      // userId = identidade pra solicitar acesso (no caso de loja, é o dono)
      let accessTargetId = String(w.owner);

      if (w.ownerType === 'store') {
        const store = await prisma.store.findUnique({ where: { id: String(w.owner) } }) as any;
        ownerName = store?.name || 'Loja Desconhecida';
        userRole = 'lojista';
        if (store?.ownerId) {
          accessTargetId = String(store.ownerId);
          const owner = await prisma.user.findUnique({ where: { id: String(store.ownerId) }, select: { name: true, email: true } });
          ownerEmail = owner?.email || 'N/A';
        }
      } else {
        const userData = await prisma.user.findUnique({ where: { id: String(w.owner) }, select: { name: true, email: true, role: true } });
        ownerName = userData?.name || 'Usuário Desconhecido';
        ownerEmail = userData?.email || 'N/A';
        userRole = w.ownerType === 'motoboy' ? 'motoboy' : (userData?.role || 'cliente');
      }

      // Gating de privacidade: só carteira PESSOAL de cliente exige acesso aprovado.
      const isClientWallet = w.ownerType === 'user' && userRole === 'cliente';
      const hasAccess = isClientWallet
        ? await hasValidWalletAccess(requesterId, accessTargetId)
        : true;

      return {
        _id: w.id,
        userId: accessTargetId,
        owner: w.owner,
        ownerType: w.ownerType,
        userName: ownerName,
        userEmail: ownerEmail,
        userRole,
        balance: hasAccess ? Number(w.balance) : null,
        totalEarnings: hasAccess ? Number(w.totalIncome) : null,
        totalSpent: hasAccess ? Number(w.totalSpent) : null,
        availableBalance: hasAccess ? Number(w.availableBalance) : null,
        pendingBalance: hasAccess ? Number(w.pendingBalance) : null,
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
router.get('/wallets/:id/transactions', authenticate, authorizePermission('wallet:view_all'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const wallet = await prisma.wallet.findUnique({ where: { id: String(id) } });
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

    // Retornar histórico de transações (ledger WalletEntry).
    const entries = await prisma.walletEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const transactions = entries.map((h) => ({
      _id: h.id,
      walletId: wallet.id,
      type: h.type === 'credit' ? 'credit' : h.type === 'refund' ? 'refund' : 'debit',
      category: h.category || null,
      amount: Number(h.amount),
      reason: h.reason,
      description: h.reason,
      paymentMethod: h.paymentMethod || null,
      status: 'completed',
      createdAt: h.createdAt,
    }));

    res.json(transactions);
  } catch (err) {
    console.error('Erro ao listar transações:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Crédito/ajuste manual de carteira: exclusivo do CEO (wallet:credit não é delegável),
// com motivo obrigatório. A trilha de auditoria fica persistida no próprio WalletEntry
// (reason + reference `ADMIN_CREDIT|ADMIN_ADJUST:<adminId>:<timestamp>` + createdAt + amount).
const ADMIN_WALLET_MAX = 50_000;
const adminReason = z.string().trim().min(10, 'Informe o motivo (mínimo 10 caracteres)').max(500);
const AddBalanceSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo').max(ADMIN_WALLET_MAX, `Máximo R$ ${ADMIN_WALLET_MAX}`),
  reason: adminReason,
});
const AdjustBalanceSchema = z.object({
  amount: z.number().refine((v) => v !== 0 && Math.abs(v) <= ADMIN_WALLET_MAX, 'Valor inválido'),
  reason: adminReason,
});

// POST /admin/wallets/:id/add-balance - Adicionar saldo à carteira
router.post('/wallets/:id/add-balance', authenticate, authorizePermission('wallet:credit'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = AddBalanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' });
    }
    const { amount, reason } = parsed.data;

    const existing = await prisma.wallet.findUnique({ where: { id: String(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Adição manual de saldo (crédito administrativo, categoria 'deposit').
    const reference = `ADMIN_CREDIT:${req.user.id}:${Date.now()}`;
    const wallet = await walletService.credit({
      owner: existing.owner, ownerType: existing.ownerType as any, amount,
      reason, category: 'deposit', reference,
    });
    logger.info('[wallet][AUDIT] crédito administrativo', {
      adminId: req.user.id, walletId: existing.id, owner: existing.owner, ownerType: existing.ownerType,
      amount, reason, reference,
    });

    res.json({
      success: true,
      message: 'Saldo adicionado com sucesso',
      newBalance: Number(wallet.balance),
      transactionId: reference,
    });
  } catch (err) {
    console.error('Erro ao adicionar saldo:', err);
    res.status(500).json({ error: 'Failed to add balance' });
  }
});

// PUT /admin/wallets/:id/balance - Adicionar saldo manual (ajuste administrativo)
router.put('/wallets/:id/balance', authenticate, authorizePermission('wallet:credit'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = AdjustBalanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' });
    }
    const { amount, reason } = parsed.data;

    const existing = await prisma.wallet.findUnique({ where: { id: String(id) } });
    if (!existing) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Ajuste administrativo (crédito se amount > 0, débito se < 0).
    const reference = `ADMIN_ADJUST:${req.user.id}:${Date.now()}`;
    const ref = { owner: existing.owner, ownerType: existing.ownerType as any };
    const wallet = amount > 0
      ? await walletService.credit({ ...ref, amount, reason, category: 'deposit', reference })
      : await walletService.debit({ ...ref, amount: Math.abs(amount), reason, category: 'transfer', reference });
    logger.info('[wallet][AUDIT] ajuste administrativo', {
      adminId: req.user.id, walletId: existing.id, owner: existing.owner, ownerType: existing.ownerType,
      amount, reason, reference,
    });

    res.json({
      message: 'Wallet balance updated',
      wallet: { ...wallet, balance: Number(wallet.balance) },
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
router.get('/app-cashbox', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:view'), getAppCashbox);

// GET /admin/app-cashbox/statement - Ver extrato detalhado
router.get('/app-cashbox/statement', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:view'), getAppCashboxStatement);

// POST /admin/app-cashbox/withdrawal - Solicitar saque
router.post('/app-cashbox/withdrawal', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:withdraw'), requestWithdrawal);

// GET /admin/app-cashbox/withdrawals - Ver saques
router.get('/app-cashbox/withdrawals', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:view'), getWithdrawals);

// PUT /admin/app-cashbox/withdrawals/:id/approve - Aprovar saque
router.put('/app-cashbox/withdrawals/:id/approve', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:approve_withdrawal'), approveWithdrawal);

// PUT /admin/app-cashbox/withdrawals/:id/reject - Rejeitar saque
router.put('/app-cashbox/withdrawals/:id/reject', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:approve_withdrawal'), rejectWithdrawal);

// POST /admin/app-cashbox/deposit - Registrar depósito
router.post('/app-cashbox/deposit', requireSettlement('custodia'), authenticate, authorizePermission('cashbox:deposit'), registerDeposit);

// ═══════════════════════════════════════════════════════════
// 🏦 SUBCONTAS ASAAS (gateway) — criar/backfill p/ recebedores já verificados
// ═══════════════════════════════════════════════════════════

import { ensureStoreSubaccount, ensureMotoboySubaccount } from '../services/asaas/subaccount';
import { encryptSensitiveData } from '../utils/encryption';

// POST /admin/asaas/subaccount/store/:storeId
// body opcional: { pixKey, pixKeyType, address:{ street, number, neighborhood, city, state, zip } }
router.post('/asaas/subaccount/store/:storeId', authenticate, authorizePermission('gateway:manage'), async (req: any, res: Response) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: String(req.params.storeId) } }) as any;
    if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

    // Preenche endereço da loja se enviado (necessário p/ a subconta Asaas)
    const a = req.body?.address;
    if (a) {
      await prisma.store.update({
        where: { id: store.id },
        data: {
          ...(a.street ? { street: a.street } : {}),
          ...(a.number ? { number: a.number } : {}),
          ...(a.neighborhood ? { neighborhood: a.neighborhood } : {}),
          ...(a.city ? { city: a.city } : {}),
          ...(a.state ? { state: a.state } : {}),
          ...(a.zip || a.cep ? { zip: a.zip || a.cep } : {}),
        },
      });
    }

    await ensureStoreSubaccount(req.params.storeId);
    // +apiKeyEncrypted: sem isso o markModified+save apagaria a apiKey da subconta
    const fresh = await prisma.store.findUnique({ where: { id: String(req.params.storeId) } }) as any;
    if (fresh && req.body?.pixKey) {
      fresh.asaas!.pixKey = String(req.body.pixKey).trim();
      if (req.body.pixKeyType) fresh.asaas!.pixKeyType = req.body.pixKeyType;
      await prisma.store.update({ where: { id: fresh.id }, data: { asaas: fresh.asaas } });
    }
    // Recuperação MANUAL: colar a apiKey/accountId/walletId da subconta (do painel
    // Asaas) quando a recuperação automática não consegue. Destrava o saque.
    if (fresh && (req.body?.apiKey || req.body?.accountId || req.body?.walletId)) {
      if (!fresh.asaas) fresh.asaas = { status: 'none' };
      if (req.body.accountId) fresh.asaas.accountId = String(req.body.accountId).trim();
      if (req.body.walletId) fresh.asaas.walletId = String(req.body.walletId).trim();
      if (req.body.apiKey) {
        fresh.asaas.apiKeyEncrypted = encryptSensitiveData(String(req.body.apiKey).trim());
        fresh.asaas.status = 'active';
        fresh.asaas.lastError = undefined;
      }
      await userRepository.update(fresh.id, { asaas: fresh.asaas });
    }
    return res.json({
      name: fresh?.name,
      asaas: fresh?.asaas ? {
        status: fresh.asaas.status,
        accountId: fresh.asaas.accountId,
        walletId: fresh.asaas.walletId,
        pixKey: fresh.asaas.pixKey,
        pixKeyType: fresh.asaas.pixKeyType,
        lastError: fresh.asaas.lastError,
        hasApiKey: !!fresh.asaas.apiKeyEncrypted,
      } : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao criar subconta' });
  }
});

// POST /admin/asaas/subaccount/motoboy/:userId
// body opcional: { pixKey, pixKeyType, address:{ street, number, neighborhood, city, state, zip } }
router.post('/asaas/subaccount/motoboy/:userId', authenticate, authorizePermission('gateway:manage'), async (req: any, res: Response) => {
  try {
    const user = await userRepository.findById(String(req.params.userId));
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Adiciona endereço ao motoboy se enviado (necessário p/ a subconta Asaas).
    // `addresses` virou tabela relacionada: inserimos uma linha em vez de dar push no array.
    const a = req.body?.address;
    if (a?.street) {
      await prisma.address.create({
        data: {
          userId: user.id,
          street: a.street,
          number: a.number || 'S/N',
          neighborhood: a.neighborhood || 'Centro',
          city: a.city || '',
          state: a.state || '',
          cep: a.zip || a.cep || '',
          latitude: '0',
          longitude: '0',
          isDefault: true,
        },
      });
    }

    await ensureMotoboySubaccount(req.params.userId);
    // O bloco `asaas` vem inteiro (JSONB) — alterar e regravar preserva a apiKey.
    const fresh = (await userRepository.findById(String(req.params.userId))) as any;
    if (fresh && req.body?.pixKey) {
      fresh.asaas.pixKey = String(req.body.pixKey).trim();
      if (req.body.pixKeyType) fresh.asaas.pixKeyType = req.body.pixKeyType;
      await userRepository.update(fresh.id, { asaas: fresh.asaas });
    }
    // Recuperação MANUAL: colar a apiKey/accountId/walletId da subconta (do painel
    // Asaas) quando a recuperação automática não consegue. Destrava o saque.
    if (fresh && (req.body?.apiKey || req.body?.accountId || req.body?.walletId)) {
      if (!fresh.asaas) fresh.asaas = { status: 'none' };
      if (req.body.accountId) fresh.asaas.accountId = String(req.body.accountId).trim();
      if (req.body.walletId) fresh.asaas.walletId = String(req.body.walletId).trim();
      if (req.body.apiKey) {
        fresh.asaas.apiKeyEncrypted = encryptSensitiveData(String(req.body.apiKey).trim());
        fresh.asaas.status = 'active';
        fresh.asaas.lastError = undefined;
      }
      await userRepository.update(fresh.id, { asaas: fresh.asaas });
    }
    return res.json({
      name: fresh?.name,
      asaas: fresh?.asaas ? {
        status: fresh.asaas.status,
        accountId: fresh.asaas.accountId,
        walletId: fresh.asaas.walletId,
        pixKey: fresh.asaas.pixKey,
        pixKeyType: fresh.asaas.pixKeyType,
        lastError: fresh.asaas.lastError,
        hasApiKey: !!fresh.asaas.apiKeyEncrypted,
      } : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao criar subconta' });
  }
});

// GET /admin/asaas/subaccounts — diagnóstico: recebedores e status da subconta
router.get('/asaas/subaccounts', authenticate, authorizePermission('gateway:manage'), async (_req: any, res: Response) => {
  try {
    const stores = await prisma.store.findMany({ where: { isVerified: true }, select: { id: true, name: true, cnpj: true, asaas: true } });
    const motoboys = await prisma.user.findMany({
      where: { roles: { has: 'motoboy' } },
      select: { id: true, name: true, cpf: true, asaas: true },
    });
    const fmt = (a: any) => ({ status: a?.status || 'none', hasWallet: !!a?.walletId, hasPix: !!a?.pixKey, lastError: a?.lastError });
    return res.json({
      stores: stores.map((s: any) => ({ id: String(s._id), name: s.name, asaas: fmt(s.asaas) })),
      motoboys: motoboys.map((u: any) => ({ id: u.id, name: u.name, asaas: fmt(u.asaas) })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro' });
  }
});

// ═══════════════════════════════════════════════════════════
// 🔑 CHAVE PIX DA CONTA-MÃE (necessária p/ receber cobranças)
// ═══════════════════════════════════════════════════════════

// POST /admin/asaas/release-order/:orderId — re-tenta transferir/liberar os payouts
// PENDENTES de um pedido (ex: subconta criada DEPOIS da entrega, ou transferência falhou).
router.post('/asaas/release-order/:orderId', authenticate, authorizePermission('gateway:manage'), async (req: any, res: Response) => {
  try {
    const { releaseOrderViaAsaas } = await import('../services/asaas/release');
    await releaseOrderViaAsaas(req.params.orderId);
    const payouts = await prisma.payout.findMany({
      where: { orderId: String(req.params.orderId) },
      select: { recipientType: true, amount: true, status: true, gatewayTransferId: true },
    });
    return res.json({ orderId: req.params.orderId, payouts: payouts.map((p) => ({ ...p, amount: Number(p.amount) })) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao re-liberar pedido' });
  }
});

// GET /admin/asaas/conta-mae/pix — lista as chaves PIX da conta-mãe
router.get('/asaas/conta-mae/pix', authenticate, authorizePermission('gateway:manage'), async (_req: any, res: Response) => {
  try {
    const asaasClient = (await import('../services/asaas/client')).default;
    const keys = await asaasClient.get('/pix/addressKeys');
    return res.json(keys);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Erro ao listar chaves PIX' });
  }
});

// POST /admin/asaas/conta-mae/pix — cria uma chave PIX aleatória (EVP) se não houver
router.post('/asaas/conta-mae/pix', authenticate, authorizePermission('gateway:manage'), async (_req: any, res: Response) => {
  try {
    const asaasClient = (await import('../services/asaas/client')).default;
    const existing: any = await asaasClient.get('/pix/addressKeys');
    if (existing?.data?.length > 0) {
      return res.json({ message: 'Conta-mãe já possui chave PIX', total: existing.totalCount, keys: existing.data });
    }
    const created = await asaasClient.post('/pix/addressKeys', { type: 'EVP' });
    return res.json({ message: 'Chave PIX criada na conta-mãe', created });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Erro ao criar chave PIX' });
  }
});

// ═══════════════════════════════════════════════════════════
// 🧪 FERRAMENTAS ASAAS (teste): saldo da conta-mãe + abastecer subconta
// ═══════════════════════════════════════════════════════════

// GET /admin/asaas/balance — saldo da conta-mãe (útil pra ver se está zerada)
router.get('/asaas/balance', authenticate, authorizePermission('cashbox:view'), async (_req: any, res: Response) => {
  try {
    if (!asaasClient.isConfigured()) return res.status(400).json({ error: 'Asaas não configurado (ASAAS_API_KEY ausente)' });
    const bal = await asaasClient.getBalance();
    return res.json({ balance: Number(bal?.balance || 0), apiUrl: env.ASAAS_API_URL });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Falha ao consultar saldo Asaas' });
  }
});

// Resolve o walletId da subconta do recebedor (auto-cria se faltar).
async function resolveSubaccountWalletId(recipientType: 'store' | 'motoboy', recipientId: string): Promise<string | null> {
  if (recipientType === 'store') {
    let store = await prisma.store.findUnique({ where: { id: String(recipientId) } }) as any;
    if (!store?.asaas?.walletId) { await ensureStoreSubaccount(String(recipientId)); store = await prisma.store.findUnique({ where: { id: String(recipientId) } }) as any; }
    return store?.asaas?.walletId || null;
  }
  let user = await userRepository.findById(String(recipientId)) as any;
  if (!user?.asaas?.walletId) { await ensureMotoboySubaccount(String(recipientId)); user = await userRepository.findById(String(recipientId)) as any; }
  return user?.asaas?.walletId || null;
}

// Lê o saldo DISPONÍVEL da subconta (com a apiKey dela) — é o que o saque usa.
async function readSubaccountBalance(recipientType: 'store' | 'motoboy', recipientId: string): Promise<number | null> {
  try {
    let apiKeyEnc: string | undefined;
    if (recipientType === 'store') {
      const store = await prisma.store.findUnique({ where: { id: String(recipientId) } }) as any;
      apiKeyEnc = store?.asaas?.apiKeyEncrypted;
    } else {
      const user = await userRepository.findById(String(recipientId)) as any;
      apiKeyEnc = user?.asaas?.apiKeyEncrypted;
    }
    if (!apiKeyEnc) return null;
    const apiKey = decryptSensitiveData(apiKeyEnc);
    const bal = await asaasClient.getAs<{ balance: number }>(apiKey, '/finance/balance');
    return typeof bal?.balance === 'number' ? bal.balance : Number(bal?.balance);
  } catch {
    return null;
  }
}

// POST /admin/asaas/fund-subaccount — transfere conta-mãe → subconta (DEV/teste)
// body: { recipientType: 'store'|'motoboy', recipientId, amount }
router.post('/asaas/fund-subaccount', authenticate, authorizePermission('wallet:credit'), async (req: any, res: Response) => {
  try {
    const { recipientType, recipientId, amount } = req.body || {};
    if (!['store', 'motoboy'].includes(recipientType)) return res.status(400).json({ error: 'recipientType deve ser store ou motoboy' });
    if (!recipientId) return res.status(400).json({ error: 'recipientId obrigatório' });
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'amount inválido' });
    if (!asaasClient.isConfigured()) return res.status(400).json({ error: 'Asaas não configurado' });

    const walletId = await resolveSubaccountWalletId(recipientType, String(recipientId));
    if (!walletId) return res.status(400).json({ error: 'Recebedor sem subconta Asaas (não foi possível criar). Confira se o recebedor concluiu a verificação.' });

    const transfer = await asaasClient.post<any>('/transfers', { value: Number(value.toFixed(2)), walletId });
    return res.json({ success: true, message: `Transferido R$ ${value.toFixed(2)} para a subconta.`, transferId: transfer?.id, status: transfer?.status });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Falha ao abastecer subconta (a conta-mãe tem saldo?)' });
  }
});

// POST /admin/asaas/fund-for-withdrawal — abastece a subconta do recebedor de UM saque
// pendente (deriva recebedor pelos payouts do saque). body: { withdrawalId }
router.post('/asaas/fund-for-withdrawal', authenticate, authorizePermission('wallet:credit'), async (req: any, res: Response) => {
  try {
    const { withdrawalId } = req.body || {};
    if (!withdrawalId) return res.status(400).json({ error: 'withdrawalId obrigatório' });
    if (!asaasClient.isConfigured()) return res.status(400).json({ error: 'Asaas não configurado' });

    const wr = await prisma.withdrawalRequest.findUnique({ where: { id: String(withdrawalId) } }) as any;
    if (!wr) return res.status(404).json({ error: 'Saque não encontrado' });

    // Deriva recebedor: pelos payouts (fonte da verdade) ou fallback pro motoboyId do WR.
    let recipientType: 'store' | 'motoboy' = 'motoboy';
    let recipientId: string = wr.motoboyId;
    const firstPayoutId = (wr.payoutIds || [])[0];
    if (firstPayoutId) {
      const p = await prisma.payout.findUnique({ where: { id: String(firstPayoutId) } }) as any;
      if (p) { recipientType = p.recipientType; recipientId = p.recipientId; }
    }

    const walletId = await resolveSubaccountWalletId(recipientType, String(recipientId));
    if (!walletId) return res.status(400).json({ error: 'Recebedor sem subconta Asaas (não foi possível criar). Confira se o recebedor concluiu a verificação.' });

    const value = Number(Number(wr.amount).toFixed(2));
    const transfer = await asaasClient.post<any>('/transfers', { value, walletId });
    // Confere o saldo REAL/disponível da subconta após a transferência.
    const subBal = await readSubaccountBalance(recipientType, String(recipientId));
    const settled = subBal != null && subBal >= value - 0.01;
    const msg = settled
      ? `Subconta abastecida (saldo disponível: R$ ${(subBal as number).toFixed(2)}). Já dá pra aprovar.`
      : `Transferência enviada (status ${transfer?.status || '—'}), mas o saldo DISPONÍVEL da subconta ainda é R$ ${subBal == null ? '?' : (subBal as number).toFixed(2)}. No sandbox a liquidação pode levar alguns instantes — aguarde e tente aprovar de novo.`;
    return res.json({ success: true, message: msg, transferId: transfer?.id, status: transfer?.status, subaccountBalance: subBal });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Falha ao abastecer subconta (a conta-mãe tem saldo?)' });
  }
});

// ═══════════════════════════════════════════════════════════
// 🛑 FREIOS / KILL SWITCHES (pausar funções que custam dinheiro)
// ═══════════════════════════════════════════════════════════
const SWITCH_KEYS = ['rankingPrizesEnabled', 'benefitsRedeemEnabled', 'gamificationPointsEnabled'] as const;

// Configurações do modo SaaS, editadas pelo mesmo endpoint dos freios.
const switchesSchema = z
  .object({
    rankingPrizesEnabled: z.boolean(),
    benefitsRedeemEnabled: z.boolean(),
    gamificationPointsEnabled: z.boolean(),
    settlementMode: z.enum(['custodia', 'direto']),
    billingModel: z.enum(['mensalidade', 'comissao', 'ambos']),
    motoboyShareDirect: z.number().min(0).max(100),
    directCardEnabled: z.boolean(),
    transferBlockHours: z.number().int().min(1).max(720),
    confirmSettlement: z.string().max(60),
  })
  .partial()
  .strict();

function switchesView(cfg: any) {
  const out: Record<string, any> = {};
  for (const k of SWITCH_KEYS) out[k] = !!cfg?.[k];
  out.settlementMode = cfg?.settlementMode ?? 'custodia';
  out.billingModel = cfg?.billingModel ?? 'mensalidade';
  out.motoboyShareDirect = Number(cfg?.motoboyShareDirect ?? 100);
  out.directCardEnabled = !!cfg?.directCardEnabled;
  out.transferBlockHours = Number(cfg?.transferBlockHours ?? 24);
  return out;
}

router.get('/switches', authenticate, authorizePermission('settings:manage'), async (_req: any, res: Response) => {
  try {
    const { getPlatformConfig } = await import('../repositories/platformConfig.repository');
    const cfg = await getPlatformConfig();
    return res.json(switchesView(cfg));
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao ler os freios' });
  }
});

const isCeo = (req: any) => (req.user?.activeRole || req.user?.role) === 'ceo';

// Riscos da troca de modo, com os números reais, antes de o CEO confirmar.
router.get('/switches/settlement-preview', authenticate, authorizePermission('settings:manage'), async (req: any, res: Response) => {
  try {
    if (!isCeo(req)) return res.status(403).json({ error: 'Apenas o CEO altera o modo de liquidação', code: 'CEO_ONLY' });
    const to = req.query.to;
    if (to !== 'custodia' && to !== 'direto') return res.status(400).json({ error: 'Modo inválido' });
    const { settlementSwitchPreview } = await import('../services/settlementSwitch');
    return res.json(await settlementSwitchPreview(to));
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao calcular os riscos da troca' });
  }
});

router.put('/switches', authenticate, authorizePermission('settings:manage'), async (req: any, res: Response) => {
  try {
    const parsed = switchesSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Configuração inválida' });
    const { confirmSettlement, ...patch } = parsed.data as Record<string, any>;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nenhum freio válido informado' });
    // Modo de liquidação e cartão direto decidem para onde vai o dinheiro dos pedidos:
    // só o CEO (activeRole), mesmo que outro papel tenha settings:manage delegado.
    const CEO_ONLY_SWITCHES = ['settlementMode', 'directCardEnabled'];
    if (CEO_ONLY_SWITCHES.some((k) => k in patch) && !isCeo(req)) {
      return res.status(403).json({ error: 'Apenas o CEO altera o modo de liquidação e o cartão direto', code: 'CEO_ONLY' });
    }
    // Trocar o modo muda para onde vai o dinheiro dos pedidos novos: bloqueios primeiro,
    // depois a frase exata (o CEO viu os riscos no preview).
    let settlementChange: { from: string; to: string } | null = null;
    if ('settlementMode' in patch) {
      const { getSaasConfig } = await import('../utils/settlement');
      const { settlementSwitchPreview } = await import('../services/settlementSwitch');
      const from = (await getSaasConfig()).settlementMode;
      if (patch.settlementMode !== from) {
        const preview = await settlementSwitchPreview(patch.settlementMode);
        if (preview.blockers.length > 0) {
          return res.status(409).json({ error: 'Troca de modo bloqueada', code: 'SETTLEMENT_BLOCKED', blockers: preview.blockers });
        }
        if (confirmSettlement !== preview.confirmPhrase) {
          return res.status(400).json({
            error: `Para trocar o modo, digite exatamente: ${preview.confirmPhrase}`,
            code: 'SETTLEMENT_CONFIRM_REQUIRED',
            confirmPhrase: preview.confirmPhrase,
            risks: preview.risks,
          });
        }
        settlementChange = { from, to: patch.settlementMode };
      }
    }
    const { updatePlatformConfig } = await import('../repositories/platformConfig.repository');
    const cfg = await updatePlatformConfig(patch, req.user?.id || 'system');
    if (settlementChange) logger.warn('[settlement][AUDIT] modo de liquidação trocado', { by: req.user?.id, ...settlementChange });
    return res.json(switchesView(cfg));
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao salvar os freios' });
  }
});

export default router;
