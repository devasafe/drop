import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
import { verifiedUserIdFromRequest } from './auth';

/** IP do cliente ("trust proxy" está em app.ts), sem o prefixo IPv4-mapeado do IPv6. */
const clientIp = (req: any): string => {
  let ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (ip?.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
};

/**
 * Chave do limite geral: o usuário quando o JWT (header ou cookie httpOnly) tem assinatura válida,
 * senão o IP. Por usuário, várias abas/aparelhos da mesma loja na mesma rede deixam de dividir o
 * balde de quem está ao lado, e o usuário não escapa do limite trocando de IP. Id de token não
 * verificado nunca vira chave (cairia num balde novo a cada id forjado).
 */
export const apiLimiterKey = (req: Request): string => {
  const userId = verifiedUserIdFromRequest(req);
  return userId ? `user:${userId}` : `ip:${clientIp(req)}`;
};

/**
 * Limite geral da API: 100 pedidos/min por chave (usuário ou IP). Login/registro têm os
 * limitadores próprios em routes/auth.ts; criação de pedido em routes/orders.ts.
 */
export const createApiLimiter = (opts: { max?: number; skip?: (req: Request) => boolean } = {}): RateLimitRequestHandler =>
  rateLimit({
    windowMs: 60 * 1000,
    max: opts.max ?? 100,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: apiLimiterKey,
    skip: opts.skip,
  });
