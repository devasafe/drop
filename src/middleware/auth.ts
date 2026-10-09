import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';
import env from '../config/env';
import { extractTokenFromCookie } from '../utils/cookieManager';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';

interface JwtPayload {
  id: string;
  role: string;
  activeRole?: string;
  roles?: string[];
  name?: string;
}

// Fonte única de verdade do segredo (config/env garante obrigatoriedade em produção)
const JWT_SECRET = env.JWT_SECRET;

const isDev = process.env.NODE_ENV === 'development';

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (isDev) {
    logger.debug(`🔐 [AUTH] ${req.method} ${req.path}`);
    logger.debug(`🔐 [AUTH] Headers:`, {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'NOT PROVIDED',
      contentType: req.headers['content-type']
    });
  }

  if (!JWT_SECRET) {
    console.error('JWT_SECRET não configurado nas variáveis de ambiente');
    return res.status(500).json({ error: 'Erro de configuração do servidor' });
  }

  // Token pode vir do header Authorization OU do cookie httpOnly (fallback).
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2) token = parts[1];
  }
  if (!token) {
    token = extractTokenFromCookie(req) || undefined;
  }
  if (!token) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - No token (header/cookie)`);
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - Invalid token`);
    return res.status(401).json({ error: 'Invalid token' });
  }

  // O JWT vale dias e é stateless: confere no banco se a conta existe, não está
  // bloqueada e ainda tem o papel do token (admin rebaixado perde o acesso na hora).
  try {
    const account = await prisma.user.findUnique({
      where: { id: String(decoded.id) },
      select: { status: true, role: true, roles: true, blockReason: true },
    });
    if (!account) return res.status(401).json({ error: 'Invalid token' });
    if (account.status === 'blocked') {
      return res.status(403).json({
        error: 'ACCOUNT_BLOCKED',
        message: 'Sua conta esta bloqueada. Entre em contato com o suporte.',
        reason: account.blockReason || undefined,
      });
    }
    const tokenRole = decoded.activeRole || decoded.role;
    const accountRoles = [account.role, ...(account.roles || [])].map(String);
    if (!tokenRole || !accountRoles.includes(String(tokenRole))) {
      return res.status(401).json({ error: 'SESSION_ROLE_CHANGED', message: 'Seu acesso mudou. Entre novamente.' });
    }
  } catch (err) {
    console.error('[authenticate] falha ao conferir a conta:', err);
    return res.status(503).json({ error: 'Servico indisponivel' });
  }

  req.user = decoded;
  if (isDev) logger.debug(`✅ [AUTH OK] ${req.path} - User: ${decoded.id}`);
  return next();
};

export const authorizeRoles = (...allowed: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const userRole = (req.user as any).activeRole || req.user.role;
    if (!allowed.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden - insufficient role' });
    }
    return next();
  };
};
