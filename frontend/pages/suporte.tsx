import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import useRequireAuth from '../hooks/useRequireAuth';
import Icon from '../components/Icon';
import ChatPanel from '../components/ChatPanel';
import useChat from '../hooks/useChat';
import styles from './Suporte.module.css';

interface Ticket {
  _id: string;
  conversationId: string;
  subject: string;
  status: 'aberto' | 'em_atendimento' | 'resolvido';
  category: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
};

const STATUS_COLOR: Record<string, string> = {
  aberto: '#F59E0B',
  em_atendimento: '#38BDF8',
  resolvido: '#22C55E',
};

export default function SuportePage() {
  useRequireAuth();
  const router = useRouter();
  const { user, token } = useContext(AuthContext);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
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

  // Atualizar ticket em tempo real quando o suporte finaliza
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { ticketId: string; conversationId: string }) => {
      setTickets(prev => prev.map(t =>
        t._id === data.ticketId ? { ...t, status: 'resolvido' as const } : t
      ));
      setActiveTicket(prev => prev?._id === data.ticketId ? { ...prev, status: 'resolvido' as const } : prev);
    };
    socket.on('support:ticket_resolved', handler);
    return () => { socket.off('support:ticket_resolved', handler); };
  }, [socket]);

  const fetchTickets = async () => {
    try {
      const res = await api.get('/support/tickets');
      setTickets(res.data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, []);

  useEffect(() => {
    if (!activeConversationId) return;

    setHistoryLoading(true);
    api.get(`/chat/conversations/${activeConversationId}/messages`)
      .then(res => {
        const msgs = Array.isArray(res.data) ? res.data : (res.data?.messages ?? []);
        setMessages(msgs);
      })
      .catch(() => setMessages([]))
      .finally(() => setHistoryLoading(false));

    if (isConnected) {
      joinConversation(activeConversationId);
    }

    return () => {
      leaveConversation(activeConversationId);
    };
  }, [activeConversationId, isConnected]);

  const handleOpenConversation = (ticket: Ticket) => {
    if (activeConversationId && activeConversationId !== ticket.conversationId) {
      leaveConversation(activeConversationId);
    }
    setActiveConversationId(ticket.conversationId);
    setActiveTicket(ticket);
  };

  const handleSendMessage = async (text: string) => {
    if (!activeConversationId || !text.trim()) return;
    try {
      await api.post(`/chat/conversations/${activeConversationId}/messages`, { text });
    } catch {
      /* silencioso */
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/support/tickets', { subject });
      setShowForm(false);
      setSubject('');
      await fetchTickets();
      // Selecionar o novo ticket automaticamente
      const newTicket: Ticket = {
        _id: res.data._id || res.data.ticket?._id,
        conversationId: res.data.conversationId,
        subject,
        status: 'aberto',
        category: res.data.category || 'geral',
        createdAt: new Date().toISOString(),
      };
      handleOpenConversation(newTicket);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao abrir ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>

      {/* Top bar */}
      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button className={styles.backBtn} onClick={() => router.back()}>←</button>
          <div className={styles.topbarIcon}><Icon name="headphones" size={24} /></div>
          <div>
            <p className={styles.topbarTitle}>Central de Suporte</p>
            <p className={styles.topbarSub}>Estamos aqui para ajudar</p>
          </div>
        </div>
        <div className={styles.statusDot} title="Online" />
      </div>

      {/* Body */}
      <div className={styles.bodyWrapper}>
      <div className={styles.body}>

        {/* Sidebar — lista de tickets */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>Meus tickets</span>
            <button onClick={() => setShowForm(v => !v)} className={styles.btnNew}>
              {showForm ? '✕ Cancelar' : '+ Novo'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.label}>Assunto</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Descreva brevemente o problema..."
                className={styles.input}
                required
                autoFocus
              />
              <button type="submit" disabled={submitting} className={styles.btnSubmit}>
                {submitting ? 'Abrindo...' : 'Abrir ticket'}
              </button>
            </form>
          )}

          <div className={styles.ticketList}>
            {loading ? (
              <p className={styles.emptyTickets}>Carregando...</p>
            ) : tickets.length === 0 ? (
              <div className={styles.emptyTickets}>
                <span className={styles.emptyTicketsIcon}><Icon name="tag" size={28} /></span>
                Nenhum ticket ainda.
                <br />Clique em "+ Novo" para abrir um.
              </div>
            ) : (
              tickets.map(t => (
                <div
                  key={t._id}
                  className={`${styles.ticketItem} ${activeConversationId === t.conversationId ? styles.ticketItemActive : ''}`}
                  onClick={() => handleOpenConversation(t)}
                >
                  <div className={styles.ticketSubject}>{t.subject}</div>
                  <div className={styles.ticketMeta}>
                    <span
                      className={styles.ticketStatusBadge}
                      style={{ color: STATUS_COLOR[t.status] }}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                    <span className={styles.ticketDate}>
                      {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={styles.chatArea}>
          {activeConversationId ? (
            <ChatPanel
              conversationId={activeConversationId}
              messages={messages}
              typingUsers={typingUsers}
              userId={user?.id || user?._id || ''}
              onSendMessage={handleSendMessage}
              onUserTyping={setUserTyping}
              onMarkAsRead={markAsRead}
              isLoading={historyLoading}
              title={activeTicket?.subject || 'Suporte'}
              subtitle={activeTicket ? `SUPORTE DROP · #${activeTicket._id.slice(-8).toUpperCase()}` : 'SUPORTE DROP'}
              isFinalized={activeTicket?.status === 'resolvido'}
              finalizedMessage="Este atendimento foi encerrado. Abra um novo ticket se precisar de ajuda."
            />
          ) : (
            <div className={styles.chatEmpty}>
              <span className={styles.chatEmptyIcon}><Icon name="chat" size={40} /></span>
              <span className={styles.chatEmptyText}>Selecione um ticket para ver a conversa</span>
              <span className={styles.chatEmptyHint}>ou abra um novo ticket usando o botão "+ Novo"</span>
            </div>
          )}
        </div>

      </div>
      </div>
    </div>
  );
}
