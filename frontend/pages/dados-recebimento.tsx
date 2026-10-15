// /dados-recebimento é compartilhada: etapa Pix do motoboy e (rota antiga) etapa Recebimento da loja.
// O formulário é um só (RecebimentoForm), o mesmo embutido em /seller/abrir.
// Lojista: SellerShell com voltar para o checklist. Motoboy: MotoboyShell com voltar para o Perfil (ou o Cadastro, no onboarding).
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from '../hooks/useSaasConfig';
import SellerShell from '../components/seller/panel/SellerShell';
import MotoboyShell from '../components/motoboy/panel/MotoboyShell';
import { MOTOBOY_ROUTES } from '../lib/motoboyRoutes';
import { RecebimentoForm } from '../components/onboarding/RecebimentoForm';
import { MotoboyRecebimento } from '../components/motoboy/recebimento/MotoboyRecebimento';
import blocks from '../components/panel/PanelBlocks.module.css';
import styles from './DadosRecebimento.module.css';

export default function DadosRecebimento() {
  const router = useRouter();
  const { settlementMode } = useSaasConfig();
  const direct = settlementMode === 'direto';
  const { user, loading: authLoading } = useAuth() || ({} as any);
  const role = user?.activeRole || user?.role;
  const isStore = role === 'lojista' || role === 'seller';
  const isReceiver = role === 'motoboy' || isStore;

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || !user) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loadingText}>Carregando...</p>
        </div>
      </div>
    );
  }
  if (!isReceiver) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.errorText}>Esta página é para lojistas e motoboys.</p>
        </div>
      </div>
    );
  }

  if (isStore) {
    return (
      <SellerShell title="Como você recebe" back="/seller/abrir">
        <div className={blocks.body}>
          <p className={blocks.sub}>Cada venda entregue vira saldo. Você saca para a chave que escolher aqui.</p>
          <RecebimentoForm direct={direct} store />
        </div>
      </SellerShell>
    );
  }

  // Motoboy: sem o modo de pagamento não há como saber a regra; nunca presume custódia nem direto (K29).
  // O mesmo bloco da etapa Recebimento do cadastro (MotoboyRecebimento).
  const fromOnboarding = router.query?.onboarding === '1';
  return (
    <MotoboyShell title="Onde você recebe" back={fromOnboarding ? MOTOBOY_ROUTES.cadastro : MOTOBOY_ROUTES.perfil}>
      <div className={blocks.body}>
        <MotoboyRecebimento />
      </div>
    </MotoboyShell>
  );
}
