/**
 * Pedidos de acesso à carteira, do lado do cliente (montado no _app só para role 'cliente').
 * Mesmas chamadas de antes: GET /wallet-access/incoming · POST /wallet-access/:id/{approve|reject|revoke}.
 * D3a (P4.1, K13): CSS Module só com tokens e toast de erro no lugar do alert; nada mais muda.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lock, X } from 'lucide-react';
import api from '../lib/api';
import { adminRoleLabel } from '../lib/adminNav';
import { useSocket } from '../contexts/SocketContext';
import { Button } from './ui/Button';
import { ICON_STROKE_WIDTH } from './ui/Icon';
import { useToast } from './ui/Toast';
import styles from './WalletAccessInbox.module.css';

interface AccessRequest {
  _id: string;
  requestedBy: { _id: string; name: string; email: string } | string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  expiresAt: string | null;
  createdAt: string;
}

type Action = 'approve' | 'reject' | 'revoke';

const requesterName = (r: AccessRequest) => (typeof r.requestedBy === 'string' ? 'Equipe DROP' : r.requestedBy.name);

export default function WalletAccessInbox() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { on } = useSocket();
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await api.get('/wallet-access/incoming');
      setRequests(res.data?.requests || []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = on('wallet:access_requested', () => {
      load();
      setOpen(true);
    });
    return () => { if (off) off(); };
  }, [on, load]);

  const pending = requests.filter((r) => r.status === 'pending');
  const approved = requests.filter((r) => r.status === 'approved' && r.expiresAt && new Date(r.expiresAt).getTime() > Date.now());

  const act = async (id: string, action: Action) => {
    setBusy(id);
    try {
      // K13 (F22): mesmo comportamento de antes; sucesso só relê a lista, sem toast novo
      await api.post(`/wallet-access/${id}/${action}`);
      await load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      showToast(typeof msg === 'string' && msg ? msg : 'Não deu certo. Tente de novo.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (pending.length === 0 && approved.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen((v) => !v)}
        aria-label="Pedidos de acesso à sua carteira"
        aria-expanded={open}
      >
        <Lock size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        {pending.length > 0 && <span className={styles.badge}>{pending.length}</span>}
      </button>

      {open && (
        <section className={styles.panel} aria-label="Acessos à sua carteira">
          <div className={styles.head}>
            <h3 className={styles.title}>Acessos à sua carteira</h3>
            <button type="button" className={styles.close} aria-label="Fechar" onClick={() => setOpen(false)}>
              <X size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            </button>
          </div>

          {pending.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Pendentes</p>
              {pending.map((r) => (
                <div key={r._id} className={styles.card}>
                  <p className={styles.who}>{`${requesterName(r)} (${adminRoleLabel(r.requestedByRole)})`}</p>
                  <p className={styles.reason}>{r.reason}</p>
                  <div className={styles.row}>
                    <Button size="sm" loading={busy === r._id} onClick={() => act(r._id, 'approve')}>Aprovar por 24 h</Button>
                    <Button size="sm" variant="secondary" disabled={busy === r._id} onClick={() => act(r._id, 'reject')}>Recusar</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {approved.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Acessos ativos</p>
              {approved.map((r) => (
                <div key={r._id} className={`${styles.card} ${styles.cardActive}`}>
                  <p className={styles.who}>{requesterName(r)}</p>
                  <p className={styles.reason}>
                    Expira em {r.expiresAt ? new Date(r.expiresAt).toLocaleString('pt-BR') : '—'}
                  </p>
                  <Button size="sm" variant="danger" disabled={busy === r._id} onClick={() => act(r._id, 'revoke')}>
                    Revogar acesso
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
