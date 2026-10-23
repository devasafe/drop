import { requireSettlement } from '../middleware/requireSettlement';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { authorizeAnyPermission, authorizePermission } from '../middleware/authorize';
import { activeRoleOf, isTeamRole } from '../controllers/rolePermissionsController';
import { catchAsync } from '../middleware/errorHandler';
import { deleteStoreRatingReply } from '../controllers/storeRatingReplyController';
import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { emitForceLogout } from '../utils/socketEmitter';
import { disconnectUser } from '../services/notifier';
import asaasClient from '../services/asaas/client';
import env from '../config/env';
import { decryptSensitiveData } from '../utils/encryption';
import { z } from 'zod';
import logger from '../config/logger';
import { actorFromRequest, sendMoneyActionError, MoneyActionError } from '../services/adminMoneyAction.service';
import { adjustWalletBalance, WalletAdjustInput } from '../services/walletAdjust.service';
import { recordAccountAction } from '../services/adminAccounts/actions';
import { parseOptionalReason, parseRequiredReason, sendAccountActionError } from '../services/adminAccounts/errors';
import { audienceAccessOf } from '../services/adminAccounts/audience';
import { AUDIENCE_FORBIDDEN, WALLET_OWNER_AUDIENCE, canReachUser, familyKeys, userAudiences } from '../services/permissions/catalog';

const router = Router();

// ═══════════════════════════════════════════════════════════
// 👥 GERENCIAR USUÁRIOS
// ═══════════════════════════════════════════════════════════

// GET /admin/users (lista) mora em routes/adminAccounts.ts desde a D3b-2a (busca no servidor e cursor).

const ALLOWED_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'];
// Papéis administrativos: só um CEO atribui (user:manage_roles é delegável, isso não).
const ADMIN_ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

// Conta antiga pode ter o papel só em `role`/`activeRole`: conta como atual (a tela também marca).
const currentRolesOf = (t: { roles: string[] | null; role: string | null; activeRole: string | null }): string[] =>
  Array.from(new Set([...(t.roles || []), t.role, t.activeRole].filter(Boolean).map(String)));
const isStaffAccount = (roles: string[]) => roles.some((r) => ADMIN_ROLES.includes(r));
const TARGET_ROLES_SELECT = { roles: true, role: true, activeRole: true } as const;

// user:block é delegável; agir sobre conta da equipe não é (senão um gerente bloqueia o próprio CEO).
const STAFF_TARGET_FORBIDDEN = { error: 'Somente o CEO pode bloquear ou desconectar alguém da equipe.', code: 'STAFF_TARGET_FORBIDDEN' };
// Por público (22/10): user:block vale para todos; user:edit_clients/user:edit_motoboys, só para o público da chave.
const anyUserEdit = authorizeAnyPermission(familyKeys('userEdit'));
const USER_AUDIENCE_FORBIDDEN = { error: 'Esta pessoa está fora do público que você pode bloquear ou desconectar.', code: AUDIENCE_FORBIDDEN };
const WALLET_AUDIENCE_FORBIDDEN = { error: 'Esta carteira está fora do público que você pode ver.', code: AUDIENCE_FORBIDDEN };
/**
 * Por público, o dono da carteira tem de ser do público dela: a pessoal ('user') só de quem é cliente (sem papel
 * de loja, motoboy nem equipe, o critério de userAudiences); a de motoboy, de quem não é da equipe.
 */
const walletOwnerInAudience = (ownerType: string, roles: string[]): boolean =>
  ownerType === 'user' ? userAudiences(roles).includes('cliente') : !isStaffAccount(roles);

// Campos devolvidos ao painel após alterar um usuário (nunca o hash da senha).
const SAFE_USER_SELECT = {
  id: true, name: true, email: true, role: true, activeRole: true, roles: true,
  status: true, blockedAt: true, blockReason: true, createdAt: true,
} as const;

// Ordem do `role` base quando o atual sai da lista.
const BASE_ROLE_ORDER = ['ceo', 'lojista', 'motoboy', 'cliente'];
const OPEN_ORDER_STATUSES = ['criado', 'pago', 'aguardando_motoboy', 'enviado'] as const;
const OPEN_DELIVERY_STATUSES = ['assigned', 'picked'] as const;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Trabalho em aberto que impede tirar o papel: pedidos da loja (lojista) ou entregas em curso (motoboy). */
async function openWorkFor(tx: Tx, userId: string, removed: string[]) {
  if (removed.includes('lojista')) {
    const count = await tx.order.count({ where: { store: { ownerId: userId }, status: { in: [...OPEN_ORDER_STATUSES] } } });
    if (count > 0) return { role: 'lojista', count, error: `Esta pessoa tem ${count} pedido(s) em aberto na loja. Termine ou repasse antes de tirar o papel de Lojista.` };
  }
  if (removed.includes('motoboy')) {
    const count = await tx.delivery.count({ where: { motoboyId: userId, status: { in: [...OPEN_DELIVERY_STATUSES] } } });
    if (count > 0) return { role: 'motoboy', count, error: `Esta pessoa tem ${count} entrega(s) em andamento. Termine ou repasse antes de tirar o papel de Motoboy.` };
  }
  return null;
}

// PUT /admin/users/:id/roles - Grava a lista COMPLETA de papéis do usuário
router.put('/users/:id/roles', authenticate, authorizePermission('user:manage_roles'), async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body?.roles;

    if (!Array.isArray(input) || !input.every((r) => typeof r === 'string' && ALLOWED_ROLES.includes(r))) {
      return res.status(400).json({ error: `Lista de papéis inválida. Permitidos: ${ALLOWED_ROLES.join(', ')}`, code: 'INVALID_ROLES' });
    }
    // Todo mundo pode comprar: `cliente` sempre entra.
    const roles: string[] = Array.from(new Set([...input, 'cliente']));

    // Nao permite admin alterar a si mesmo (evita lockout: se for o unico CEO, perde acesso)
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode alterar o proprio role. Peca para outro admin.' });
    }

    const target = await prisma.user.findUnique({ where: { id }, select: TARGET_ROLES_SELECT });
    if (!target) return res.status(404).json({ error: 'User not found' });
    const currentRoles = currentRolesOf(target);
    const added = roles.filter((r) => !currentRoles.includes(r));
    const removed = currentRoles.filter((r) => !roles.includes(r));

    if (activeRoleOf(req.user) !== 'ceo') {
      if ([...added, ...removed].some((r) => ADMIN_ROLES.includes(r))) {
        return res.status(403).json({ error: 'Somente o CEO pode atribuir papéis administrativos', code: 'STAFF_TARGET_FORBIDDEN' });
      }
      // Também não pode mexer em quem já é da equipe administrativa.
      if (isStaffAccount(currentRoles)) {
        return res.status(403).json({ error: 'Somente o CEO pode alterar o papel de um administrador', code: 'STAFF_TARGET_FORBIDDEN' });
      }
    }

    // Papel de equipe é acréscimo, não área ativa: a pessoa segue como cliente.
    const currentActive = target.activeRole ? String(target.activeRole) : '';
    const activeRole = roles.includes(currentActive) && !isTeamRole(currentActive) ? currentActive : 'cliente';
    const role = roles.includes(String(target.role)) ? String(target.role) : BASE_ROLE_ORDER.find((r) => roles.includes(r))!;

    const actor = actorFromRequest(req);
    // Checagem de trabalho aberto e gravação juntas: nada entra entre uma e outra.
    const result = await prisma.$transaction(async (tx) => {
      const openWork = await openWorkFor(tx, id, removed);
      if (openWork) return { openWork };
      // Sem lojista ninguém opera a loja: fecha (só isOpen). Devolver o papel não reabre.
      const storesClosed = removed.includes('lojista')
        ? (await tx.store.updateMany({ where: { ownerId: id, isOpen: true }, data: { isOpen: false } })).count
        : 0;
      const user = await tx.user.update({
        where: { id },
        data: { role: role as any, activeRole: activeRole as any, roles: roles as any },
        select: SAFE_USER_SELECT,
      });
      // D3b-2a: histórico da pessoa, na mesma transação. Sem papel entrando ou saindo, nada a registrar.
      if (added.length > 0 || removed.length > 0) {
        await recordAccountAction(tx, {
          actor, userId: id, type: 'roles_change',
          meta: { before: [...currentRoles].sort(), after: [...roles].sort() },
        });
      }
      return { user, storesClosed };
    });
    if ('openWork' in result) return res.status(409).json({ ...result.openWork, code: 'ROLE_HAS_OPEN_WORK' });

    // O token antigo carrega o papel anterior: derruba o socket (o HTTP já recusa).
    disconnectUser(String(id));
    res.json({ message: 'Papéis atualizados', user: result.user, storesClosed: result.storesClosed });
  } catch (err) {
    logger.error('Erro ao atualizar papéis', err as Error);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

// PUT /admin/users/:id/status - Bloquear/Desbloquear usuário
// D3b-2a: bloquear exige motivo (5 a 500); desbloquear aceita motivo opcional. block/unblock vão
// para AdminAccountAction na mesma transação da mudança de status.
router.put('/users/:id/status', authenticate, anyUserEdit, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'blocked', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Nao permite admin bloquear a si mesmo
    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode bloquear a propria conta' });
    }

    let reason: string | null = null;
    if (status === 'blocked') reason = parseRequiredReason(req.body?.reason);
    else reason = parseOptionalReason(req.body?.reason); // active/inactive: motivo opcional, usado se sair de blocked

    // Antes de qualquer escrita: quem não é CEO não mexe no status de conta da equipe.
    const target = await prisma.user.findUnique({ where: { id }, select: TARGET_ROLES_SELECT });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (activeRoleOf(req.user) !== 'ceo' && isStaffAccount(currentRolesOf(target))) {
      return res.status(403).json(STAFF_TARGET_FORBIDDEN);
    }
    if (!canReachUser(await audienceAccessOf(req.user, 'userEdit'), currentRolesOf(target))) {
      return res.status(403).json(USER_AUDIENCE_FORBIDDEN);
    }
    const actor = actorFromRequest(req);

    const update: any = { status };
    if (status === 'blocked') {
      update.blockedAt = new Date();
      update.blockedBy = String(req.user.id);
      update.blockReason = reason;
    } else {
      // active/inactive: se vier de blocked, o bloqueio sai (o registro 'unblock' é gravado abaixo).
      update.blockedAt = null;
      update.blockedBy = null;
      update.blockReason = null;
    }

    const user = await prisma.$transaction(async (tx) => {
      // Trava a linha: o status anterior lido aqui é o que decide o registro, sem corrida.
      const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "User" WHERE id = ${id} FOR UPDATE`;
      const before = rows[0];
      if (!before) return null;
      const saved = await tx.user.update({ where: { id }, data: update, select: SAFE_USER_SELECT });
      if (status === 'blocked') {
        await recordAccountAction(tx, { actor, userId: id, type: 'block', reason, meta: { before: before.status } });
      } else if (before.status === 'blocked') {
        await recordAccountAction(tx, { actor, userId: id, type: 'unblock', reason, meta: { after: status } });
      }
      return saved;
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ao bloquear, emite force_logout via socket (best-effort). Se o user estiver
    // offline o evento se perde — login continua bloqueado pelo status no DB.
    if (status === 'blocked') {
      emitForceLogout(String(id), 'blocked', update.blockReason);
      disconnectUser(String(id)); // não depende do cliente obedecer ao force_logout
    }

    res.json({ message: 'Status updated successfully', user });
  } catch (err) {
    if (sendAccountActionError(res, err)) return;
    logger.error('Erro ao atualizar status', err as Error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// POST /admin/users/:id/disconnect - Força logout via socket sem bloquear a conta
router.post('/users/:id/disconnect', authenticate, anyUserEdit, async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'Voce nao pode desconectar a propria conta' });
    }

    const user = await prisma.user.findUnique({ where: { id }, select: TARGET_ROLES_SELECT });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (activeRoleOf(req.user) !== 'ceo' && isStaffAccount(currentRolesOf(user))) {
      return res.status(403).json(STAFF_TARGET_FORBIDDEN);
    }
    if (!canReachUser(await audienceAccessOf(req.user, 'userEdit'), currentRolesOf(user))) {
      return res.status(403).json(USER_AUDIENCE_FORBIDDEN);
    }

    // D3b-2a: registra antes de derrubar a sessão; se o registro falha, ninguém é desconectado.
    const actor = actorFromRequest(req);
    await prisma.$transaction((tx) => recordAccountAction(tx, { actor, userId: id, type: 'disconnect' }));

    emitForceLogout(String(id), 'admin_disconnect');
    disconnectUser(String(id));

    res.json({ message: 'Disconnect event emitted', userId: id });
  } catch (err) {
    logger.error('Erro ao desconectar usuario', err as Error);
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

// Carteiras por público (22/10): qualquer wallet:view_* abre; o tipo de carteira é filtrado na rota.
const anyWalletView = authorizeAnyPermission(familyKeys('wallet'));
const WALLET_OWNER_TYPES = ['user', 'store', 'motoboy'] as const;

// GET /admin/wallets - Listar carteiras de TODOS os papéis (clientes, lojistas, motoboys).
// Carteira de cliente continua protegida: saldo só aparece com acesso aprovado vigente.
// Carteiras de loja/motoboy são contas operacionais de recebimento → o admin vê o saldo direto.
// Por público: só os tipos das chaves da conta, e nunca a carteira pessoal de alguém da equipe.
router.get('/wallets', authenticate, anyWalletView, async (req: any, res: Response) => {
  try {
    const { hasValidWalletAccess } = require('../controllers/walletAccessController');
    const access = await audienceAccessOf(req.user, 'wallet');
    const ownerTypes = WALLET_OWNER_TYPES.filter((t) => access.audiences.includes(WALLET_OWNER_AUDIENCE[t]));

    const wallets = await prisma.wallet.findMany({
      where: { ownerType: { in: [...ownerTypes] } },
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
        const userData = await prisma.user.findUnique({ where: { id: String(w.owner) }, select: { name: true, email: true, role: true, roles: true, activeRole: true } });
        if (!access.all && userData && !walletOwnerInAudience(w.ownerType, currentRolesOf(userData))) return null;
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

    res.json(formattedWallets.filter((w) => w !== null));
  } catch (err) {
    console.error('Erro ao listar carteiras:', err);
    res.status(500).json({ error: 'Failed to fetch wallets' });
  }
});

// GET /admin/wallets/:id/transactions - Listar transações de uma carteira
router.get('/wallets/:id/transactions', authenticate, anyWalletView, async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const wallet = await prisma.wallet.findUnique({ where: { id: String(id) } });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Por público: carteira de outro tipo, ou pessoal de alguém da equipe, fica fora.
    const access = await audienceAccessOf(req.user, 'wallet');
    if (!access.all) {
      if (!access.audiences.includes(WALLET_OWNER_AUDIENCE[wallet.ownerType])) return res.status(403).json(WALLET_AUDIENCE_FORBIDDEN);
      if (wallet.ownerType !== 'store') {
        const owner = await prisma.user.findUnique({ where: { id: String(wallet.owner) }, select: TARGET_ROLES_SELECT });
        if (owner && !walletOwnerInAudience(wallet.ownerType, currentRolesOf(owner))) return res.status(403).json(WALLET_AUDIENCE_FORBIDDEN);
      }
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

// Ajustar saldo (D3b-3, spec 5): crédito ou débito auditado, exclusivo do CEO (wallet:credit
// não é delegável), com motivo, teto e chave de idempotência. Saldo + lançamento
// ('Ajuste da plataforma: <motivo>', categoria adjustment) + linha wallet_adjust numa transação.
// Substitui POST /wallets/:id/add-balance e PUT /wallets/:id/balance (removidas).
const ADMIN_WALLET_MAX = 50_000;
const hasTwoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const AdjustWalletSchema = z.object({
  direction: z.enum(['credit', 'debit'], { errorMap: () => ({ message: 'Escolha crédito ou débito' }) }),
  amount: z.number({ invalid_type_error: 'Valor inválido' })
    .positive('Valor deve ser positivo')
    .max(ADMIN_WALLET_MAX, `Máximo R$ ${ADMIN_WALLET_MAX}`)
    .refine(hasTwoDecimals, 'Use no máximo duas casas decimais'),
  reason: z.string().trim().min(10, 'Informe o motivo (mínimo 10 caracteres)').max(500, 'Motivo muito longo (máximo 500 caracteres)'),
  idempotencyKey: z.string().uuid('Chave de idempotência inválida'),
}).strict();

// POST /admin/wallets/:id/adjust - Ajustar saldo (crédito ou débito)
router.post('/wallets/:id/adjust', authenticate, authorizePermission('wallet:credit'), async (req: any, res: Response) => {
  const parsed = AdjustWalletSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' });
  }
  try {
    const result = await adjustWalletBalance(String(req.params.id), actorFromRequest(req), parsed.data as WalletAdjustInput);
    if (!result) return res.status(404).json({ error: 'Carteira não encontrada' });
    logger.info('[wallet][AUDIT] ajuste de saldo', {
      adminId: req.user.id,
      walletId: result.adjustment.walletId,
      actionId: result.adjustment.actionId,
      direction: result.adjustment.direction,
      amount: result.adjustment.amount,
      replayed: result.replayed,
    });
    return res.json({
      message: result.replayed ? 'Ajuste já registrado' : 'Saldo ajustado',
      replayed: result.replayed,
      adjustment: result.adjustment,
    });
  } catch (err) {
    if (sendMoneyActionError(res, err)) return;
    logger.error('[wallet] falha ao ajustar saldo', err as Error, { walletId: req.params.id });
    return res.status(500).json({ error: 'Erro ao ajustar o saldo' });
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
// D3b-3: é uma pessoa movendo dinheiro → cada repasse passa por releasePayoutAsAdmin
// (reivindica antes do Asaas e grava a linha payout_release com o autor). Um repasse que
// não sai (recusa, incerto, outro caminho pegou) não impede os demais; o estado final de
// cada um volta na resposta.
router.post('/asaas/release-order/:orderId', authenticate, authorizePermission('gateway:manage'), async (req: any, res: Response) => {
  const orderId = String(req.params.orderId);
  try {
    const actor = actorFromRequest(req);
    const { releasePayoutAsAdmin } = await import('../services/payoutRelease.service');
    const pending = await prisma.payout.findMany({
      where: { orderId, status: 'pending', blocked: false },
      select: { id: true },
    });
    for (const { id } of pending) {
      try {
        await releasePayoutAsAdmin(id, actor, true);
      } catch (err: any) {
        if (err instanceof MoneyActionError) {
          logger.warn('[re-liberar pedido] repasse não liberado', { orderId, payoutId: id, code: err.code });
        } else {
          logger.error('[re-liberar pedido] falha inesperada ao liberar repasse', err as Error, { orderId, payoutId: id });
        }
      }
    }
    const payouts = await prisma.payout.findMany({
      where: { orderId },
      select: { recipientType: true, amount: true, status: true, gatewayTransferId: true },
    });
    return res.json({ orderId, payouts: payouts.map((p) => ({ ...p, amount: Number(p.amount) })) });
  } catch (err: any) {
    logger.error('[re-liberar pedido] erro', err as Error, { orderId });
    return res.status(500).json({ error: 'Erro ao re-liberar o pedido' });
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
    // Mensalidade SaaS (CEO-only): valor padrão em R$ (2 casas), dias de teste e de tolerância.
    saasMonthlyFee: z.number().min(0).max(100000).refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'no máximo 2 casas'),
    saasTrialDays: z.number().int().min(0).max(365),
    saasGraceDays: z.number().int().min(0).max(60),
    directTransfersEnabled: z.boolean(),
    // Entrega (CEO-only): raio padrão (km), preparo padrão (min), velocidade média e fator de desvio da rota.
    defaultDeliveryRadiusKm: z.number().min(1).max(50),
    defaultPrepMinutes: z.number().int().min(0).max(180),
    courierAvgSpeedKmh: z.number().min(5).max(80),
    routeDetourFactor: z.number().min(1).max(3),
    confirmSettlement: z.string().max(60),
    changeReason: z.unknown(),
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
  out.saasMonthlyFee = Number(cfg?.saasMonthlyFee ?? 0);
  out.saasTrialDays = Number(cfg?.saasTrialDays ?? 14);
  out.saasGraceDays = Number(cfg?.saasGraceDays ?? 5);
  out.directTransfersEnabled = !!cfg?.directTransfersEnabled;
  out.defaultDeliveryRadiusKm = Number(cfg?.defaultDeliveryRadiusKm ?? 12);
  out.defaultPrepMinutes = Number(cfg?.defaultPrepMinutes ?? 15);
  out.courierAvgSpeedKmh = Number(cfg?.courierAvgSpeedKmh ?? 25);
  out.routeDetourFactor = Number(cfg?.routeDetourFactor ?? 1.3);
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

// I5: no modo direto o menu do admin mantém Payouts/Saques enquanto houver repasse de
// custódia ou saque em aberto (mesma contagem do preview da troca de modo).
router.get('/custody-open', authenticate, authorizePermission('payout:view'), async (_req: any, res: Response) => {
  try {
    const { countOpenCustody } = await import('../services/settlementSwitch');
    const { openPayouts, openWithdrawals } = await countOpenCustody();
    return res.json({ success: true, data: { open: openPayouts + openWithdrawals > 0, openPayouts, openWithdrawals } });
  } catch (err) {
    logger.error('custody-open: falha ao contar repasses/saques em aberto', err as Error);
    return res.status(500).json({ success: false, error: { message: 'Erro ao consultar repasses em aberto', statusCode: 500 } });
  }
});

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
    const { confirmSettlement, changeReason: rawReason, ...patch } = parsed.data as Record<string, any>;
    if (rawReason !== undefined && rawReason !== null && typeof rawReason !== 'string') {
      return res.status(400).json({ error: 'Motivo inválido', code: 'INVALID_FIELD', field: 'changeReason' });
    }
    const trimmedReason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (trimmedReason.length > 500) {
      return res.status(400).json({ error: 'O motivo pode ter até 500 caracteres', code: 'INVALID_FIELD', field: 'changeReason' });
    }
    const changeReason = trimmedReason || null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nenhum freio válido informado' });
    // Decisão do usuário (22/10): no modo direto o motoboy fica com 100% do frete.
    if ('motoboyShareDirect' in patch && Number(patch.motoboyShareDirect) !== 100) {
      return res.status(400).json({ error: 'No modo direto o motoboy fica com 100% do frete.', code: 'MOTOBOY_SHARE_DIRECT_LOCKED' });
    }
    // Modo de liquidação e cartão direto decidem para onde vai o dinheiro dos pedidos:
    // só o CEO (activeRole), mesmo que outro papel tenha settings:manage delegado.
    const CEO_ONLY_SWITCHES = ['settlementMode', 'directCardEnabled', 'saasMonthlyFee', 'saasTrialDays', 'saasGraceDays', 'directTransfersEnabled', 'defaultDeliveryRadiusKm', 'defaultPrepMinutes', 'courierAvgSpeedKmh', 'routeDetourFactor'];
    if (CEO_ONLY_SWITCHES.some((k) => k in patch) && !isCeo(req)) {
      return res.status(403).json({ error: 'Só o CEO altera estas configurações.', code: 'CEO_ONLY' });
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
    const { updatePlatformConfig, ensurePlatformConfig } = await import('../repositories/platformConfig.repository');
    const { diffRules } = await import('../services/rules/ruleChanges');
    const ruleChanges = await import('../services/rules/ruleChanges');
    const actor = actorFromRequest(req);
    const cfg = await prisma.$transaction(async (tx) => {
      const current = await ensurePlatformConfig(req.user?.id || 'system', tx);
      await tx.$queryRaw`SELECT id FROM "PlatformConfig" WHERE id = ${current.id} FOR UPDATE`;
      const locked = await tx.platformConfig.findUniqueOrThrow({ where: { id: current.id } });
      const changes = diffRules(locked as unknown as Record<string, unknown>, patch);
      const saved = await updatePlatformConfig(patch, req.user?.id || 'system', tx);
      await ruleChanges.recordRuleChanges(tx, { actor, source: 'switches', reason: changeReason ?? null, changes });
      return saved;
    }, { maxWait: 15_000, timeout: 20_000 });
    const billingKeys = ['saasMonthlyFee', 'saasTrialDays', 'saasGraceDays', 'directTransfersEnabled'];
    if (billingKeys.some((k) => k in patch)) {
      const billingPatch = Object.fromEntries(Object.entries(patch).filter(([k]) => billingKeys.includes(k)));
      logger.info('[saas-billing][AUDIT] config alterada', { by: req.user?.id, patch: billingPatch });
    }
    if (settlementChange) {
      logger.warn('[settlement][AUDIT] modo de liquidação trocado', { by: req.user?.id, ...settlementChange });
      // O KYC da loja depende do modo: recalcula todas (a troca já foi gravada, falha não a desfaz).
      try {
        const { recomputeAllStores } = await import('../utils/storeVerification');
        await recomputeAllStores();
      } catch (err) {
        logger.error('Falha ao recalcular lojas após troca de modo', err as Error);
      }
      // Mensalidade SaaS: na custódia ela não existe → apaga as assinaturas no Asaas (falha vira
      // aviso para o CEO; o job tenta de novo). De volta ao direto → reabre a contagem do teste.
      let saasBillingWarnings: Array<{ storeId: string; error: string }> | undefined;
      try {
        const { cancelSaasSubscriptions, reopenSaasTrials } = await import('../services/saasBilling/modeSwitch');
        if (settlementChange.to === 'custodia') saasBillingWarnings = await cancelSaasSubscriptions();
        else await reopenSaasTrials(new Date(), Number(cfg?.saasTrialDays ?? 14));
      } catch (err) {
        logger.error('[saas-billing] falha ao ajustar a mensalidade após troca de modo', err as Error);
        if (settlementChange.to === 'custodia') saasBillingWarnings = [{ storeId: '*', error: (err as Error)?.message || 'Erro desconhecido' }];
      }
      if (saasBillingWarnings) return res.json({ ...switchesView(cfg), saasBillingWarnings });
    }
    return res.json(switchesView(cfg));
  } catch (err: any) {
    return res.status(500).json({ error: 'Erro ao salvar os freios' });
  }
});

// Moderação: apaga a resposta da loja a uma avaliação (a tela do admin entra na D3).
router.delete('/ratings/:orderId/reply', authenticate, authorizePermission('reviews:moderate'), catchAsync(deleteStoreRatingReply));

export default router;
