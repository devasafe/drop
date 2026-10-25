import { FormEvent, useContext, useEffect, useRef, useState } from 'react';
import { Package, Send } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import SocketContext from '../../contexts/SocketContext';
import { customerOrderStatus, shortOrderCode } from '../../lib/customerOrder';
import { formatMoney } from '../../lib/money';
import { ScreenHeader } from './ScreenHeader';
import { MessageBubble } from './chat/MessageBubble';
import { orderStatusView } from './OrderStatusBadge';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import styles from './SupportThread.module.css';

export const SUPPORT_STATUS: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', resolvido: 'Resolvido' };

/** Chamado como vem de GET /support/tickets (com o resumo do pedido, quando há). */
export interface SupportTicketView {
  _id: string;
  conversationId: string;
  subject: string;
  status: 'aberto' | 'em_atendimento' | 'resolvido';
  assignedTo?: Array<{ userId: string; name: string }>;
  order?: { _id: string; storeName: string; status: string; totalValue: number; createdAt?: string } | null;
  resolvedAt?: string | null;
}

type Msg = { _id?: string; localId?: string; failed?: boolean; senderId: string; text: string; createdAt: string; conversationId?: string };

const closedAt = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Este chamado foi encerrado em ${date} às ${time}.`;
};

/**
 * Conversa de um chamado de suporte (DS v2, "Conversa com o suporte"): pedido no topo, quem atende,
 * respostas ao vivo (chat:new_message) e o bloco de encerrado (support:ticket_resolved ou 403 ao enviar),
 * com "Abrir outro chamado" levando o rascunho. Serve cliente, loja e motoboy.
 */
export function SupportThread({ ticket, onBack, onNewTicket, initialText = '' }: {
  ticket: SupportTicketView;
  onBack: () => void;
  onNewTicket: (draft: string) => void;
  /** Rascunho trazido do chamado encerrado ("Abrir outro chamado"). */
  initialText?: string;
}) {
  const { user } = useAuth() || ({} as any);
  const me = String(user?._id ?? user?.id ?? '');
  const socket = useContext(SocketContext);
  const { conversationId, order } = ticket;
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState(ticket.status);
  const [resolvedAt, setResolvedAt] = useState<string | null>(ticket.resolvedAt ?? null);
  const [joined, setJoined] = useState<string | null>(null);
  const localSeq = useRef(0);

  useEffect(() => {
    let off = false;
    api.get(`/chat/conversations/${conversationId}/messages`)
      .then((r) => { if (!off) setMsgs(Array.isArray(r.data) ? r.data : r.data?.messages ?? []); })
      .catch(() => { if (!off) setMsgs([]); });
    return () => { off = true; };
  }, [conversationId]);

  // Mensagem nova (inclusive a própria, que volta pelo socket): entra uma vez só.
  const addMessage = (m: Msg) => setMsgs((prev) => {
    const list = prev || [];
    return m._id && list.some((x) => x._id === m._id) ? list : [...list, m];
  });

  useEffect(() => {
    if (!socket?.on) return undefined;
    const mine = (d: any) => d?.conversationId === conversationId || (d?.ticketId && d.ticketId === ticket._id);
    const offs = [
      socket.on('chat:new_message', (d: any) => { if (d?.conversationId === conversationId) addMessage(d); }),
      socket.on('support:ticket_updated', (d: any) => {
        if (!mine(d)) return;
        if (d.status) setStatus(d.status);
        if (d.attendantName) setJoined(String(d.attendantName).split(' ')[0]);
      }),
      socket.on('support:ticket_resolved', (d: any) => {
        if (!mine(d)) return;
        setStatus('resolvido');
        setResolvedAt(new Date().toISOString());
      }),
    ];
    return () => offs.forEach((off) => off?.());
  }, [socket, conversationId, ticket._id]);

  const post = async (body: string, localId?: string) => {
    try {
      const r = await api.post(`/chat/conversations/${conversationId}/messages`, { text: body });
      setMsgs((prev) => {
        const list = (prev || []).filter((m) => m.localId !== localId);
        return r.data?._id && list.some((m) => m._id === r.data._id) ? list : [...list, r.data];
      });
    } catch (err: any) {
      if (err?.response?.status === 403) {
        // Chamado encerrado: o texto não se perde, vai para o chamado novo.
        setMsgs((prev) => (prev || []).filter((m) => m.localId !== localId));
        setText(body);
        setStatus('resolvido');
        setResolvedAt((v) => v ?? new Date().toISOString());
        return;
      }
      const id = localId ?? `local-${++localSeq.current}`;
      setMsgs((prev) => {
        const list = prev || [];
        return list.some((m) => m.localId === id)
          ? list.map((m) => (m.localId === id ? { ...m, failed: true } : m))
          : [...list, { localId: id, failed: true, senderId: me, text: body, createdAt: new Date().toISOString() }];
      });
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    post(body);
  };

  const retry = (m: Msg) => {
    setMsgs((prev) => (prev || []).map((x) => (x.localId === m.localId ? { ...x, failed: false } : x)));
    post(m.text, m.localId);
  };

  const resolved = status === 'resolvido';
  const code = order ? shortOrderCode(order._id) : null;

  return (
    <div className={styles.wrap}>
      <ScreenHeader title="Suporte DROP" onBack={onBack} as="h2" />
      <div className={styles.sub}>
        <span className={styles.subject}>{code ? `Chamado sobre o pedido #${code}` : ticket.subject}</span>
        <span className={resolved ? styles.done : styles.open}>{SUPPORT_STATUS[status] ?? status}</span>
      </div>

      {order && code && (
        <div className={styles.order}>
          <span className={styles.orderIco} aria-hidden="true"><Package size={18} /></span>
          <span className={styles.orderTx}>
            <b>{`#${code} · ${order.storeName}`}</b>
            <span>{`${orderStatusView(customerOrderStatus(order)).label} · ${formatMoney(Number(order.totalValue) || 0)}`}</span>
          </span>
        </div>
      )}

      {status === 'aberto' && (
        <div className={styles.banner}>
          <Alert tone="info" title="Recebemos seu chamado">A resposta aparece aqui sozinha.</Alert>
        </div>
      )}

      <div className={styles.thread} aria-live="polite">
        {msgs === null ? <Skeleton height={44} /> : msgs.length === 0
          ? <p className={styles.empty}>Conte o que aconteceu. A gente responde por aqui.</p>
          : msgs.map((m, i) => (
            <div key={m._id ?? m.localId ?? i} className={styles.msg}>
              <MessageBubble message={m as any} isOwn={String(m.senderId) === me} />
              {m.failed && (
                <button type="button" className={styles.retry} onClick={() => retry(m)}>Tentar de novo</button>
              )}
            </div>
          ))}
        {joined && <p className={styles.system}>{`${joined}, do suporte, entrou na conversa`}</p>}
      </div>

      {resolved ? (
        <div className={styles.closed}>
          <p className={styles.closedText}>{closedAt(resolvedAt)}</p>
          <Button onClick={() => onNewTicket(text.trim())}>Abrir outro chamado</Button>
        </div>
      ) : (
        <form className={styles.composer} onSubmit={send}>
          <input aria-label="Mensagem" placeholder="Escrever mensagem" value={text} onChange={(e) => setText(e.target.value)} className={styles.input} maxLength={2000} />
          <button type="submit" className={styles.send} aria-label="Enviar" disabled={!text.trim()}><Send size={20} aria-hidden="true" /></button>
        </form>
      )}
    </div>
  );
}
