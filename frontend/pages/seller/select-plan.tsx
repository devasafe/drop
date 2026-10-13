// Rota antiga da etapa "Plano". Fica viva para links antigos e para o onboardingFlow (intocável):
// no cadastro (?onboarding=1) mostra a mesma etapa embutida em /seller/abrir (PlanoStep), com voltar
// para o checklist; com a loja aberta, a troca de plano mora em "Plano e comissão".
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import SellerShell from '../../components/seller/panel/SellerShell';
import { PlanoStep } from '../../components/seller/abrir/PlanoStep';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';

function EscolherPlano() {
  const router = useRouter();
  const ready = router.isReady !== false;
  const onboarding = router.query.onboarding === '1';

  useEffect(() => { if (ready && !onboarding) router.replace('/seller/plano'); }, [ready, onboarding, router]);

  if (!onboarding) return null;
  return (
    <div className={blocks.body}>
      <PlanoStep onDone={() => router.push('/seller/abrir')} />
    </div>
  );
}

// Tela do modo custódia: fora dele, o ModeGate leva ao painel em vez de bater 404 na API.
export default function SelectPlan() {
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="custodia">
        <SellerShell title="Escolha seu plano" back="/seller/abrir">
          <EscolherPlano />
        </SellerShell>
      </ModeGate>
    </ProtectedRoute>
  );
}
