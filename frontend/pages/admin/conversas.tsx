import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './Conversas.module.css';

const TYPE_LABELS: Record<string, string> = {
  loja_cliente:    'Loja × Cliente',
  loja_motoboy:    'Loja × Motoboy',
  motoboy_cliente: 'Motoboy × Cliente',
  suporte:         'Suporte',
  pre_purchase:    'Pré-compra',
};

const TYPE_COLORS: Record<string, string> = {
  loja_cliente:    '#6c2bd9',
  loja_motoboy:    '#2d9cdb',
  motoboy_cliente: '#27ae60',
  suporte:         '#e67e22',
  pre_purchase:    '#8e44ad',
};

const STATUS_LABELS: Record<string, string> = {
  aberto:          'Aberto',
  em_atendimento:  'Em atendimento',
  resolvido:       'Resolvido',
};

interface Participant {
  userId?: string;
  _id?: string;
  name: string;
  role: string;
}

interface Conversation {
  _id: string;
  type: string;
  supportStatus?: string;
  participant1: Participant;
  participant2: Participant;
  lastMessage?: { text: string; sentAt?: string; createdAt?: string };
  updatedAt: string;
}

interface Message {
  _id: string;
  senderId: string | { _id: string; name?: string };
  text?: string;
  attachments?: { url: string; type?: string }[];
  sentAt?: string;
  createdAt?: string;
}

// Tenta parsear a data de vários campos
const getDate = (msg: Message) => {
  const raw = msg.sentAt || msg.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const formatMsgTime = (msg: Message) => {
  const d = getDate(msg);
  if (!d) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatConvTime = (dateStr: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const initials = (name: string) => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const AVATAR_COLORS = ['#6c2bd9', '#2d9cdb', '#27ae60', '#e67e22', '#e84393'];
const avatarColor = (name: string) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

export default function AdminConversas() {
  useRequireAuth(['ceo']);
  const router = useRouter();

  const [typeFilter, setTypeFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected]       = useState<Conversation | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (typeFilter)   params.type   = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (search)       params.search = search;
      const res = await api.get('/chat/admin/conversations', { params });
      setConversations(res.data.conversations || []);
      setTotal(res.data.total || 0);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [page, typeFilter, statusFilter, search]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openConversation = async (conv: Conversation) => {
    setSelected(conv);
    setMessages([]);
    setLoadingMsgs(true);
    try {
      const res = await api.get(`/chat/admin/conversations/${conv._id}/messages`);
      setMessages(res.data.messages || []);
    } catch { /* silencioso */ }
    finally { setLoadingMsgs(false); }
  };

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const totalPages = Math.ceil(total / 25);

  // Resolve nome do remetente cruzando com participantes
  const getSender = (msg: Message, conv: Conversation) => {
    const sid = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId;
    const p1id = conv.participant1?.userId || conv.participant1?._id;
    const p2id = conv.participant2?.userId || conv.participant2?._id;
    if (sid && p1id && sid === p1id?.toString()) return conv.participant1;
    if (sid && p2id && sid === p2id?.toString()) return conv.participant2;
    // fallback: tenta pelo nome no objeto populado
    if (typeof msg.senderId === 'object' && msg.senderId.name) {
      return { name: msg.senderId.name, role: '' };
    }
    return null;
  };

  // Verifica se é do participant1 (lado esquerdo) ou participant2 (direito)
  const isP1 = (msg: Message, conv: Conversation) => {
    const sid = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId;
    const p1id = conv.participant1?.userId || conv.participant1?._id;
    return sid && p1id && sid === p1id?.toString();
  };

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <div className={styles.layout}>

          {/* ── SIDEBAR ── */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <button onClick={() => router.push('/admin/dashboard')} className={styles.backBtn}>← Dashboard</button>
              <div className={styles.sidebarTitle}>
                <h1 className={styles.title}>Conversas</h1>
                <span className={styles.totalBadge}>{total}</span>
              </div>
            </div>

            <div className={styles.filters}>
              <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }} className={styles.searchForm}>
                <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Buscar por nome..."
                  className={styles.searchInput}
                />
              </form>

              <div className={styles.filterRow}>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className={styles.select}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={styles.select}>
                  <option value="">Todos os status</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.convList}>
              {loading ? (
                <LoadingSkeleton variant="list" count={5} />
              ) : conversations.length === 0 ? (
                <div className={styles.stateMsg}>Nenhuma conversa</div>
              ) : conversations.map(conv => {
                const active = selected?._id === conv._id;
                const color = TYPE_COLORS[conv.type] || '#888';
                return (
                  <button
                    key={conv._id}
                    className={`${styles.convItem} ${active ? styles.convItemActive : ''}`}
                    onClick={() => openConversation(conv)}
                  >
                    {/* Avatares sobrepostos */}
                    <div className={styles.avatarStack}>
                      <div className={styles.avatar} style={{ background: avatarColor(conv.participant1?.name) }}>
                        {initials(conv.participant1?.name)}
                      </div>
                      <div className={styles.avatar2} style={{ background: avatarColor(conv.participant2?.name) }}>
                        {initials(conv.participant2?.name)}
                      </div>
                    </div>

                    <div className={styles.convInfo}>
                      <div className={styles.convInfoTop}>
                        <span className={styles.convNames}>
                          {conv.participant1?.name?.split(' ')[0]} &amp; {conv.participant2?.name?.split(' ')[0]}
                        </span>
                        <span className={styles.convTime}>{formatConvTime(conv.updatedAt)}</span>
                      </div>
                      <div className={styles.convInfoBottom}>
                        <span className={styles.typePill} style={{ color, background: `${color}20` }}>
                          {TYPE_LABELS[conv.type] || conv.type}
                        </span>
                        {conv.supportStatus && (
                          <span className={styles.statusDot} data-status={conv.supportStatus} />
                        )}
                      </div>
                      {conv.lastMessage?.text && (
                        <p className={styles.lastMsg}>{conv.lastMessage.text}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={styles.pageBtn}>←</button>
                <span className={styles.pageInfo}>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={styles.pageBtn}>→</button>
              </div>
            )}
          </aside>

          {/* ── PAINEL DE MENSAGENS ── */}
          <main className={styles.main}>
            {!selected ? (
              <div className={styles.emptyMain}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>Selecione uma conversa</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className={styles.chatHeader}>
                  <div className={styles.chatHeaderLeft}>
                    <div className={styles.avatarStack}>
                      <div className={styles.avatar} style={{ background: avatarColor(selected.participant1?.name) }}>
                        {initials(selected.participant1?.name)}
                      </div>
                      <div className={styles.avatar2} style={{ background: avatarColor(selected.participant2?.name) }}>
                        {initials(selected.participant2?.name)}
                      </div>
                    </div>
                    <div>
                      <div className={styles.chatHeaderNames}>
                        {selected.participant1?.name} &amp; {selected.participant2?.name}
                      </div>
                      <div className={styles.chatHeaderSub}>
                        <span className={styles.typePill} style={{ color: TYPE_COLORS[selected.type] || '#888', background: `${TYPE_COLORS[selected.type] || '#888'}20` }}>
                          {TYPE_LABELS[selected.type] || selected.type}
                        </span>
                        {selected.supportStatus && (
                          <span className={styles.statusPill} data-status={selected.supportStatus}>
                            {STATUS_LABELS[selected.supportStatus]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={styles.readOnlyBadge}><Icon name="eye" size={14} /> Somente leitura</span>
                </div>

                {/* Mensagens */}
                <div className={styles.messagesArea}>
                  {loadingMsgs ? (
                    <LoadingSkeleton variant="list" count={4} />
                  ) : messages.length === 0 ? (
                    <div className={styles.stateMsg}>Nenhuma mensagem nesta conversa</div>
                  ) : (
                    <>
                      {messages.map((msg, idx) => {
                        const sender = getSender(msg, selected);
                        const left = isP1(msg, selected);
                        const time = formatMsgTime(msg);
                        const prevMsg = messages[idx - 1];
                        const prevSid = prevMsg ? (typeof prevMsg.senderId === 'object' ? prevMsg.senderId._id : prevMsg.senderId) : null;
                        const curSid = typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId;
                        const showName = curSid !== prevSid;

                        return (
                          <div key={msg._id} className={`${styles.msgRow} ${left ? styles.msgRowLeft : styles.msgRowRight}`}>
                            {left && showName && (
                              <div className={styles.msgAvatar} style={{ background: avatarColor(sender?.name || '') }}>
                                {initials(sender?.name || '?')}
                              </div>
                            )}
                            {left && !showName && <div className={styles.msgAvatarSpacer} />}

                            <div className={styles.msgGroup}>
                              {showName && (
                                <span className={styles.msgSenderName}>
                                  {sender?.name || 'Usuário'}
                                  {sender?.role && <span className={styles.msgRole}> · {sender.role}</span>}
                                </span>
                              )}
                              <div className={`${styles.bubble} ${left ? styles.bubbleLeft : styles.bubbleRight}`}>
                                {msg.text && <span className={styles.bubbleText}>{msg.text}</span>}
                                {msg.attachments?.map((att, i) => (
                                  att.type === 'image'
                                    ? <img key={i} src={att.url} alt="anexo" className={styles.attachImg} />
                                    : <a key={i} href={att.url} target="_blank" rel="noreferrer" className={styles.attachLink}><Icon name="file-text" size={12} /> Anexo</a>
                                ))}
                                {time && <span className={styles.bubbleTime}>{time}</span>}
                              </div>
                            </div>

                            {!left && showName && (
                              <div className={styles.msgAvatar} style={{ background: avatarColor(sender?.name || '') }}>
                                {initials(sender?.name || '?')}
                              </div>
                            )}
                            {!left && !showName && <div className={styles.msgAvatarSpacer} />}
                          </div>
                        );
                      })}
                      <div ref={msgsEndRef} />
                    </>
                  )}
                </div>
              </>
            )}
          </main>

        </div>
      </div>
    </ProtectedRoute>
  );
}
