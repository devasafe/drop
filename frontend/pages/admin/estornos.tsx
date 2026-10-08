import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { humanizeRefundError, REFUND_STATUS_LABEL } from '../../lib/refundErrors';
import styles from '../seller/Integrations.module.css';

interface Row {
  id: string;
  orderId: string;
  storeName: string | null;
  status: string;
  amount: number;
  attempts: number;
  lastError: string | null;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'failed', label: 'Falhou' },
  { value: 'failed_final', label: 'Falha final' },
  { value: 'uncertain', label: 'Incerto' },
  { value: 'done', label: 'Concluídos' },
];

export default function AdminEstornos() {
  const router = useRouter();
  const { can } = useAuth() as any;
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  // Paginação por cursor: o backend devolve `nextCursor` (null = acabou).
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const canAct = typeof can === 'function' ? can('payout:release') : false;

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/direct-refunds', { params: status ? { status } : {} });
      setRows(r.data?.data ?? []);
      setNextCursor(r.data?.nextCursor ?? null);
      setError('');
    } catch {
      setError('Não foi possível carregar os estornos.');
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.get('/admin/direct-refunds', { params: status ? { status, cursor: nextCursor } : { cursor: nextCursor } });
      const more: Row[] = r.data?.data ?? [];
      setRows((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
      setNextCursor(r.data?.nextCursor ?? null);
    } catch {
      setError('Não foi possível carregar os estornos.');
    } finally {
      setLoadingMore(false);
    }
  };

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError('');
    try {
      await fn();
      setResolving(null);
      setNote('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.response?.data?.error || 'Ação não concluída.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ProtectedRoute required_permission="payout:view">
      <div className={styles.page}>
        <div className={styles.container}>
          <button className={styles.docsLink} onClick={() => router.push('/admin/dashboard')}>← Dashboard</button>
          <header className={styles.header}>
            <h1 className={styles.title}>Estornos</h1>
            <p className={styles.subtitle}>Estornos de pedidos no modo direto. Confira no Asaas antes de marcar como resolvido.</p>
          </header>
          <label className={styles.subtitle}>
            Filtrar por status{' '}
            <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          {error && <p role="alert" className={styles.subtitle}>{error}</p>}
          {rows.length === 0 && !error && <p className={styles.subtitle}>Nenhum estorno encontrado.</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {rows.map((r) => (
              <li key={r.id} style={{ padding: 'var(--space-3)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)' }}>
                <div style={{ color: 'var(--text)' }}>
                  {r.storeName ?? 'Loja'} — pedido {r.orderId} — R$ {Number(r.amount).toFixed(2).replace('.', ',')}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {REFUND_STATUS_LABEL[r.status] ?? r.status} · {r.attempts} tentativa(s)
                </div>
                {r.lastError && r.status !== 'done' && <div style={{ color: 'var(--danger)' }}>{humanizeRefundError(r.lastError)}</div>}
                {canAct && r.status !== 'done' && r.status !== 'requested' && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {(r.status === 'pending' || r.status === 'failed' || r.status === 'failed_final') && (
                      <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, () => api.post(`/orders/${r.orderId}/refund-direct`))}>
                        {r.status === 'failed_final' ? 'Reabrir e estornar' : 'Estornar'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setResolving(resolving === r.id ? null : r.id); setNote(''); }}>
                      Marcar como resolvido
                    </Button>
                  </div>
                )}
                {resolving === r.id && (
                  <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <textarea
                      aria-label="Nota da conferência"
                      placeholder="Ex.: conferido no painel do Asaas, estorno concluído"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={note.trim().length < 10}
                      loading={busy === r.id}
                      onClick={() => act(r.id, () => api.post(`/admin/direct-refunds/${r.id}/resolve`, { note: note.trim() }))}
                    >
                      Confirmar resolução
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-3)' }}>
              <Button variant="ghost" loading={loadingMore} onClick={loadMore}>Carregar mais</Button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
