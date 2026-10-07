import env from './env';

/**
 * Política única de origem para HTTP (cors) e Socket.io. Origens exatas de
 * CORS_ORIGIN; previews *.vercel.app só com ALLOW_VERCEL_PREVIEWS=true.
 * Sem Origin (curl, apps, server-to-server) passa — navegador sempre envia Origin,
 * e é dele que vem o risco de usar o cookie da vítima.
 */
export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true;
  const allowed = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  return process.env.ALLOW_VERCEL_PREVIEWS === 'true' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}
