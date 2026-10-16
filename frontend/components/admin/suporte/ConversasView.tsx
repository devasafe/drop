import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import Icon from '../../Icon';
import { ADMIN_DESKTOP_MIN, useMinWidth } from '../../../hooks/useMinWidth';
import { adminErrorMessage } from '../../../lib/adminErrors';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Skeleton } from '../../ui/Skeleton';
import blocks from '../AdminBlocks.module.css';
import styles from './Suporte.module.css';
import { personRole, STATUS_LABELS } from './labels';

/**
 * Suporte · Conversas entre usuários (D3a, tela 19; antes a página conversas). Somente leitura:
 * GET /chat/admin/conversations { page, limit: 25, type?, status?, search? } e GET /chat/admin/conversations/:id/messages.
 */
const TYPE_LABELS: Record<string, string> = {
  loja_cliente: 'Loja × Cliente',
  loja_motoboy: 'Loja × Motoboy',
  motoboy_cliente: 'Motoboy × Cliente',
  suporte: 'Suporte',
  pre_purchase: 'Pré-compra',
};

interface Participant { userId?: string; _id?: string; name: string; role: string }
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

const LIMIT = 25;
const idOf = (p?: Participant) => (p?.userId || p?._id || '').toString();
const senderIdOf = (m: Message) => (typeof m.senderId === 'object' ? m.senderId._id : m.senderId);
const fmtTime = (m: Message) => {
  const raw = m.sentAt || m.createdAt;
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export function ConversasView() {
  const desktop = useMinWidth(ADMIN_DESKTOP_MIN);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setListError(null);
    setConversations(null);
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get('/chat/admin/conversations', { params });
      setConversations(res.data?.conversations || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      setListError(adminErrorMessage(err, 'Não deu para ler as conversas.'));
    }
  }, [page, typeFilter, statusFilter, search]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // Só a leitura mais nova vale: abrir outra conversa (ou voltar à lista) descarta a resposta da anterior.
  const msgReq = useRef(0);
  const open = async (conv: Conversation) => {
    const req = ++msgReq.current;
    setSelected(conv);
    setMessages(null);
    setMsgError(null);
    try {
      const res = await api.get(`/chat/admin/conversations/${conv._id}/messages`);
      if (req !== msgReq.current) return;
      setMessages(res.data?.messages || []);
    } catch (err) {
      if (req !== msgReq.current) return;
      setMessages([]);
      setMsgError(adminErrorMessage(err, 'Não deu para carregar a conversa.'));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const list = (
    <section className={styles.listCol} aria-label="Conversas entre usuários">
      <div className={styles.convFilters}>
        <form role="search" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}>
          <Input label="Buscar por nome" value={searchInput} onChange={setSearchInput} placeholder="Buscar por nome..." />
        </form>
        <Select
          label="Tipo"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          options={[{ value: '', label: 'Todos os tipos' }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <Select
          label="Situação"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={[{ value: '', label: 'Todas as situações' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
        />
      </div>
      {listError ? (
        <div className={styles.state}>
          <p className={blocks.errText} role="alert">{listError}</p>
          <div><Button variant="secondary" size="sm" onClick={fetchConversations}>Tentar de novo</Button></div>
        </div>
      ) : conversations === null ? (
        <div className={styles.state} aria-busy="true" aria-label="Carregando">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : conversations.length === 0 ? (
        <p className={styles.empty}>Nenhuma conversa</p>
      ) : (
        <ul className={styles.rows}>
          {conversations.map((c) => (
            <li key={c._id}>
              <button
                type="button"
                className={[styles.row, selected?._id === c._id && styles.rowOn].filter(Boolean).join(' ')}
                aria-current={selected?._id === c._id ? 'true' : undefined}
                onClick={() => open(c)}
              >
                <span className={styles.rowTitle}>{c.participant1?.name} × {c.participant2?.name}</span>
                <span className={styles.rowMeta}>{TYPE_LABELS[c.type] || c.type}{c.lastMessage?.text ? ` · ${c.lastMessage.text}` : ''}</span>
                <span className={styles.rowFoot}><span>{c.supportStatus ? STATUS_LABELS[c.supportStatus] : ''}</span><span>{fmtWhen(c.updatedAt)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <Button variant="secondary" size="sm" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="secondary" size="sm" aria-label="Próxima página" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</Button>
        </div>
      )}
    </section>
  );

  const conversation = selected ? (
    <section className={styles.chatCol} aria-label="Conversa">
      <header className={styles.chatHead}>
        {!desktop && (
          <button type="button" className={styles.back} onClick={() => { msgReq.current += 1; setSelected(null); }} aria-label="Voltar à lista">
            <Icon name="arrow-left" size={18} />
          </button>
        )}
        <div className={styles.chatTitle}><span>{selected.participant1?.name} × {selected.participant2?.name}</span></div>
        <span className={styles.readOnly}><Icon name="eye" size={14} /> Somente leitura</span>
      </header>
      <div className={styles.messages}>
        {msgError && (
          <div className={styles.state}>
            <p className={blocks.errText} role="alert">{msgError}</p>
            <div><Button variant="secondary" size="sm" onClick={() => open(selected)}>Tentar de novo</Button></div>
          </div>
        )}
        {messages === null ? (
          <div aria-busy="true" aria-label="Carregando"><Skeleton height={40} /><Skeleton height={40} /></div>
        ) : messages.length === 0 && !msgError ? (
          <p className={styles.empty}>Nenhuma mensagem nesta conversa</p>
        ) : (
          messages.map((m) => {
            const sid = senderIdOf(m);
            const left = !!sid && sid === idOf(selected.participant1);
            const sender = sid === idOf(selected.participant1) ? selected.participant1
              : sid === idOf(selected.participant2) ? selected.participant2
                : (typeof m.senderId === 'object' && m.senderId.name ? { name: m.senderId.name, role: '' } : null);
            return (
              <div key={m._id} className={`${styles.bubble} ${left ? styles.bubbleLeft : styles.bubbleRight}`}>
                <span className={styles.sender}>{sender?.name || 'Usuário'}{sender?.role ? ` · ${personRole(sender.role)}` : ''}</span>
                {m.text && <span>{m.text}</span>}
                {m.attachments?.map((att, i) => (att.type === 'image'
                  ? <img key={i} src={att.url} alt="anexo" className={styles.attachImg} />
                  : <a key={i} href={att.url} target="_blank" rel="noreferrer">Anexo</a>))}
                <span className={styles.time}>{fmtTime(m)}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  ) : (
    <section className={styles.chatCol} aria-label="Conversa vazia">
      <p className={styles.empty}>Escolha uma conversa para ler.</p>
    </section>
  );

  const context = selected ? (
    <aside className={styles.ctxCol} aria-label="Contexto">
      <p className={styles.cap}>Contexto</p>
      <dl className={styles.sum}>
        <div className={styles.sumRow}><dt>Tipo</dt><dd>{TYPE_LABELS[selected.type] || selected.type}</dd></div>
        <div className={styles.sumRow}><dt>Pessoa 1</dt><dd>{selected.participant1?.name} · {personRole(selected.participant1?.role)}</dd></div>
        <div className={styles.sumRow}><dt>Pessoa 2</dt><dd>{selected.participant2?.name} · {personRole(selected.participant2?.role)}</dd></div>
        {selected.supportStatus && (
          <div className={styles.sumRow}><dt>Situação</dt><dd>{STATUS_LABELS[selected.supportStatus]}</dd></div>
        )}
      </dl>
    </aside>
  ) : null;

  if (desktop) {
    return <div className={styles.cols3}>{list}{conversation}{context ?? <aside className={styles.ctxCol} aria-hidden="true" />}</div>;
  }
  return selected ? <div className={styles.stack}>{conversation}{context}</div> : list;
}

export default ConversasView;
