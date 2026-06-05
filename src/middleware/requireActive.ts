import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import User from '../models/User';

/**
 * Middleware que verifica se o usuario autenticado NAO esta bloqueado.
 *
 * Por que existe: o JWT e stateless — depois de um bloqueio administrativo,
 * o token continua valido ate expirar (ate 7 dias). Rotas que movimentam
 * dinheiro, criam pedidos, aceitam entregas, etc. devem fazer esse check extra
 * para impedir que um usuario bloqueado continue operando com o token antigo.
 *
 * Custo: +1 query indexada por _id (ms) por request. Use apenas em endpoints
 * sensiveis (financeiro, criacao de pedido, aceite de delivery, etc), NAO em
 * listagens e navegacao comum.
 */
export const requireActiveUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await User.findById(userId).select('status blockReason').lean();
    if (!user) return res.status(401).json({ error: 'User not found' });

    if ((user as any).status === 'blocked') {
      return res.status(403).json({
        error: 'ACCOUNT_BLOCKED',
        message: 'Sua conta esta bloqueada. Entre em contato com o suporte.',
        reason: (user as any).blockReason || undefined,
      });
    }

    return next();
  } catch (err) {
    console.error('[requireActiveUser] erro:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

export default requireActiveUser;
