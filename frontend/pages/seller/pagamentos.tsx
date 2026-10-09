import { useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { AsaasConnectCard } from '../../components/drop/asaas/AsaasConnectCard';
import MotoboyTransfersCard from '../../components/drop/asaas/MotoboyTransfersCard';
import OnboardingProgress from '../../components/OnboardingProgress';
import OnboardingFooter from '../../components/OnboardingFooter';
import styles from './Integrations.module.css';

export default function SellerPagamentos() {
  const { user } = useAuth() as any;
  const [storeId, setStoreId] = useState<string | null>(user?.storeId ?? null);
  const [egressIp, setEgressIp] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dash = await api.get('/stores/dashboard').then((r) => r.data).catch(() => null);
        const id = dash?.store?._id || dash?._id || user?.storeId;
        if (!cancelled && id) setStoreId(String(id));
      } catch { /* sem loja */ }
      try {
        const r = await api.get('/settings/saas');
        if (!cancelled) setEgressIp(r.data?.egressIp ?? null);
      } catch { /* opcional */ }
    })();
    return () => { cancelled = true; };
  }, [user?.storeId]);

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>
          <OnboardingProgress />
          <header className={styles.header}>
            <h1 className={styles.title}>Recebimentos</h1>
            <p className={styles.subtitle}>Conecte a sua conta Asaas. Os pagamentos dos seus pedidos caem direto nela.</p>
          </header>
          {storeId && <AsaasConnectCard apiBase={`/stores/${storeId}/asaas`} storeId={storeId} egressIp={egressIp} />}
          {storeId && <MotoboyTransfersCard storeId={storeId} />}
        </div>
        <OnboardingFooter />
      </div>
    </ProtectedRoute>
  );
}
