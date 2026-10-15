// frontend/pages/motoboy/ganhos/index.tsx
import { useRouter } from 'next/router';
import { HelpCircle, Wallet } from 'lucide-react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { CustodyEarnings } from '../../../components/motoboy/ganhos/CustodyEarnings';
import { DirectEarnings } from '../../../components/motoboy/ganhos/DirectEarnings';
import { EmptyState } from '../../../components/ui/EmptyState';
import { IconButton } from '../../../components/ui/IconButton';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { useSaasConfig } from '../../../hooks/useSaasConfig';
import { useCustodyLeftoverState } from '../../../hooks/useCustodyLeftoverState';
import { MOTOBOY_ROUTES, type GanhosSeg } from '../../../lib/motoboyRoutes';

const asSeg = (v: unknown): GanhosSeg => (v === 'saques' || v === 'notas' ? v : 'corridas');

/**
 * Aba Ganhos do motoboy nos dois modos (substitui /motoboy/wallet, request-withdrawal e
 * transfer-wallet). Garantia de modo: o conteúdo só aparece depois que o modo carregou; com
 * erro ao ler o modo, erro e "Tentar de novo" — nunca a custódia por padrão.
 * O saldo do modo anterior (K22) mora aqui: só no direto e só com sobra da custódia.
 */
export default function MotoboyGanhosPage() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const saas = useSaasConfig();
  const leftover = useCustodyLeftoverState();
  const motoboyId: string | null = user?._id || user?.id || null;
  const direto = saas.settlementMode === 'direto';
  const seg = asSeg(router.query?.seg);

  let content: JSX.Element;
  if (saas.error) {
    content = (
      <EmptyState
        variant="error"
        icon={<Wallet size={28} aria-hidden="true" />}
        title="Não carregamos seus ganhos"
        description="Não conseguimos saber como a DROP está pagando agora. Nenhum valor aparece até carregar."
        onRetry={() => saas.retry?.()}
      />
    );
  } else if (saas.loading || !motoboyId || (direto && leftover.loading)) {
    content = (
      <div role="status" aria-label="Carregando">
        <Skeleton height={150} />
      </div>
    );
  } else if (direto) {
    content = <DirectEarnings hasLeftover={leftover.hasLeftover} />;
  } else {
    content = (
      <CustodyEarnings
        motoboyId={motoboyId}
        seg={seg}
        onSeg={(s) => router.replace(MOTOBOY_ROUTES.ganhos(s), undefined, { shallow: true })}
      />
    );
  }

  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell
        title="Ganhos"
        actions={
          <IconButton
            variant="soft"
            icon={<HelpCircle size={18} aria-hidden="true" />}
            aria-label="Como calculamos seus ganhos"
            onClick={() => router.push(MOTOBOY_ROUTES.comoCalculamos)}
          />
        }
      >
        {content}
      </MotoboyShell>
    </ProtectedRoute>
  );
}
