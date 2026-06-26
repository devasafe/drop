// Fonte única da ordem das etapas de onboarding por papel.
export type OnboardingStep = { key: string; label: string; path: string };

const FLOWS: Record<'cliente' | 'motoboy' | 'lojista', OnboardingStep[]> = {
  cliente: [
    { key: 'identidade', label: 'Sua conta', path: '/verificacao' },
  ],
  motoboy: [
    { key: 'identidade', label: 'Sua conta', path: '/verificacao' },
    { key: 'motoboy', label: 'Dados de entregador', path: '/verificacao-motoboy' },
    { key: 'pix', label: 'Recebimento (PIX)', path: '/dados-recebimento' },
  ],
  lojista: [
    { key: 'identidade', label: 'Sua identidade', path: '/verificacao' },
    { key: 'loja', label: 'Sua loja', path: '/verificacao-loja' },
    { key: 'pix', label: 'Recebimento (PIX)', path: '/dados-recebimento' },
    { key: 'plano', label: 'Plano', path: '/seller/select-plan' },
  ],
};

const FINAL: Record<string, string> = {
  cliente: '/',
  motoboy: '/motoboy',
  lojista: '/seller/dashboard',
};

export function getFlow(role?: string): OnboardingStep[] {
  if (!role) return [];
  return FLOWS[role as keyof typeof FLOWS] || [];
}

export function getStepIndexByPath(role: string | undefined, path: string): number {
  return getFlow(role).findIndex((s) => s.path === path);
}

export function getNextStep(role: string | undefined, path: string): OnboardingStep | null {
  const flow = getFlow(role);
  const i = flow.findIndex((s) => s.path === path);
  if (i === -1 || i >= flow.length - 1) return null;
  return flow[i + 1];
}

export function getFinalDestination(role?: string): string {
  if (!role) return '/';
  return FINAL[role] || '/';
}
