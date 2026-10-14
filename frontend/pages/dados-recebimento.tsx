// /dados-recebimento é compartilhada: etapa Pix do motoboy e (rota antiga) etapa Recebimento da loja.
// O formulário é um só (RecebimentoForm), o mesmo embutido em /seller/abrir.
// Lojista: SellerShell com voltar para o checklist. Motoboy: a moldura de onboarding de antes.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useSaasConfig } from '../hooks/useSaasConfig';
import OnboardingProgress from '../components/OnboardingProgress';
import OnboardingFooter from '../components/OnboardingFooter';
import SellerShell from '../components/seller/panel/SellerShell';
import { RecebimentoForm } from '../components/onboarding/RecebimentoForm';
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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <OnboardingProgress />
        <h1 className={styles.pageTitle}>Dados de recebimento</h1>
        <p className={styles.pageSubtitle}>
          Configure sua chave PIX (e endereço) para receber seus pagamentos e poder sacar.
        </p>
        <div className={styles.form}>
          <RecebimentoForm direct={direct} store={false} />
        </div>
      </div>
      <OnboardingFooter />
    </div>
  );
}
