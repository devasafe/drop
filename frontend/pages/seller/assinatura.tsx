import { useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import ModeGate from '../../components/ModeGate';
import { useAuth } from '../../contexts/AuthContext';
import { Section } from '../../components/ui/Section';
import { formatBRL, formatBillingDate, saasStatusMessage, type SaasBillingView } from '../../lib/saasBilling';
import styles from './Integrations.module.css';

function Assinatura() {
  const { user } = useAuth() as any;
  const [data, setData] = useState<SaasBillingView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dash = await api.get('/stores/dashboard').then((r) => r.data).catch(() => null);
        const id = dash?.store?._id || dash?._id || user?.storeId;
        if (!id) { if (!cancelled) setError('Não encontramos a sua loja.'); return; }
        const r = await api.get(`/stores/${id}/saas-billing`);
        if (!cancelled) setData(r.data?.data ?? null);
      } catch {
        if (!cancelled) setError('Não foi possível carregar a sua assinatura.');
      }
    })();
    return () => { cancelled = true; };
  }, [user?.storeId]);

  const warn = data && (data.status === 'past_due' || data.status === 'paused');
  const pay = data?.nextPayment;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Assinatura</h1>
          <p className={styles.subtitle}>A mensalidade da sua loja no DROP.</p>
        </header>
        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        {data && (
          <>
            <Section title="Situação">
              <p style={{ margin: 0, fontWeight: 600, color: warn ? 'var(--danger)' : 'var(--text-strong)' }}>
                {saasStatusMessage(data)}
              </p>
            </Section>
            <Section title="Valor mensal">
              <p style={{ margin: 0, color: 'var(--text-strong)' }}>{formatBRL(data.fee)}</p>
            </Section>
            {pay && (
              <Section title="Próxima cobrança">
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                  Vencimento <span style={{ color: 'var(--text)' }}>{formatBillingDate(pay.dueDate)}</span>
                  {' · '}Valor <span style={{ color: 'var(--text)' }}>{formatBRL(pay.value)}</span>
                </p>
                {pay.invoiceUrl && (
                  <a className={styles.docsLink} href={pay.invoiceUrl} target="_blank" rel="noopener noreferrer">
                    Pagar fatura
                  </a>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SellerAssinatura() {
  return (
    <ProtectedRoute required_role="lojista">
      <ModeGate mode="direto">
        <Assinatura />
      </ModeGate>
    </ProtectedRoute>
  );
}
