import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../lib/transferErrors';
import styles from '../seller/Integrations.module.css';

interface Row {
  id: string;
  orderId: string;
  storeName: string | null;
  motoboyName: string | null;
  status: string;
  amount: number;
  attempts: number;
  lastError: string | null;
  pixKeyMasked: string;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'requested', label: 'Em andamento' },
  { value: 'failed', label: 'Falhou' },
  { value: 'failed_final', label: 'Falha final' },
  { value: 'uncertain', label: 'Incerto' },
  { value: 'done', label: 'Pagos' },
];

export default function AdminTransfers() {
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
      const r = await api.get('/admin/transfers', { params: status ? { status } : {} });
      setRows(r.data?.data ?? []);
      setNextCursor(r.data?.nextCursor ?? null);
      setError('');
    } catch {
      setError('Não foi possível carregar as transferências.');
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.get('/admin/transfers', { params: status ? { status, cursor: nextCursor } : { cursor: nextCursor } });
      const more: Row[] = r.data?.data ?? [];
      setRows((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
      setNextCursor(r.data?.nextCursor ?? null);
    } catch {
      setError('Não foi possível carregar as transferências.');
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
      setError(e?.response?.data?.error?.message || 'Ação não concluída.');
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
            <h1 className={styles.title}>Transferências a motoboys</h1>
            <p className={styles.subtitle}>
              Pix da loja ao motoboy no modo direto. Em resultado incerto, confira no painel do Asaas antes de marcar como resolvido: nunca reenviamos uma transferência incerta.
            </p>
          </header>
          <label className={styles.subtitle}>
            Filtrar por status{' '}
            <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          {error && <p role="alert" className={styles.subtitle}>{error}</p>}
          {rows.length === 0 && !error && <p className={styles.subtitle}>Nenhuma transferência encontrada.</p>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {rows.map((r) => (
              <li key={r.id} style={{ padding: 'var(--space-3)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)' }}>
                <div style={{ color: 'var(--text)' }}>
                  {r.storeName ?? 'Loja'} → {r.motoboyName ?? 'Motoboy'} — pedido {r.orderId} — R$ {Number(r.amount).toFixed(2).replace('.', ',')}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                  {TRANSFER_STATUS_LABEL[r.status] ?? r.status} · {r.attempts} tentativa(s)
                  {r.pixKeyMasked ? ` · Pix ${r.pixKeyMasked}` : ''}
                </div>
                {r.lastError && r.status !== 'done' && <div style={{ color: 'var(--danger)' }}>{humanizeTransferError(r.lastError)}</div>}
                {canAct && ['failed', 'failed_final', 'uncertain'].includes(r.status) && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {(r.status === 'failed' || r.status === 'failed_final') && (
                      <Button size="sm" loading={busy === r.id} onClick={() => act(r.id, () => api.post(`/admin/transfers/${r.id}/retry`))}>
                        Reenviar
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
                      placeholder="Ex.: conferido no painel do Asaas, Pix concluído"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={note.trim().length < 10}
                      loading={busy === r.id}
                      onClick={() => act(r.id, () => api.post(`/admin/transfers/${r.id}/resolve`, { note: note.trim() }))}
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
