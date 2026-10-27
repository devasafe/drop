import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';
import env from '../config/env';
import { extractTokenFromCookie } from '../utils/cookieManager';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';

/** D3b-2a: no máximo uma gravação de `User.lastSeenAt` a cada 5 min por usuário. */
export const LAST_SEEN_EVERY_MS = 5 * 60_000;

/**
 * Grava o último acesso sem segurar a resposta (sem await). Pula quando o valor que o
 * `authenticate` acabou de ler é recente, então a maioria das requisições não escreve nada. O
 * WHERE repete a condição: duas requisições juntas, ou um valor lido velho, não regravam. Erro só
 * vai para o log.
 */
export function touchLastSeen(userId: string, lastSeenAt: Date | null, now: Date = new Date()): void {
  if (lastSeenAt && now.getTime() - lastSeenAt.getTime() < LAST_SEEN_EVERY_MS) return;
  const cutoff = new Date(now.getTime() - LAST_SEEN_EVERY_MS);
  prisma.user
    .updateMany({
      where: { id: userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
      data: { lastSeenAt: now },
    })
    .catch((err: unknown) => logger.error('[authenticate] falha ao gravar o último acesso', err as Error, { userId }));
}

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

/** Token da requisição: header Authorization (Bearer) ou, na falta dele, o cookie httpOnly. */
export const readRequestToken = (req: { headers: any; cookies?: any }): string | undefined => {
  let token: string | undefined;
  const authHeader = req.headers?.authorization;
  if (authHeader) {
    const parts = String(authHeader).split(' ');
    if (parts.length === 2) token = parts[1];
  }
  if (!token) token = extractTokenFromCookie(req) || undefined;
  return token;
};

/** Verifica a ASSINATURA do JWT com o segredo do servidor. Lança se inválido/expirado. */
export const verifyAuthToken = (token: string): JwtPayload => jwt.verify(token, JWT_SECRET as string) as JwtPayload;

/**
 * Id do usuário do token da requisição, só se a assinatura confere (sem consultar o banco).
 * Serve para chavear o rate limit por usuário; NÃO autoriza nada — rota protegida usa `authenticate`.
 */
export const verifiedUserIdFromRequest = (req: { headers: any; cookies?: any }): string | null => {
  if (!JWT_SECRET) return null;
  const token = readRequestToken(req);
  if (!token) return null;
  try {
    const id = verifyAuthToken(token)?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
};

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
  const token = readRequestToken(req);
  if (!token) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - No token (header/cookie)`);
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded: JwtPayload;
  try {
    decoded = verifyAuthToken(token);
  } catch (err) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - Invalid token`);
    return res.status(401).json({ error: 'Invalid token' });
  }

  // O JWT vale dias e é stateless: confere no banco se a conta existe, não está
  // bloqueada e ainda tem o papel do token (admin rebaixado perde o acesso na hora).
  let dbRoles: string[] = [];
  try {
    const account = await prisma.user.findUnique({
      where: { id: String(decoded.id) },
      select: { status: true, role: true, roles: true, blockReason: true, lastSeenAt: true },
    });
    if (!account || account.status === 'deleted') return res.status(401).json({ error: 'Invalid token' });
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
    dbRoles = (account.roles || []).map(String);
    // D3b-2a: só depois das checagens (conta recusada não conta como acesso).
    touchLastSeen(String(decoded.id), account.lastSeenAt);
  } catch (err) {
    console.error('[authenticate] falha ao conferir a conta:', err);
    return res.status(503).json({ error: 'Servico indisponivel' });
  }

  // `roles` vem do BANCO, não do token: os papéis de equipe somam permissões e
  // remover um deles precisa valer já na próxima requisição.
  req.user = { ...decoded, roles: dbRoles };
  if (isDev) logger.debug(`✅ [AUTH OK] ${req.path} - User: ${decoded.id}`);
  return next();
};

/**
 * Autenticação OPCIONAL para rotas públicas: se houver token válido, preenche `req.user`;
 * sem token ou com token inválido, segue anônimo (nunca responde 401). Serve só para a rota
 * decidir o que mostrar ao dono — não substitui `authenticate` em rota protegida.
 */
export const optionalAuth = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  try {
    const token = readRequestToken(req);
    if (token && JWT_SECRET) {
      // Sem `roles`: os papéis de equipe somam permissões e só valem lidos do BANCO (como no
      // `authenticate`); os do token podem estar velhos (papel removido depois do login).
      const { roles: _tokenRoles, ...decoded } = verifyAuthToken(token);
      req.user = decoded as any;
    }
  } catch {
    // token inválido/expirado → anônimo
  }
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
