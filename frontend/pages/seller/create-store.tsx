// Rota antiga da 1ª etapa do cadastro. Fica viva para links antigos e para o onboardingFlow (intocável),
// mas a tela é a mesma etapa embutida em /seller/abrir (DadosLojaStep), com voltar para o checklist.
// Com a loja já criada, não abre o cadastro de novo: volta ao checklist na etapa da loja (modo edição).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { DadosLojaStep } from '../../components/seller/abrir/DadosLojaStep';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Store } from 'lucide-react';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import api from '../../lib/api';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';

type State = 'loading' | 'new' | 'exists' | 'error';

export default function CreateStore() {
  const router = useRouter();
  const { settlementMode } = useSaasConfig();
  const [state, setState] = useState<State>('loading');

  const check = () => {
    setState('loading');
    api.get('/stores/dashboard')
      .then((r) => setState(r?.data?.store ? 'exists' : 'new'))
      .catch((e) => setState(e?.response?.status === 404 ? 'new' : 'error'));
  };
  useEffect(check, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state === 'exists') router.replace('/seller/abrir?etapa=loja'); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  let content: JSX.Element;
  if (state === 'new') {
    content = <DadosLojaStep cnpjRequired={settlementMode !== 'direto'} onDone={() => router.push('/seller/abrir')} />;
  } else if (state === 'error') {
    content = <EmptyState variant="error" icon={<Store />} title="Não carregamos o seu cadastro" onRetry={check} />;
  } else {
    content = <Skeleton height={320} radius="var(--radius-lg)" />;
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Criar a loja" back="/seller/abrir">
        <div className={blocks.body}>{content}</div>
      </SellerShell>
    </ProtectedRoute>
  );
}
