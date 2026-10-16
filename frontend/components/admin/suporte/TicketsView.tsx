import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import ChatPanel from '../../ChatPanel';
import Icon from '../../Icon';
import useChat from '../../../hooks/useChat';
import { useAuth } from '../../../contexts/AuthContext';
import { ADMIN_DESKTOP_MIN, useMinWidth } from '../../../hooks/useMinWidth';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { AdminSheet } from '../AdminSheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { useToast } from '../../ui/Toast';
import blocks from '../AdminBlocks.module.css';
import styles from './Suporte.module.css';
import { personRole, STATUS_LABELS } from './labels';

/**
 * Suporte · chamados (D3a, tela 19). Endpoints de sempre: GET /support/tickets { params },
 * GET /chat/conversations/:id/messages, PUT /support/tickets/:id/assign|resolve, DELETE /support/tickets/:id (só CEO na tela),
 * POST /chat/conversations/:id/messages { text }. O ChatPanel só responde depois de assumir e antes de resolver.
 */
export type TicketFilter = 'todos' | 'aberto' | 'em_atendimento' | 'comigo' | 'resolvido';

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

const CATEGORY_LABEL: Record<string, string> = { clientes: 'Clientes', lojistas: 'Lojistas', motoboys: 'Motoboys', geral: 'Geral' };
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function TicketsView({ filter }: { filter: TicketFilter }) {
  const { user } = useAuth();
  const myId = user?.id || user?._id || '';
  const isCeo = (user?.activeRole || user?.role) === 'ceo';
  const { showToast } = useToast();
  const desktop = useMinWidth(ADMIN_DESKTOP_MIN);
  const { messages, setMessages, typingUsers, setUserTyping, markAsRead, joinConversation, leaveConversation, isConnected } =
    useChat({ token: '', userId: myId });

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [active, setActive] = useState<Ticket | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'resolve' | 'delete' | null>(null);

  const status = filter === 'aberto' || filter === 'em_atendimento' || filter === 'resolvido' ? filter : null;

  const fetchTickets = useCallback(async () => {
    setListError(null);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const res = await api.get('/support/tickets', { params });
      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setListError(adminErrorMessage(err, 'Não deu para ler os chamados.'));
    }
  }, [status]);

  useEffect(() => {
    setTickets(null);
    fetchTickets();
  }, [fetchTickets]);

  // Só a leitura mais nova vale: trocar de chamado (ou voltar à lista) descarta a resposta da conversa anterior.
  const historyReq = useRef(0);
  const loadHistory = useCallback(async (convId: string) => {
    const req = ++historyReq.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages`);
      if (req !== historyReq.current) return;
      const msgs = Array.isArray(res.data) ? res.data : (res.data?.messages ?? []);
      setMessages(msgs);
    } catch (err) {
      if (req !== historyReq.current) return;
      setMessages([]);
      setHistoryError(adminErrorMessage(err, 'Não deu para carregar a conversa.'));
    } finally {
      if (req === historyReq.current) setHistoryLoading(false);
    }
  }, [setMessages]);

  const convId = active?.conversationId;
  useEffect(() => {
    if (!convId) return undefined;
    loadHistory(convId);
    if (isConnected) joinConversation(convId);
    return () => {
      historyReq.current += 1;
      leaveConversation(convId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, isConnected]);

  const select = (t: Ticket) => {
    if (active?.conversationId && active.conversationId !== t.conversationId) leaveConversation(active.conversationId);
    setActive(t);
  };

  const back = () => {
    if (active?.conversationId) leaveConversation(active.conversationId);
    setActive(null);
  };

  const assign = async (id: string) => {
    try {
      const res = await api.put(`/support/tickets/${id}/assign`);
      const updated = res.data?.ticket;
      await fetchTickets();
      setActive((prev) => (prev && prev._id === id
        ? { ...prev, status: 'em_atendimento', assignedTo: updated?.assignedTo ?? prev.assignedTo }
        : prev));
    } catch (err) {
      showToast(adminErrorMessage(err, 'Não deu para assumir o chamado.'), 'error');
    }
  };

  const resolve = async () => {
    if (!active) return;
    const id = active._id;
    await api.put(`/support/tickets/${id}/resolve`);
    setSheet(null);
    setActive((prev) => (prev && prev._id === id ? { ...prev, status: 'resolvido' } : prev));
    showToast('Chamado resolvido', 'success');
    await fetchTickets();
  };

  const remove = async () => {
    if (!active) return;
    const id = active._id;
    await api.delete(`/support/tickets/${id}`);
    setSheet(null);
    setActive(null);
    setMessages([]);
    showToast('Chamado excluído', 'success');
    await fetchTickets();
  };

  const send = async (text: string) => {
    if (!active?.conversationId || !text.trim()) return;
    try {
      await api.post(`/chat/conversations/${active.conversationId}/messages`, { text });
      // A mensagem chega pelo socket (notifier → conversation:${id}) para as duas partes.
    } catch (err) {
      showToast(adminErrorMessage(err, 'A mensagem não foi enviada.'), 'error');
    }
  };

  const shown = tickets && filter === 'comigo'
    ? tickets.filter((t) => t.assignedTo.some((a) => a.userId === myId))
    : tickets;
  const hasAssumed = active?.assignedTo.some((a) => a.userId === myId) ?? false;
  const assignedNames = active?.assignedTo.map((a) => a.name) ?? [];

  const list = (
    <section className={styles.listCol} aria-label="Chamados">
      {listError ? (
        <div className={styles.state}>
          <p className={blocks.errText} role="alert">{listError}</p>
          <div><Button variant="secondary" size="sm" onClick={fetchTickets}>Tentar de novo</Button></div>
        </div>
      ) : shown === null ? (
        <div className={styles.state} aria-busy="true" aria-label="Carregando">
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>{filter === 'comigo' ? 'Nenhum chamado com você.' : 'Nenhum chamado por aqui.'}</p>
      ) : (
        <ul className={styles.rows}>
          {shown.map((t) => (
            <li key={t._id}>
              <button
                type="button"
                className={[styles.row, active?._id === t._id && styles.rowOn].filter(Boolean).join(' ')}
                aria-current={active?._id === t._id ? 'true' : undefined}
                onClick={() => select(t)}
              >
                <span className={styles.rowTitle}>{t.subject}</span>
                <span className={styles.rowMeta}>{t.openedBy.name} · {CATEGORY_LABEL[t.category] ?? t.category}</span>
                <span className={styles.rowFoot}>
                  <span className={styles[`st_${t.status}`]}>{STATUS_LABELS[t.status]}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const conversation = active ? (
    <section className={styles.chatCol} aria-label="Conversa">
      <header className={styles.chatHead}>
        {!desktop && (
          <button type="button" className={styles.back} onClick={back} aria-label="Voltar à lista">
            <Icon name="arrow-left" size={18} />
          </button>
        )}
        <div className={styles.chatTitle}>
          <span>{active.subject}</span>
          <span className={styles.protocol}>#{active._id.slice(-8).toUpperCase()}</span>
        </div>
        <div className={styles.headActions}>
          {active.status !== 'resolvido' && !hasAssumed && (
            <Button variant="secondary" size="sm" onClick={() => assign(active._id)}>Assumir</Button>
          )}
          {active.status !== 'resolvido' && (
            <Button size="sm" onClick={() => setSheet('resolve')}>Marcar resolvido</Button>
          )}
          {isCeo && <Button variant="danger" size="sm" onClick={() => setSheet('delete')}>Excluir</Button>}
        </div>
      </header>
      {historyError && (
        <Alert
          tone="error"
          title="A conversa não carregou"
          action={{ label: 'Tentar de novo', onClick: () => loadHistory(active.conversationId) }}
        >
          {historyError}
        </Alert>
      )}
      <ChatPanel
        conversationId={active.conversationId}
        messages={messages}
        typingUsers={typingUsers}
        userId={myId}
        onSendMessage={send}
        onUserTyping={setUserTyping}
        onMarkAsRead={markAsRead}
        isLoading={historyLoading}
        isFinalized={active.status === 'resolvido' || !hasAssumed}
        finalizedMessage={active.status === 'resolvido' ? 'Atendimento encerrado.' : 'Assuma o chamado para poder responder.'}
      />
    </section>
  ) : (
    <section className={styles.chatCol} aria-label="Conversa vazia">
      <p className={styles.empty}>Escolha um chamado para ver a conversa.</p>
    </section>
  );

  const context = active ? (
    <aside className={styles.ctxCol} aria-label="Contexto">
      <p className={styles.cap}>Contexto</p>
      <dl className={styles.sum}>
        <div className={styles.sumRow}><dt>Pessoa</dt><dd>{active.openedBy.name}</dd></div>
        <div className={styles.sumRow}><dt>Papel</dt><dd>{personRole(active.openedBy.role)}</dd></div>
        <div className={styles.sumRow}><dt>Categoria</dt><dd>{CATEGORY_LABEL[active.category] ?? active.category}</dd></div>
        <div className={styles.sumRow}><dt>Situação</dt><dd>{STATUS_LABELS[active.status]}</dd></div>
        <div className={styles.sumRow}><dt>Atendendo</dt><dd>{assignedNames.length ? assignedNames.join(', ') : 'Ninguém ainda'}</dd></div>
        <div className={styles.sumRow}><dt>Aberto em</dt><dd>{fmtDateTime(active.createdAt)}</dd></div>
      </dl>
    </aside>
  ) : null;

  return (
    <>
      {desktop ? (
        <div className={styles.cols3}>{list}{conversation}{context ?? <aside className={styles.ctxCol} aria-hidden="true" />}</div>
      ) : active ? (
        <div className={styles.stack}>{conversation}{context}</div>
      ) : (
        list
      )}

      <AdminSheet
        open={sheet === 'resolve'}
        title="Marcar o chamado como resolvido?"
        onClose={() => setSheet(null)}
        primary={{ label: 'Marcar resolvido', onClick: resolve }}
      >
        <p className={blocks.muted}>A conversa fica encerrada para novas respostas.</p>
      </AdminSheet>
      <AdminSheet
        open={sheet === 'delete'}
        title="Excluir este chamado?"
        onClose={() => setSheet(null)}
        primary={{ label: 'Excluir', tone: 'danger', onClick: remove }}
      >
        <p className={blocks.muted}>Apaga o chamado de vez. Não dá para desfazer.</p>
      </AdminSheet>
    </>
  );
}

export default TicketsView;
