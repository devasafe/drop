import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import RolePermissions, { AppRole } from '../models/RolePermissions';
import { rolePermissions } from '../utils/walletCalculations';
import logger from '../config/logger';

export const ALL_ROLES: AppRole[] = [
  'ceo', 'marketing', 'gerente_geral', 'gerente_clientes',
  'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'
];

// Todas as permissões existentes no sistema (para exibir no painel)
export const ALL_PERMISSIONS: { key: string; label: string; category: string }[] = [
  // Notificações
  { key: 'notification:create',         label: 'Criar notificação',           category: 'Notificações' },
  { key: 'notification:approve',        label: 'Aprovar notificação',         category: 'Notificações' },
  { key: 'notification:reject',         label: 'Rejeitar notificação',        category: 'Notificações' },
  { key: 'broadcast:send',              label: 'Enviar broadcast',            category: 'Notificações' },
  // Usuários
  { key: 'user:view_all',               label: 'Ver todos os usuários',       category: 'Usuários' },
  { key: 'user:view_clients',           label: 'Ver clientes',                category: 'Usuários' },
  { key: 'user:edit_clients',           label: 'Editar clientes',             category: 'Usuários' },
  { key: 'user:view_motoboys',          label: 'Ver motoboys',                category: 'Usuários' },
  { key: 'user:edit_motoboys',          label: 'Editar motoboys',             category: 'Usuários' },
  // Lojas
  { key: 'store:view_all',              label: 'Ver todas as lojas',          category: 'Lojas' },
  { key: 'store:edit',                  label: 'Editar lojas',                category: 'Lojas' },
  { key: 'store:view_own',              label: 'Ver própria loja',            category: 'Lojas' },
  { key: 'store:edit_own',              label: 'Editar própria loja',         category: 'Lojas' },
  // Produtos
  { key: 'product:create_own',          label: 'Criar produto',               category: 'Produtos' },
  { key: 'product:edit_own',            label: 'Editar produto',              category: 'Produtos' },
  { key: 'product:delete_own',          label: 'Excluir produto',             category: 'Produtos' },
  // Pedidos
  { key: 'order:create',                label: 'Criar pedido',                category: 'Pedidos' },
  { key: 'order:view_own',              label: 'Ver próprios pedidos',        category: 'Pedidos' },
  { key: 'order:cancel_own',            label: 'Cancelar próprio pedido',     category: 'Pedidos' },
  // Carteira
  { key: 'wallet:view_all',             label: 'Ver todas as carteiras',      category: 'Carteira' },
  { key: 'wallet:view_clients',         label: 'Ver carteiras de clientes',   category: 'Carteira' },
  { key: 'wallet:view_stores',          label: 'Ver carteiras de lojas',      category: 'Carteira' },
  { key: 'wallet:view_motoboys',        label: 'Ver carteiras de motoboys',   category: 'Carteira' },
  { key: 'wallet:view_own',             label: 'Ver própria carteira',        category: 'Carteira' },
  { key: 'wallet:credit',               label: 'Creditar carteira',           category: 'Carteira' },
  { key: 'wallet:transfer',             label: 'Transferir da carteira',      category: 'Carteira' },
  { key: 'wallet:request_access',       label: 'Solicitar acesso a carteiras de clientes', category: 'Carteira' },
  // Dashboard
  { key: 'dashboard:view_all',          label: 'Ver dashboard completo',      category: 'Dashboard' },
  { key: 'dashboard:view_client_metrics',  label: 'Ver métricas de clientes', category: 'Dashboard' },
  { key: 'dashboard:view_store_metrics',   label: 'Ver métricas de lojas',    category: 'Dashboard' },
  { key: 'dashboard:view_motoboy_metrics', label: 'Ver métricas de motoboys', category: 'Dashboard' },
  // Entregas
  { key: 'delivery:view_own',           label: 'Ver próprias entregas',       category: 'Entregas' },
  { key: 'delivery:accept',             label: 'Aceitar entrega',             category: 'Entregas' },
  { key: 'delivery:complete',           label: 'Completar entrega',           category: 'Entregas' },
  // Gamificação
  { key: 'gamification:redeem_benefit', label: 'Resgatar benefício',          category: 'Gamificação' },
  // Marketing
  { key: 'banner:manage',               label: 'Gerenciar banners',           category: 'Marketing' },
  { key: 'theme:edit',                  label: 'Editar temas sazonais',       category: 'Marketing' },
  // Suporte
  { key: 'support:attend',              label: 'Atender tickets de suporte',  category: 'Suporte' },
  // Cupons
  { key: 'coupon:create_global',        label: 'Criar cupons globais',        category: 'Cupons' },
  // Conversas
  { key: 'conversations:view_all',      label: 'Ver todas as conversas',      category: 'Conversas' },
  // Endereço
  { key: 'address:manage_own',          label: 'Gerenciar endereços',         category: 'Endereços' },
];

// Retorna permissões de um role: primeiro tenta no DB, depois usa padrão estático
export async function getEffectivePermissions(role: string): Promise<{ permissions: string[]; notificationTargets: string[] }> {
  if (role === 'ceo') {
    return { permissions: ['*'], notificationTargets: ALL_ROLES };
  }
  const custom = await RolePermissions.findOne({ role }).lean();
  if (custom) {
    return { permissions: custom.permissions, notificationTargets: custom.notificationTargets };
  }
  return { permissions: rolePermissions[role] || [], notificationTargets: [] };
}

// GET /role-permissions — lista todos os roles com suas permissões atuais
export const listAllRoles = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customs = await RolePermissions.find().lean();
    const customMap: Record<string, any> = {};
    for (const c of customs) customMap[c.role] = c;

    const result = ALL_ROLES.map(role => {
      if (role === 'ceo') {
        return { role, permissions: ['*'], notificationTargets: ALL_ROLES, isCustom: false };
      }
      const custom = customMap[role];
      if (custom) {
        return { role, permissions: custom.permissions, notificationTargets: custom.notificationTargets, isCustom: true };
      }
      return { role, permissions: rolePermissions[role] || [], notificationTargets: [], isCustom: false };
    });

    return res.json({ roles: result, allPermissions: ALL_PERMISSIONS, allRoles: ALL_ROLES });
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
    return res.json({ role, ...effective, allPermissions: ALL_PERMISSIONS, allRoles: ALL_ROLES });
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

    if (role === 'ceo') {
      return res.status(400).json({ error: 'Não é possível modificar permissões do CEO' });
    }

    if (!ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role inválida' });
    }

    const { permissions, notificationTargets } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions deve ser um array' });
    }

    await RolePermissions.findOneAndUpdate(
      { role },
      { role, permissions, notificationTargets: notificationTargets || [], updatedBy: userId },
      { upsert: true, new: true }
    );

    return res.json({ success: true, role, permissions, notificationTargets: notificationTargets || [] });
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
    await RolePermissions.deleteOne({ role });
    return res.json({ success: true, message: 'Permissões restauradas ao padrão' });
  } catch (err) {
    logger.error('Erro ao resetar permissões', err as Error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
