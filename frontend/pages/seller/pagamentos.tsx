// D1: "Recebimentos" virou duas telas. Esta rota fica viva porque o onboardingFlow (intocável)
// e o VerificationHub ainda apontam a etapa "Conta Asaas" para cá: decide na página para onde ir.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Skeleton } from '../../components/ui/Skeleton';
import { asaasConsentState } from '../../components/seller/asaas/asaasShared';
import api from '../../lib/api';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { loadSaasConfig } from '../../hooks/useSaasConfig';

export default function SellerPagamentos() {
  const router = useRouter();
  const ready = router.isReady !== false;
  const onboarding = router.query.onboarding === '1';
  // V12: no painel, a loja vem do SellerPanelProvider (espera ele carregar); fora, o GET próprio.
  const panel = useSellerPanel();
  const inPanel = panel?.inPanel === true;
  const panelWaiting = inPanel && panel.loading;
  const panelStore = inPanel ? panel.store : null;

  useEffect(() => {
    if (!ready || panelWaiting) return undefined;
    if (onboarding) { router.replace('/seller/conta-asaas?onboarding=1'); return undefined; }
    let cancelled = false;
    (async () => {
      let dest = '/seller/dinheiro';
      try {
        // só o modo direto tem Conta Asaas; custódia ou modo ilegível (fail closed) vão para Dinheiro
        const cfg = await loadSaasConfig();
        if (cfg?.settlementMode !== 'direto') {
          if (!cancelled) router.replace(dest);
          return;
        }
        const dash = inPanel ? { store: panelStore } : await api.get('/stores/dashboard').then((r) => r.data);
        const id = dash?.store?._id;
        if (id) {
          const st = await api.get(`/stores/${id}/asaas`).then((r) => r.data?.data);
          // pronta = conta válida e sem bloqueio de aceite (termo antigo só avisa, não bloqueia)
          if (!(st?.status === 'valid' && !asaasConsentState(st).blocking)) dest = '/seller/conta-asaas';
        }
      } catch {
        /* sem leitura: Dinheiro, que tem o próprio estado de erro */
      }
      if (!cancelled) router.replace(dest);
    })();
    return () => { cancelled = true; };
  }, [ready, onboarding, panelWaiting]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ProtectedRoute required_role="lojista">
      <div role="status" aria-label="Abrindo">
        <Skeleton height={120} radius="var(--radius-lg)" />
      </div>
    </ProtectedRoute>
  );
}
