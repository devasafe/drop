import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useAuth } from '../../contexts/AuthContext';

const ALL_ROLES = [
  { key: 'cliente',           label: 'Clientes' },
  { key: 'lojista',           label: 'Lojistas' },
  { key: 'motoboy',           label: 'Motoboys' },
  { key: 'gerente_clientes',  label: 'Gerentes de Clientes' },
  { key: 'gerente_lojistas',  label: 'Gerentes de Lojistas' },
  { key: 'gerente_motoboys',  label: 'Gerentes de Motoboys' },
  { key: 'gerente_geral',     label: 'Gerentes Gerais' },
  { key: 'marketing',         label: 'Marketing' },
];

interface Broadcast {
  _id: string;
  title: string;
  body: string;
  targetRoles: string[];
  deliveryCount: number;
  sentAt: string;
  createdBy?: { name: string };
}

export default function AdminBroadcasts() {
  useRequireAuth(['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys']);
  const router = useRouter();
  const { user } = useAuth() || {};
  const isCeo = (user?.activeRole || user?.role) === 'ceo';

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState('');

  const [history, setHistory] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const handleDelete = async (id: string, deliveryCount: number) => {
    if (!confirm(`Apagar este anúncio e remover as notificações de ${deliveryCount} usuários?`)) return;
    try {
      await api.delete(`/broadcasts/${id}`);
      setHistory(prev => prev.filter(b => b._id !== id));
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao apagar');
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get('/broadcasts');
      setHistory(res.data.broadcasts);
    } catch {
      /* silencioso */
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const selectAll = () => setTargetRoles(ALL_ROLES.map(r => r.key));
  const clearAll = () => setTargetRoles([]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || targetRoles.length === 0) {
      return alert('Preencha título, mensagem e selecione pelo menos um grupo.');
    }
    if (!confirm(`Enviar para ${targetRoles.length} grupos?`)) return;

    setSending(true);
    setSentMsg('');
    try {
      const res = await api.post('/broadcasts', { title, body, targetRoles });
      setSentMsg(`Enviado para ${res.data.deliveryCount} usuários!`);
      setTitle(''); setBody(''); setTargetRoles([]);
      await fetchHistory();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <ProtectedRoute required_role={['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys']}>
      <div style={{ minHeight: '100vh', background: 'var(--drop-bg)', padding: '32px 20px' }}>
        <div className="drop-fade-in" style={{ maxWidth: 760, margin: '0 auto' }}>

          <div style={{ marginBottom: 28 }}>
            <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>
              ← Dashboard
            </button>
            <h1 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 26, fontWeight: 700, color: 'var(--drop-text)', margin: '0 0 4px' }}>
              Enviar Anúncio
            </h1>
            <p style={{ fontSize: 14, color: 'var(--drop-text-muted)', margin: 0 }}>
              Publique comunicados para grupos específicos do app
            </p>
          </div>

          {/* Composer */}
          <form onSubmit={handleSend} style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Título</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Promoção de Verão 🔥"
                style={inputStyle}
                maxLength={200}
                required
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Mensagem</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Escreva aqui o conteúdo do anúncio..."
                rows={5}
                maxLength={2000}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                required
              />
              <div style={{ fontSize: 11, color: 'var(--drop-text-dim)', marginTop: 4, textAlign: 'right' }}>{body.length}/2000</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <label style={labelStyle}>Enviar para</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={selectAll} style={miniBtn}>Todos</button>
                  <button type="button" onClick={clearAll} style={miniBtn}>Limpar</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {ALL_ROLES.map(r => (
                  <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: targetRoles.includes(r.key) ? 'var(--drop-purple-bg)' : 'var(--drop-bg-2)', border: `1px solid ${targetRoles.includes(r.key) ? 'var(--drop-purple)' : 'var(--drop-border)'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: targetRoles.includes(r.key) ? 'var(--drop-purple-2)' : 'var(--drop-text-muted)' }}>
                    <input type="checkbox" checked={targetRoles.includes(r.key)} onChange={() => toggleRole(r.key)} style={{ accentColor: 'var(--drop-purple)', width: 14, height: 14 }} />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>

            {sentMsg && <p style={{ fontSize: 13, color: 'var(--drop-success)', fontWeight: 600, marginBottom: 12 }}>{sentMsg}</p>}

            <button type="submit" disabled={sending} style={{ width: '100%', padding: '12px', background: 'var(--drop-purple)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Enviando...' : 'Publicar Anúncio'}
            </button>
          </form>

          {/* Histórico */}
          <h2 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 18, fontWeight: 600, color: 'var(--drop-text)', margin: '0 0 16px' }}>
            Histórico
          </h2>

          {loadingHistory ? (
            <LoadingSkeleton variant="list" count={3} />
          ) : history.length === 0 ? (
            <p style={{ color: 'var(--drop-text-muted)', fontSize: 13 }}>Nenhum anúncio enviado ainda.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map(b => (
                <div key={b._id} style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border)', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--drop-text)' }}>{b.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--drop-text-dim)', whiteSpace: 'nowrap' }}>
                        {new Date(b.sentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isCeo && (
                        <button
                          onClick={() => handleDelete(b._id, b.deliveryCount)}
                          title="Apagar para todos"
                          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 12, padding: '3px 8px', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--drop-text-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>{b.body}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--drop-text-dim)' }}>
                    <span>Por: {b.createdBy?.name || 'Sistema'}</span>
                    <span>·</span>
                    <span>{b.deliveryCount} usuários</span>
                    <span>·</span>
                    <span>{b.targetRoles.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--drop-bg-2)', border: '1px solid var(--drop-border-md)',
  borderRadius: 8, color: 'var(--drop-text)', padding: '10px 14px', fontSize: 14,
  fontFamily: 'inherit', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--drop-text-muted)', display: 'block', marginBottom: 6, fontWeight: 500,
};

const miniBtn: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--drop-border-md)',
  background: 'transparent', color: 'var(--drop-text-muted)', fontSize: 12, cursor: 'pointer',
};
