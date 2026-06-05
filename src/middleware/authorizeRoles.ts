import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

/**
 * ✅ SEGURANÇA: Middleware para validar activeRole
 * Garante consistência na validação de roles em toda aplicação
 * Usa activeRole se disponível, fallback para role
 */
export const authorizeByActiveRole = (...allowed: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Prioridade: activeRole > role
    const userRole = (req.user as any).activeRole || req.user.role;

    if (!userRole) {
      return res.status(403).json({ error: 'User has no role assigned' });
    }

    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden - insufficient role' });
    }

    return next();
  };
};

/**
 * ✅ SEGURANÇA: Valida que usuário tem múltiplos roles (se array)
 */
export const authorizeByRoles = (...allowed: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRoles = (req.user as any).roles || [(req.user as any).activeRole || req.user.role];

    if (!userRoles || userRoles.length === 0) {
      return res.status(403).json({ error: 'User has no roles assigned' });
    }

    const hasRequiredRole = userRoles.some((role: string) => allowed.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Forbidden - insufficient role' });
    }

    return next();
  };
};

/**
 * ✅ SEGURANÇA: Valida que activeRole é 'cliente' (para compras)
 */
export const requireCustomerRole = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const activeRole = (req.user as any).activeRole || req.user.role;

  if (activeRole !== 'cliente') {
    return res.status(403).json({ error: 'Forbidden - insufficient role' });
  }

  return next();
};

/**
 * ✅ SEGURANÇA: Validar que usuário é lojista (seller)
 */
export const requireSellerRole = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const activeRole = (req.user as any).activeRole || req.user.role;

  if (activeRole !== 'lojista' && activeRole !== 'seller') {
    return res.status(403).json({ error: 'Forbidden - insufficient role' });
  }

  return next();
};

/**
 * ✅ SEGURANÇA: Validar que usuário é motoboy (delivery person)
 */
export const requireMotoboyRole = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const activeRole = (req.user as any).activeRole || req.user.role;

  if (activeRole !== 'motoboy') {
    return res.status(403).json({ error: 'Forbidden - insufficient role' });
  }

  return next();
};

/**
 * ✅ SEGURANÇA: Validar que usuário é admin (CEO ou gerente)
 */
export const requireAdminRole = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userRole = (req.user as any).activeRole || req.user.role;
  const adminRoles = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

  if (!adminRoles.includes(userRole)) {
    return res.status(403).json({ error: 'Forbidden - insufficient role' });
  }

  return next();
};
