import type { NextRouter } from 'next/router';

/**
 * Voltar que não fica parado quando a tela foi aberta direto (link, notificação push no app):
 * sem histórico, vai para `fallback`.
 */
export function goBack(router: NextRouter, fallback: string): void {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back();
  else router.push(fallback);
}
