import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { AuthenticatedRequest } from '../types';

/**
 * Configuração de rate limiting geral
 * 100 requisições por 15 minutos por IP
 */
export const generalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo de requisições
  message: 'Muitas requisições deste IP, tente novamente mais tarde',
  standardHeaders: true, // Retorna info em `RateLimit-*` headers
  legacyHeaders: false, // Desabilita `X-RateLimit-*` headers
  skip: (req) => {
    // Não aplicar rate limit em health check
    return req.path === '/api/health';
  },
});

/**
 * Rate limiter para login (mais restritivo)
 * 5 tentativas por 15 minutos
 */
export const loginLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 tentativas
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Não contar requisições bem-sucedidas
});

/**
 * Rate limiter para registro (moderado)
 * 10 registros por dia por IP
 */
export const registerLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 horas
  max: 10,
  message: 'Muitos registros deste IP. Tente novamente amanhã.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter para criação de pedidos
 * 50 pedidos por hora
 */
export const createOrderLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50,
  message: 'Muitos pedidos. Tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthenticatedRequest) => {
    // Usar ID do usuário se autenticado, senão usar IP
    return (req.user?.id as string) || req.ip || 'unknown';
  },
});

/**
 * Rate limiter para upload de arquivos
 * 20 uploads por hora
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  message: 'Muitos uploads. Tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter para API pública (mais permissivo)
 * 1000 requisições por hora
 */
export const publicApiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 1000,
  message: 'Limite de API atingido. Tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Exportar todos os limiters
export default {
  general: generalLimiter,
  login: loginLimiter,
  register: registerLimiter,
  createOrder: createOrderLimiter,
  upload: uploadLimiter,
  publicApi: publicApiLimiter,
};
