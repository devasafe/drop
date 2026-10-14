// Rota antiga da etapa "Verificar loja". Fica viva para links antigos e para o onboardingFlow (intocável),
// mas a tela é a mesma etapa embutida em /seller/abrir (DocumentosStep), com voltar para o checklist.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ListChecks } from 'lucide-react';
import api from '../lib/api';
import ModeGate from '../components/ModeGate';
import SellerShell from '../components/seller/panel/SellerShell';
import { DocumentosStep } from '../components/seller/abrir/DocumentosStep';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import blocks from '../components/panel/PanelBlocks.module.css';

function VerificacaoLojaPageInner() {
  const router = useRouter();
  const [store, setStore] = useState<{ id: string; cnpj: string } | null>(null);
  const [err, setErr] = useState('');

  const init = () => {
    setErr('');
    api.get('/stores/dashboard')
      .then(({ data }) => {
        const id = data?.store?._id || data?._id || data?.storeId || data?.store?.id;
        if (!id) { setErr('Não foi possível identificar sua loja.'); return; }
        setStore({ id: String(id), cnpj: data?.store?.cnpj || '' });
      })
      .catch((e) => setErr(e?.response?.data?.error || 'Faça login como lojista para acessar.'));
  };
  useEffect(init, []); // eslint-disable-line react-hooks/exhaustive-deps

  let content: JSX.Element;
  if (err) content = <EmptyState variant="error" icon={<ListChecks />} title={err} onRetry={init} />;
  else if (!store) content = <Skeleton height={320} radius="var(--radius-lg)" />;
  else {
    content = (
      <DocumentosStep
        storeId={store.id}
        storeCnpj={store.cnpj}
        onEditStore={() => router.push('/seller/abrir?etapa=loja')}
        onOwner={() => router.push('/seller/abrir?etapa=identidade')}
      />
    );
  }

  return (
    <SellerShell title="Verificar a loja" back="/seller/abrir">
      <div className={blocks.body}>{content}</div>
    </SellerShell>
  );
}

// Tela do modo custodia: fora dele abre o painel do papel em vez de bater 404 na API.
export default function VerificacaoLojaPage() {
  return (<ModeGate mode="custodia"><VerificacaoLojaPageInner /></ModeGate>);
}
