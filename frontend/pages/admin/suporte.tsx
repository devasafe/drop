import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import AuthContext from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import ChatPanel from '../../components/ChatPanel';
import useChat from '../../hooks/useChat';
import styles from './Suporte.module.css';

interface Ticket {
  _id: string;
  conversationId: string;
  subject: string;
  status: 'aberto' | 'em_atendimento' | 'resolvido';
  category: 'clientes' | 'lojistas' | 'motoboys' | 'geral';
  openedBy: { userId: string; name: string; role: string };
  assignedTo: Array<{ userId: string; name: string }>;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  aberto: '#F59E0B',
  em_atendimento: '#38BDF8',
  resolvido: '#22C55E',
};

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
};

export default function AdminSuporte() {
  const router = useRouter();
  const { user, token } = useContext(AuthContext);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'todos' | 'aberto' | 'em_atendimento' | 'resolvido'>('todos');
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const {
    messages,
    setMessages,
    typingUsers,
    setUserTyping,
    markAsRead,
    joinConversation,
    leaveConversation,
    isConnected,
    socket,
  } = useChat({ token: token || '', userId: user?.id || user?._id || '' });

  // Atualizar ticket em tempo real quando outro admin finalizar
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { ticketId: string }) => {
      setTickets(prev => prev.map(t =>
        t._id === data.ticketId ? { ...t, status: 'resolvido' as const } : t
      ));
      setActiveTicket(prev => prev?._id === data.ticketId ? { ...prev, status: 'resolvido' as const } : prev);
    };
    socket.on('support:ticket_resolved', handler);
    return () => { socket.off('support:ticket_resolved', handler); };
  }, [socket]);

  const handleSendMessage = async (text: string) => {
    if (!activeTicket?.conversationId || !text.trim()) return;
    try {
      await api.post(`/chat/conversations/${activeTicket.conversationId}/messages`, { text });
      // A mensagem chega via socket (notifier → conversation:${id}) para ambas as partes
    } catch {
      /* silencioso */
    }
  };

  const fetchTickets = async () => {
    try {
      const params: any = {};
      if (filterStatus !== 'todos') params.status = filterStatus;
      const res = await api.get('/support/tickets', { params });
      setTickets(res.data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, [filterStatus]);

  // Join/leave quando o ticket ativo muda
  useEffect(() => {
    const convId = activeTicket?.conversationId;
    if (!convId) return;

    setHistoryLoading(true);
    api.get(`/chat/conversations/${convId}/messages`)
      .then(res => {
        const msgs = Array.isArray(res.data) ? res.data : (res.data?.messages ?? []);
        setMessages(msgs);
      })
      .catch(() => setMessages([]))
      .finally(() => setHistoryLoading(false));

    if (isConnected) {
      joinConversation(convId);
    }

    return () => {
      leaveConversation(convId);
    };
  }, [activeTicket?.conversationId, isConnected]);

  const handleSelectTicket = (ticket: Ticket) => {
    if (activeTicket?.conversationId && activeTicket.conversationId !== ticket.conversationId) {
      leaveConversation(activeTicket.conversationId);
    }
    setActiveTicket(ticket);
  };

  const handleAssign = async (id: string) => {
    try {
      const res = await api.put(`/support/tickets/${id}/assign`);
      const updatedTicket = res.data.ticket;
      await fetchTickets();
      if (activeTicket?._id === id) {
        setActiveTicket(prev => prev ? {
          ...prev,
          status: 'em_atendimento',
          assignedTo: updatedTicket?.assignedTo ?? prev.assignedTo,
        } : prev);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro');
    }
  };

  const handleResolve = async (id: string) => {
    if (!confirm('Marcar ticket como resolvido?')) return;
    try {
      await api.put(`/support/tickets/${id}/resolve`);
      await fetchTickets();
      if (activeTicket?._id === id) setActiveTicket(prev => prev ? { ...prev, status: 'resolvido' } : prev);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apagar este ticket permanentemente? Esta ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/support/tickets/${id}`);
      await fetchTickets();
      if (activeTicket?._id === id) {
        setActiveTicket(null);
        setMessages([]);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao apagar ticket');
    }
  };

  const myId = user?.id || user?._id || '';
  const isCeo = (user as any)?.activeRole === 'ceo' || user?.role === 'ceo';
  const hasAssumed = activeTicket?.assignedTo.some(a => a.userId === myId) ?? false;
  const assignedNames = activeTicket?.assignedTo.map(a => a.name) ?? [];

  return (
    <ProtectedRoute required_permission="support:attend">
      <div style={{ minHeight: '100vh', background: 'var(--drop-bg)', padding: '24px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          <div style={{ marginBottom: 20 }}>
            <button onClick={() => router.push('/admin/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--drop-text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 6 }}>
              ← Dashboard
            </button>
            <h1 style={{ fontFamily: 'var(--drop-font-display)', fontSize: 24, fontWeight: 700, color: 'var(--drop-text)', margin: 0 }}>
              Central de Suporte
            </h1>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['todos', 'aberto', 'em_atendimento', 'resolvido'] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${filterStatus === f ? 'var(--drop-purple)' : 'var(--drop-border-md)'}`, background: filterStatus === f ? 'var(--drop-purple-bg)' : 'transparent', color: filterStatus === f ? 'var(--drop-purple-2)' : 'var(--drop-text-muted)', fontSize: 13, fontWeight: filterStatus === f ? 600 : 400, cursor: 'pointer' }}>
                {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className={`${styles.layout} ${activeTicket ? styles.layoutShowChat : styles.layoutShowList}`}>
            {/* Lista de tickets */}
            <div className={styles.panelList} style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {loading ? (
                <LoadingSkeleton variant="list" count={4} />
              ) : tickets.length === 0 ? (
                <p style={{ padding: 20, color: 'var(--drop-text-muted)', fontSize: 13 }}>Nenhum ticket encontrado.</p>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {tickets.map(t => (
                    <button
                      key={t._id}
                      onClick={() => handleSelectTicket(t)}
                      style={{ width: '100%', padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--drop-border)', background: activeTicket?._id === t._id ? 'var(--drop-purple-bg)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--drop-text)', marginBottom: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t.subject}</div>
                      <div style={{ fontSize: 12, color: 'var(--drop-text-muted)', marginBottom: 4 }}>{t.openedBy.name} · {t.category}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[t.status] }}>{STATUS_LABEL[t.status]}</span>
                        <span style={{ fontSize: 11, color: 'var(--drop-text-dim)' }}>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Conversa + ações */}
            <div className={styles.panelChat} style={{ background: 'var(--drop-surface)', border: '1px solid var(--drop-border-md)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {activeTicket ? (
                <>
                  {/* Barra de ações */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--drop-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <button
                        type="button"
                        className={styles.mobileBackBtn}
                        onClick={() => {
                          if (activeTicket?.conversationId) leaveConversation(activeTicket.conversationId);
                          setActiveTicket(null);
                        }}
                        aria-label="Voltar à lista"
                      >
                        ←
                      </button>
                      <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--drop-text)' }}>{activeTicket.subject}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--drop-text-dim)', background: 'var(--drop-bg-3)', border: '1px solid var(--drop-border)', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.5px' }}>
                          #{activeTicket._id.slice(-8).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--drop-text-muted)', marginTop: 2 }}>
                        Aberto por {activeTicket.openedBy.name}
                        {assignedNames.length > 0 && (
                          <span style={{ marginLeft: 8, color: '#38BDF8' }}>
                            · Em atendimento: {assignedNames.join(', ')}
                          </span>
                        )}
                      </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {activeTicket.status !== 'resolvido' && !hasAssumed && (
                        <button onClick={() => handleAssign(activeTicket._id)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--drop-border-md)', background: 'transparent', color: 'var(--drop-text-muted)', fontSize: 13, cursor: 'pointer' }}>
                          Assumir
                        </button>
                      )}
                      {activeTicket.status !== 'resolvido' && (
                        <button onClick={() => handleResolve(activeTicket._id)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Resolver
                        </button>
                      )}
                      {isCeo && (
                        <button onClick={() => handleDelete(activeTicket._id)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Apagar
                        </button>
                      )}
                    </div>
                  </div>

                  <ChatPanel
                    conversationId={activeTicket.conversationId}
                    messages={messages}
                    typingUsers={typingUsers}
                    userId={myId}
                    onSendMessage={handleSendMessage}
                    onUserTyping={setUserTyping}
                    onMarkAsRead={markAsRead}
                    isLoading={historyLoading}
                    isFinalized={activeTicket.status === 'resolvido' || !hasAssumed}
                    finalizedMessage={
                      activeTicket.status === 'resolvido'
                        ? 'Atendimento encerrado.'
                        : 'Assuma o ticket para poder responder.'
                    }
                  />
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--drop-text-muted)' }}>
                  Selecione um ticket para ver a conversa
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
