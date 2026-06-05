import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import Icon from './Icon';

interface AccessRequest {
  _id: string;
  requestedBy: { _id: string; name: string; email: string } | string;
  requestedByRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  expiresAt: string | null;
  createdAt: string;
}

/**
 * Inbox flutuante para clientes aprovarem/rejeitarem pedidos de acesso à carteira.
 */
export default function WalletAccessInbox() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { on } = useSocket();

  const load = async () => {
    try {
      const res = await api.get('/wallet-access/incoming');
      setRequests(res.data?.requests || []);
    } catch {
      setRequests([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const off = on('wallet:access_requested', () => {
      load();
      setOpen(true);
    });
    return () => { if (off) off(); };
  }, [on]);

  const pending = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'approved' && r.expiresAt && new Date(r.expiresAt).getTime() > Date.now());

  const act = async (id: string, action: 'approve' | 'reject' | 'revoke') => {
    setBusy(id);
    try {
      await api.post(`/wallet-access/${id}/${action}`);
      await load();
    } catch (err: any) {
      alert((err.response?.data?.error || 'Erro'));
    } finally {
      setBusy(null);
    }
  };

  if (pending.length === 0 && approved.length === 0) return null;

  const badgeCount = pending.length;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Solicitações de acesso à carteira"
        style={{
          position: 'fixed', bottom: 96, right: 24, zIndex: 900,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--drop-purple)', border: '1px solid rgba(255,255,255,0.15)',
          color: 'var(--drop-white)', cursor: 'pointer', fontSize: 22,
          boxShadow: 'var(--drop-shadow-purple)', display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}
      >
        <Icon name="lock" size={22} />
        {badgeCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20,
            background: '#EF4444', borderRadius: 999, color: '#fff',
            fontSize: 11, fontWeight: 700, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '0 6px'
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 160, right: 24, zIndex: 901,
          width: 360, maxHeight: '70vh', overflowY: 'auto',
          background: 'var(--drop-surface)', border: '1px solid var(--drop-border)',
          borderRadius: 'var(--drop-radius-lg)', padding: 16,
          color: 'var(--drop-white)', fontFamily: 'var(--drop-font-body)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontFamily: 'var(--drop-font-display)' }}>
              <Icon name="lock" size={14} /> Acessos à sua carteira
            </h3>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>

          {pending.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', margin: '0 0 8px 0', letterSpacing: '0.06em' }}>
                Pendentes
              </p>
              {pending.map(r => {
                const requester = typeof r.requestedBy === 'string' ? { name: 'Admin' } : r.requestedBy;
                return (
                  <div key={r._id} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--drop-border)',
                    borderRadius: 'var(--drop-radius-sm)', padding: 12, marginBottom: 8
                  }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 700 }}>
                      {requester.name} ({r.requestedByRole})
                    </p>
                    <p style={{ margin: '0 0 10px 0', fontSize: 12, color: 'var(--drop-text-muted)', lineHeight: 1.5 }}>
                      {r.reason}
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        disabled={busy === r._id}
                        onClick={() => act(r._id, 'approve')}
                        style={{
                          flex: 1, padding: '7px 10px', background: '#22C55E',
                          border: 'none', borderRadius: 6, color: '#fff',
                          cursor: 'pointer', fontSize: 12, fontWeight: 600
                        }}
                      >
                        ✓ Aprovar (24h)
                      </button>
                      <button
                        disabled={busy === r._id}
                        onClick={() => act(r._id, 'reject')}
                        style={{
                          flex: 1, padding: '7px 10px', background: 'transparent',
                          border: '1px solid var(--drop-border)', borderRadius: 6,
                          color: 'var(--drop-white)', cursor: 'pointer', fontSize: 12, fontWeight: 600
                        }}
                      >
                        ✕ Rejeitar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {approved.length > 0 && (
            <div>
              <p style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--drop-text-muted)', margin: '0 0 8px 0', letterSpacing: '0.06em' }}>
                Acessos ativos
              </p>
              {approved.map(r => {
                const requester = typeof r.requestedBy === 'string' ? { name: 'Admin' } : r.requestedBy;
                return (
                  <div key={r._id} style={{
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: 'var(--drop-radius-sm)', padding: 12, marginBottom: 8
                  }}>
                    <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 700 }}>
                      {requester.name}
                    </p>
                    <p style={{ margin: '0 0 8px 0', fontSize: 11, color: 'var(--drop-text-muted)' }}>
                      Expira em {r.expiresAt ? new Date(r.expiresAt).toLocaleString('pt-BR') : '—'}
                    </p>
                    <button
                      disabled={busy === r._id}
                      onClick={() => act(r._id, 'revoke')}
                      style={{
                        width: '100%', padding: '6px 10px', background: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6,
                        color: '#EF4444', cursor: 'pointer', fontSize: 12, fontWeight: 600
                      }}
                    >
                      Revogar acesso
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
