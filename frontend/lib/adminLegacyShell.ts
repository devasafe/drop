import { adminScreenTitle } from './adminNav';

/**
 * Páginas de /admin que ainda NÃO montam o AdminShell (D3a). O _app as embrulha num AdminShell genérico
 * para nenhuma ficar sem menu enquanto a tela dela não é reescrita.
 * Regra: a task de cada tela (P2–P5) tira a sua rota daqui no mesmo commit em que a página passa a montar
 * o AdminShell; página apagada sai junto. lib/__tests__/adminLegacyShell.test.ts cobra os dois lados.
 */
export const ADMIN_LEGACY_SHELL_ROUTES: string[] = [
  '/admin/analytics', '/admin/app-cashbox', '/admin/conversas',
  '/admin/dashboard', '/admin/estornos', '/admin/lojas-asaas',
  '/admin/payouts', '/admin/plan-approvals', '/admin/pricing-config',
  '/admin/ranking-config', '/admin/suporte',
  '/admin/transfers', '/admin/users', '/admin/verificacoes', '/admin/wallets', '/admin/withdrawals',
];

/** Título da casca genérica (o mesmo do menu), ou null quando a rota não está na lista. */
export function adminLegacyShellTitle(pathname: string): string | null {
  return ADMIN_LEGACY_SHELL_ROUTES.includes(pathname) ? adminScreenTitle(pathname) : null;
}
