import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from '../hooks/useSaasConfig';
import { useCustodyLeftoverState } from '../hooks/useCustodyLeftoverState';
import { getFinalDestination } from '../lib/onboardingFlow';
import { Skeleton } from './ui/Skeleton';

interface ModeGateProps {
  /** Modo de liquidação em que a tela faz sentido. */
  mode: 'custodia' | 'direto';
  /** Tela de custódia que segue acessível no modo direto enquanto houver saldo antigo. */
  allowLeftover?: boolean;
  children: React.ReactNode;
}

/**
 * Evita abrir pela URL uma tela do modo errado (a API responderia 404). Fora do modo,
 * leva para o painel do papel ativo. Se /settings/saas falhar o hook assume 'custodia';
 * o backend é quem bloqueia de verdade.
 */
export default function ModeGate({ mode, allowLeftover, children }: ModeGateProps) {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const { settlementMode, loading } = useSaasConfig();
  const leftover = useCustodyLeftoverState();

  const waitingLeftover = !!allowLeftover && leftover.loading;
  const inMode = settlementMode === mode;
  const allowed = inMode || (!!allowLeftover && mode === 'custodia' && leftover.hasLeftover);
  const pending = loading || (!inMode && waitingLeftover);

  useEffect(() => {
    if (pending || allowed) return;
    router.replace(getFinalDestination(user?.activeRole || user?.role));
  }, [pending, allowed, router, user?.activeRole, user?.role]);

  if (pending) {
    return (
      <div role="status" aria-label="Carregando" style={{ padding: 'var(--space-4)' }}>
        <Skeleton height={120} radius="var(--r-lg)" />
      </div>
    );
  }
  return allowed ? <>{children}</> : null;
}
