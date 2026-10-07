import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { AsaasConnectCard } from '../../components/drop/asaas/AsaasConnectCard';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import styles from '../seller/Integrations.module.css';

interface StoreRow {
  storeId: string;
  name: string;
  status: 'none' | 'valid' | 'invalid';
  environment: 'sandbox' | 'production' | null;
  apiKeyLast4: string | null;
  lastCheckedAt: string | null;
}

const STATUS_LABEL = { none: 'Não conectada', valid: 'Chave válida', invalid: 'Chave inválida' } as const;

/** Só o CEO: trocar a conta Asaas de uma loja redireciona o dinheiro dela. */
export default function AdminLojasAsaas() {
  const router = useRouter();
  const { settlementMode, loading } = useSaasConfig();
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [selected, setSelected] = useState<StoreRow | null>(null);
  const [egressIp, setEgressIp] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/stores/asaas');
      setRows(r.data?.data ?? []);
    } catch {
      setError('Não foi possível carregar as lojas.');
    }
  }, []);

  useEffect(() => {
    load();
    api.get('/settings/saas').then((r) => setEgressIp(r.data?.egressIp ?? null)).catch(() => { /* opcional */ });
  }, [load]);

  const direct = settlementMode === 'direto';

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.docsLink} onClick={() => router.push('/admin/dashboard')}>← Dashboard</button>
          <header className={styles.header}>
            <h1 className={styles.title}>Contas Asaas das lojas</h1>
            <p className={styles.subtitle}>Conecte, troque ou desconecte a conta Asaas de uma loja. Toda alteração fica registrada.</p>
          </header>
          {!loading && !direct && <p className={styles.subtitle}>A plataforma está no modo custódia; as contas por loja só valem no modo direto.</p>}
          {error && <p className={styles.subtitle}>{error}</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {rows.map((s) => (
              <li key={s.storeId}>
                <button
                  className={styles.docsLink}
                  aria-pressed={selected?.storeId === s.storeId}
                  onClick={() => setSelected(s)}
                >
                  {s.name} — {STATUS_LABEL[s.status]}{s.apiKeyLast4 ? ` (••••${s.apiKeyLast4})` : ''}
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <AsaasConnectCard
              key={selected.storeId}
              apiBase={`/admin/stores/${selected.storeId}/asaas`}
              storeId={selected.storeId}
              egressIp={egressIp}
              allowDisconnect
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
