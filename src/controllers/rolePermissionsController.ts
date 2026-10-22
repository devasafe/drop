import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../lib/prisma';

// Papéis da aplicação (antes vinha do model Mongoose RolePermissions).
export type AppRole = 'ceo' | 'marketing' | 'gerente_geral' | 'gerente_clientes' | 'gerente_lojistas' | 'gerente_motoboys' | 'lojista' | 'cliente' | 'motoboy';
import { rolePermissions } from '../utils/walletCalculations';
import logger from '../config/logger';
import { ALL_PERMISSIONS, PANEL_PERMISSIONS, RETIRED_PERMISSIONS, ROLE_DESCRIPTIONS } from '../services/permissions/catalog';

export const ALL_ROLES: AppRole[] = [
  'ceo', 'marketing', 'gerente_geral', 'gerente_clientes',
  'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'
];

// Catálogo das permissões (tipo, área e o que cada caixinha libera): src/services/permissions/catalog.ts.
export { ALL_PERMISSIONS };

// Permissões que movem dinheiro sem lastro: exclusivas do CEO (via '*'), nunca
// delegáveis. Mesmo que apareçam numa linha antiga de RolePermissions, são
// descartadas em runtime (defesa em profundidade além da migration).
export const CEO_ONLY_PERMISSIONS = ['wallet:credit'];
// Caixinha que saiu da lista continua válida no PUT: a linha do banco pode trazê-la de volta.
const PERMISSION_KEYS = new Set([...ALL_PERMISSIONS.map((p) => p.key), ...RETIRED_PERMISSIONS]);

// Rodada final: as aposentadas também não valem (não aparecem na tela, então não podem valer escondidas).
const stripCeoOnly = (perms: string[]) =>
  perms.filter((p) => !CEO_ONLY_PERMISSIONS.includes(p) && !RETIRED_PERMISSIONS.includes(p));

/**
 * Parte 2 (22/10): cliente, lojista e motoboy não aparecem em Permissões e usam SEMPRE o padrão estático.
 * Uma linha antiga no banco para eles não dá nem tira acesso; é avisada no log uma vez por processo.
 */
export const FIXED_ROLES: AppRole[] = ['cliente', 'lojista', 'motoboy'];
const fixedRowsChecked = new Set<string>();

async function warnFixedRowOnce(role: string): Promise<void> {
  if (fixedRowsChecked.has(role)) return;
  fixedRowsChecked.add(role);
  try {
    const row = await prisma.rolePermissions.findUnique({ where: { role: role as any }, select: { role: true } });
    if (row) logger.warn(`[permissões] linha antiga de RolePermissions para "${role}" ignorada: esse papel usa o padrão estático`);
  } catch (err) {
    logger.error('[permissões] falha ao conferir linha antiga de papel fixo', err as Error);
  }
}

// Retorna permissões de um role: equipe tenta no DB e cai no padrão estático; cliente, lojista e motoboy, só o padrão.
export async function getEffectivePermissions(role: string): Promise<{ permissions: string[]; notificationTargets: string[] }> {
  if (role === 'ceo') {
    return { permissions: ['*'], notificationTargets: ALL_ROLES };
  }
  if (FIXED_ROLES.includes(role as AppRole)) {
    await warnFixedRowOnce(role);
    return { permissions: stripCeoOnly(rolePermissions[role] || []), notificationTargets: [] };
  }
  const custom = await prisma.rolePermissions.findUnique({ where: { role: role as any } });
  if (custom) {
    return { permissions: stripCeoOnly(custom.permissions), notificationTargets: custom.notificationTargets };
  }
  return { permissions: stripCeoOnly(rolePermissions[role] || []), notificationTargets: [] };
}

// Papéis de equipe: não são uma área para a qual se troca — são um ACRÉSCIMO à conta.
// A pessoa continua no papel ativo dela (em geral cliente) e ganha as permissões desses papéis.
export const TEAM_ROLES: AppRole[] = ['marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

export const isTeamRole = (role: unknown): boolean => TEAM_ROLES.includes(String(role) as AppRole);

type AccountUser = { activeRole?: string; role?: string; roles?: string[] } | undefined | null;

/** Papel ativo do usuário autenticado (activeRole > role > cliente). */
export const activeRoleOf = (user: AccountUser): string => user?.activeRole || user?.role || 'cliente';

/**
 * Papéis de equipe da conta. `req.user.roles` vem do BANCO (middleware authenticate),
 * não do token: remover o papel derruba o acesso na requisição seguinte.
 */
export const teamRolesOf = (user: AccountUser): AppRole[] => {
  const roles = Array.isArray(user?.roles) ? user!.roles.map(String) : [];
  return TEAM_ROLES.filter((r) => roles.includes(r));
};

/** Papel ativo + papéis de equipe, sem repetição — o que conta para decisões de equipe por nome de papel. */
export const staffRolesOf = (user: AccountUser): string[] =>
  Array.from(new Set([activeRoleOf(user), ...teamRolesOf(user)]));

/**
 * Permissões da conta: CEO ativo → ['*']; senão a UNIÃO das permissões do papel ativo com as
 * de cada papel de equipe da conta. `getEffectivePermissions` já descarta as exclusivas do CEO
 * por papel, então `wallet:credit` nunca entra pela união.
 */
export async function getAccountPermissions(user: AccountUser): Promise<string[]> {
  const active = activeRoleOf(user);
  if (active === 'ceo') return ['*'];
  const roles = staffRolesOf(user);
  const all = await Promise.all(roles.map((r) => getEffectivePermissions(r)));
  return Array.from(new Set(all.flatMap((e) => e.permissions)));
}

/** Grupos para os quais a conta pode enviar aviso: união dos `notificationTargets` dos mesmos papéis. */
export async function getAccountNotificationTargets(user: AccountUser): Promise<string[]> {
  const active = activeRoleOf(user);
  if (active === 'ceo') return [...ALL_ROLES];
  const all = await Promise.all(staffRolesOf(user).map((r) => getEffectivePermissions(r)));
  return Array.from(new Set(all.flatMap((e) => e.notificationTargets.map(String))));
}

// GET /role-permissions/me — permissões efetivas do usuário logado (para o frontend
// decidir o que mostrar). Qualquer autenticado pode ler as PRÓPRIAS permissões.
export const getMyPermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const role = activeRoleOf(req.user as any);
    const permissions = await getAccountPermissions(req.user as any);
    return res.json({ role, permissions, teamRoles: teamRolesOf(req.user as any) });
  } catch (err) {
    logger.error('Erro ao buscar permissões do usuário', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// GET /role-permissions — lista todos os roles com suas permissões atuais
export const listAllRoles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customs = await prisma.rolePermissions.findMany();
    const customMap: Record<string, any> = {};
    for (const c of customs) customMap[c.role] = c;

    // Parte 2: a tela é só da equipe (o CEO aparece fixo; cliente, lojista e motoboy não são editáveis).
    const result = TEAM_ROLES.map(role => {
      const custom = customMap[role];
      if (custom) {
        return { role, permissions: stripCeoOnly(custom.permissions), notificationTargets: custom.notificationTargets, isCustom: true };
      }
      return { role, permissions: rolePermissions[role] || [], notificationTargets: [], isCustom: false };
    });

    return res.json({
      roles: result,
      allPermissions: PANEL_PERMISSIONS,
      allRoles: TEAM_ROLES,
      // Quem recebe aviso continua sendo qualquer papel (cliente, lojista e motoboy recebem broadcast).
      notificationTargetRoles: ALL_ROLES,
      roleDescriptions: ROLE_DESCRIPTIONS,
    });
  } catch (err) {
    logger.error('Erro ao listar permissões', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// GET /role-permissions/:role
export const getRolePermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { role } = req.params;
    if (!ALL_ROLES.includes(role as any)) {
      return res.status(404).json({ error: 'Role não encontrado' });
    }
    const effective = await getEffectivePermissions(role);
    return res.json({ role, ...effective, allPermissions: PANEL_PERMISSIONS, allRoles: TEAM_ROLES });
  } catch (err) {
    logger.error('Erro ao buscar permissões do role', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// PUT /role-permissions/:role — CEO atualiza permissões
export const updateRolePermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { role } = req.params as { role: AppRole };
    const userId = req.user?.id;

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválida' });
    }
    // Parte 2: só os papéis da equipe são editáveis; CEO tem tudo e os papéis do app usam o padrão.
    if (!TEAM_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Esse papel não tem permissões editáveis.', code: 'ROLE_NOT_EDITABLE' });
    }

    const { permissions, notificationTargets } = req.body;

    if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === 'string')) {
      return res.status(400).json({ error: 'permissions deve ser um array de strings' });
    }
    const invalid = permissions.filter((p: string) => !PERMISSION_KEYS.has(p));
    if (invalid.length) {
      return res.status(400).json({ error: `Permissões inexistentes: ${invalid.join(', ')}` });
    }
    const ceoOnly = permissions.filter((p: string) => CEO_ONLY_PERMISSIONS.includes(p));
    if (ceoOnly.length) {
      return res.status(400).json({ error: `Permissão exclusiva do CEO, não delegável: ${ceoOnly.join(', ')}` });
    }
    if (notificationTargets !== undefined &&
        (!Array.isArray(notificationTargets) || !notificationTargets.every((r: any) => ALL_ROLES.includes(r)))) {
      return res.status(400).json({ error: 'notificationTargets inválido' });
    }

    // Aceita as aposentadas sem erro, mas grava sem elas.
    const toSave = permissions.filter((p: string) => !RETIRED_PERMISSIONS.includes(p));
    await prisma.rolePermissions.upsert({
      where: { role: role as any },
      create: { role: role as any, permissions: toSave, notificationTargets: (notificationTargets || []) as any, updatedBy: String(userId) },
      update: { permissions: toSave, notificationTargets: (notificationTargets || []) as any, updatedBy: String(userId) },
    });

    return res.json({ success: true, role, permissions: toSave, notificationTargets: notificationTargets || [] });
  } catch (err) {
    logger.error('Erro ao atualizar permissões', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// DELETE /role-permissions/:role — restaura padrão (remove do DB)
export const resetRolePermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { role } = req.params;
    if (role === 'ceo') return res.status(400).json({ error: 'Não é possível modificar o CEO' });
    await prisma.rolePermissions.deleteMany({ where: { role: role as any } });
    return res.json({ success: true, message: 'Permissões restauradas ao padrão' });
  } catch (err) {
    logger.error('Erro ao resetar permissões', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
