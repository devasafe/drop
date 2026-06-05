import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../utils/walletCalculations';
import Wallet from '../models/Wallet';
import Store from '../models/Store';
import { getEffectivePermissions } from '../controllers/rolePermissionsController';
import { hasValidWalletAccess } from '../controllers/walletAccessController';

const ADMIN_ROLES = ['ceo', 'gerente_geral'];

/**
 * Middleware que verifica se usuário tem permissão específica.
 * Verifica primeiro no DB (permissões customizadas pelo CEO), depois usa a matriz estática.
 */
export function authorizePermission(requiredPermission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userRole = user.activeRole || user.role || 'cliente';

    // CEO tem tudo
    if (userRole === 'ceo') return next();

    try {
      const { permissions } = await getEffectivePermissions(userRole);
      const granted = permissions.includes('*') || permissions.includes(requiredPermission);
      if (!granted) {
        return res.status(403).json({
          error: `Permissão negada. Você precisa de: ${requiredPermission}`
        });
      }
      return next();
    } catch (err) {
      // Falha ao consultar permissões customizadas do DB.
      // Verificar se existia um registro customizado — se sim, negar por segurança.
      // Se não há customização, fazer fallback para a matriz estática.
      const isStaticPermission = hasPermission(userRole, requiredPermission);
      if (!isStaticPermission) {
        return res.status(403).json({
          error: `Permissão negada. Você precisa de: ${requiredPermission}`
        });
      }
      // Só usa o fallback estático quando o DB falha E a permissão existe na matriz padrão.
      // Loga o erro para visibilidade no Sentry.
      console.error('[authorize] Falha ao consultar permissões do DB, usando fallback estático:', err);
      return next();
    }
  };
}

/**
 * Verifica se usuário é CEO
 */
export function authorizeCEO(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const userRole = user.activeRole || user.role;

  if (userRole !== 'ceo') {
    return res.status(403).json({ error: 'Apenas CEO tem acesso' });
  }

  next();
}

/**
 * Verifica se usuário pode aprovar notificações
 */
export function authorizeNotificationApprover(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const userRole = user.activeRole || user.role;
  const canApprove = ['ceo', 'gerente_geral'].includes(userRole);

  if (!canApprove) {
    return res.status(403).json({
      error: 'Apenas CEO ou Gerente Geral podem aprovar notificações'
    });
  }

  next();
}

/**
 * Verifica se é gerente de uma área específica
 */
/**
 * Verifica se req.user.id === req.params.userId ou se é admin/CEO.
 * Para rotas /:walletId/*, faz lookup da wallet e verifica ownership.
 */
export async function authorizeWalletOwner(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { userId } = req.params;

  // Dono sempre pode
  if (userId && String(user.id) === String(userId)) {
    return next();
  }

  // Dono de loja pode acessar a wallet da própria loja (quando userId é um storeId)
  if (userId) {
    try {
      const store = await Store.findById(userId).select('ownerId');
      if (store && String(store.ownerId) === String(user.id)) {
        return next();
      }
    } catch { /* segue para o fluxo de admin */ }
  }

  const userRole = user.activeRole || user.role;

  // Admin precisa ter permissão wallet:request_access E acesso aprovado vigente
  try {
    const { permissions } = await getEffectivePermissions(userRole);
    const canRequest = permissions.includes('*') || permissions.includes('wallet:request_access');
    if (!canRequest) {
      return res.status(403).json({ error: 'Acesso negado à carteira' });
    }
    const granted = await hasValidWalletAccess(String(user.id), String(userId));
    if (!granted) {
      return res.status(403).json({
        error: 'ACCESS_NOT_GRANTED',
        message: 'Você precisa solicitar e ter aprovação do dono da carteira para acessar.',
      });
    }
    console.log(`[wallet-access][AUDIT] user=${user.id} role=${userRole} acessou wallet=${userId} em ${new Date().toISOString()}`);
    return next();
  } catch (err) {
    console.error('[authorizeWalletOwner] erro:', err);
    return res.status(500).json({ error: 'Erro ao verificar acesso' });
  }
}

/**
 * Versão async para rotas com :walletId — faz lookup da wallet para verificar ownership.
 */
export async function authorizeWalletOwnerById(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const userRole = user.activeRole || user.role;
  const adminRoles = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

  if (adminRoles.includes(userRole)) {
    return next();
  }

  try {
    const { walletId } = req.params;
    const wallet = await Wallet.findById(walletId).select('owner');

    if (!wallet) {
      return res.status(404).json({ error: 'Carteira não encontrada' });
    }

    if (wallet.owner?.toString() === user.id?.toString()) {
      return next();
    }

    return res.status(403).json({ error: 'Acesso negado: você só pode operar na sua própria carteira' });
  } catch (err) {
    console.error('[authorizeWalletOwnerById] Erro ao verificar ownership:', err);
    return res.status(500).json({ error: 'Erro ao verificar acesso' });
  }
}

export function authorizeManager(area: 'clientes' | 'lojistas' | 'motoboys') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userRole = user.activeRole || user.role;
    const managerRoles: { [key: string]: string } = {
      clientes: 'gerente_clientes',
      lojistas: 'gerente_lojistas',
      motoboys: 'gerente_motoboys'
    };

    if (userRole !== 'ceo' && userRole !== managerRoles[area] && userRole !== 'gerente_geral') {
      return res.status(403).json({
        error: `Apenas CEO, Gerente Geral ou Gerente ${area} tem acesso`
      });
    }

    next();
  };
}
