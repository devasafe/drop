import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';
import env from '../config/env';

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

export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (isDev) {
    console.log(`🔐 [AUTH] ${req.method} ${req.path}`);
    console.log(`🔐 [AUTH] Headers:`, {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'NOT PROVIDED',
      contentType: req.headers['content-type']
    });
  }

  if (!JWT_SECRET) {
    console.error('JWT_SECRET não configurado nas variáveis de ambiente');
    return res.status(500).json({ error: 'Erro de configuração do servidor' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - No Authorization header`);
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - Invalid token format: ${parts.length} parts`);
    return res.status(401).json({ error: 'Token error' });
  }

  const [, token] = parts;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    if (isDev) console.log(`✅ [AUTH OK] ${req.path} - User: ${decoded.id}`);
    return next();
  } catch (err) {
    if (isDev) console.error(`🔐 [AUTH FAIL] ${req.path} - Invalid token`);
    return res.status(401).json({ error: 'Invalid token' });
  }
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
