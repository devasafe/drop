import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Janela e teto do login/cadastro/senha por IP (os mesmos valores de antes da fase C2). */
export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const AUTH_MAX = 25;

const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Tentativas que sobram nesta janela. `undefined` quando o limiter não contou (ex.: pulado em teste). */
export function attemptsLeftOf(req: Request): number | undefined {
  const info = (req as any).rateLimit as { remaining?: number } | undefined;
  return typeof info?.remaining === 'number' ? info.remaining : undefined;
}

/** Limiter de autenticação. O 429 é JSON com a hora de volta (a tela mostra "Tente de novo às HH:MM"). */
export function createAuthLimiter(opts: { max?: number; windowMs?: number; skipInTest?: boolean } = {}): RequestHandler {
  const windowMs = opts.windowMs ?? AUTH_WINDOW_MS;
  const skipInTest = opts.skipInTest ?? true;
  return rateLimit({
    windowMs,
    max: opts.max ?? AUTH_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipInTest && process.env.NODE_ENV === 'test',
    handler: (req: Request, res: Response, _next: NextFunction) => {
      const reset = (req as any).rateLimit?.resetTime;
      const retryAt = reset instanceof Date ? reset : new Date(Date.now() + windowMs);
      res.status(429).json({ error: `Muitas tentativas. Tente de novo às ${hhmm(retryAt)}.`, retryAt: retryAt.toISOString() });
    },
  });
}
