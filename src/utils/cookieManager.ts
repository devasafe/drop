import { Response } from 'express';

/**
 * ✅ SEGURANÇA: Funções para gerenciar tokens em HttpOnly cookies
 * Previne XSS attacks removendo tokens do localStorage
 */

const COOKIE_OPTIONS = {
  httpOnly: true,      // Não acessível via JavaScript (previne XSS)
  secure: process.env.NODE_ENV === 'production', // HTTPS only em produção
  sameSite: 'lax' as const, // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  path: '/',
};

/**
 * Define token em HttpOnly cookie
 */
export function setTokenCookie(res: Response, token: string): void {
  res.cookie('token', token, COOKIE_OPTIONS);
}

/**
 * Limpa o cookie de token (logout)
 */
export function clearTokenCookie(res: Response): void {
  res.clearCookie('token', { path: '/' });
}

/**
 * Define dados do usuário em cookie regular (acessível ao frontend)
 * IMPORTANTE: Nunca armazenar dados sensíveis aqui
 */
export function setUserCookie(res: Response, user: any): void {
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    activeRole: user.activeRole,
    roles: user.roles,
  };

  res.cookie('user', JSON.stringify(safeUser), {
    httpOnly: false, // Acessível ao frontend
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/',
  });
}

/**
 * Limpa cookie do usuário
 */
export function clearUserCookie(res: Response): void {
  res.clearCookie('user', { path: '/' });
}

/**
 * Middleware para extrair token do cookie em requisições
 */
export function extractTokenFromCookie(req: any): string | null {
  return req.cookies?.token || null;
}
