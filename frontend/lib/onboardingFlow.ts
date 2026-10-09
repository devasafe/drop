// Fonte única da ordem das etapas de onboarding por papel.
import type { SettlementMode } from '../hooks/useSaasConfig';

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
    { key: 'loja', label: 'Criar loja', path: '/seller/create-store' },
    { key: 'identidade', label: 'Sua identidade', path: '/verificacao' },
    { key: 'lojaVerif', label: 'Verificar loja', path: '/verificacao-loja' },
    { key: 'pix', label: 'Recebimento (PIX)', path: '/dados-recebimento' },
    { key: 'plano', label: 'Plano', path: '/seller/select-plan' },
  ],
};

// Modo direto (SaaS): o lojista não passa por verificação de loja, Pix nem plano —
// termina conectando a própria conta Asaas.
const LOJISTA_DIRETO: OnboardingStep[] = [
  { key: 'loja', label: 'Criar loja', path: '/seller/create-store' },
  { key: 'identidade', label: 'Sua identidade', path: '/verificacao' },
  { key: 'asaas', label: 'Conta Asaas', path: '/seller/pagamentos' },
];

const FINAL: Record<string, string> = {
  cliente: '/',
  motoboy: '/motoboy',
  lojista: '/seller/dashboard',
};

export function getFlow(role?: string, mode: SettlementMode = 'custodia'): OnboardingStep[] {
  if (!role) return [];
  if (role === 'lojista' && mode === 'direto') return LOJISTA_DIRETO;
  return FLOWS[role as keyof typeof FLOWS] || [];
}

export function getStepIndexByPath(role: string | undefined, path: string, mode: SettlementMode = 'custodia'): number {
  return getFlow(role, mode).findIndex((s) => s.path === path);
}

export function getNextStep(role: string | undefined, path: string, mode: SettlementMode = 'custodia'): OnboardingStep | null {
  const flow = getFlow(role, mode);
  const i = flow.findIndex((s) => s.path === path);
  if (i === -1 || i >= flow.length - 1) return null;
  return flow[i + 1];
}

export function getFinalDestination(role?: string): string {
  if (!role) return '/';
  return FINAL[role] || '/';
}
