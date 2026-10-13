import Link from 'next/link';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { CustodyMoney } from '../../components/seller/dinheiro/CustodyMoney';
import { DirectMoney } from '../../components/seller/dinheiro/DirectMoney';
import { PayoutDetail } from '../../components/seller/dinheiro/PayoutDetail';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useCustodyLeftoverState } from '../../hooks/useCustodyLeftoverState';
import styles from './DinheiroPagina.module.css';

/**
 * Aba Dinheiro nos dois modos. Garantia de modo: o conteúdo só aparece depois que o modo
 * carregou (o hook assume 'custodia' enquanto carrega) — no direto nunca aparece saldo
 * liberado nem saque da custódia; o saldo antigo sai só pelo card do modo anterior.
 */
export default function SellerDinheiroPage() {
  const router = useRouter();
  const { settlementMode, loading, error, retry } = useSaasConfig();
  const leftover = useCustodyLeftoverState();
  const { store } = useSellerPanel();
  const storeId = store?._id ? String(store._id) : null;
  const direto = settlementMode === 'direto';
  const ready = !loading && !!storeId && (!direto || !leftover.loading);
  const repasse = typeof router.query.repasse === 'string' ? router.query.repasse : null;

  let content: JSX.Element;
  if (error && !loading) {
    // falha aberta seria mostrar a custódia a uma loja do modo direto: sem o modo, não mostra dinheiro
    content = (
      <Alert tone="error" title="Não carregamos o seu Dinheiro" action={{ label: 'Tentar de novo', onClick: () => retry?.() }}>
        Não conseguimos confirmar como você recebe. Tente de novo em instantes.
      </Alert>
    );
  } else if (!ready || !storeId) {
    content = (
      <div role="status" aria-label="Carregando" className={styles.loading}>
        <Skeleton height={140} />
        <Skeleton height={96} />
      </div>
    );
  } else if (direto) {
    content = (
      <>
        <DirectMoney storeId={storeId} hasLeftover={leftover.hasLeftover} />
        <Link href="/seller/assinatura" className={styles.link}>
          Assinatura e recebimentos
        </Link>
      </>
    );
  } else if (repasse) {
    content = <PayoutDetail payoutId={repasse} storeId={storeId} onBack={() => router.push('/seller/dinheiro')} />;
  } else {
    content = <CustodyMoney storeId={storeId} onOpenPayout={(id) => router.push(`/seller/dinheiro?repasse=${encodeURIComponent(id)}`)} />;
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title={repasse && ready && !direto ? 'Extrato do repasse' : 'Dinheiro'}>
        <main className={styles.page}>{content}</main>
      </SellerShell>
    </ProtectedRoute>
  );
}
