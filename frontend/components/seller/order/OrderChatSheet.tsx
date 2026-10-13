import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import api from '../../../lib/api';
import { useChat } from '../../../hooks/useChat';
import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { Skeleton } from '../../ui/Skeleton';
import { MessageBubble } from '../../drop/chat/MessageBubble';
import { QUICK_REPLIES } from '../../../lib/chatQuickReplies';
import styles from './OrderChatSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  order: any;
  currentUserId: string;
}

/** Conversa loja↔cliente ligada ao pedido (mesma conversa que o modal antigo abria). */
export function OrderChatSheet({ open, onClose, order, currentUserId }: Props) {
  const chat = useChat({ token: '', userId: currentUserId });
  const [convId, setConvId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState(false);
  const joined = useRef<string | null>(null);

  const customerId = order?.customerId || order?.customerObj?._id;
  const first = String(order?.customerName || 'Cliente').split(' ')[0];

  useEffect(() => {
    if (!open || !order?._id) return;
    if (!customerId) { setFailed(true); return; }
    let off = false;
    setFailed(false);
    setConvId(null);
    api.post('/chat/conversations', { type: 'loja_cliente', otherParticipantId: customerId, orderId: order._id })
      .then(async (r: any) => {
        const cid = String(r?.data?._id ?? r?.data?.conversationId ?? '');
        if (!cid) throw new Error('conversa não retornada');
        const msgs = await api.get(`/chat/conversations/${cid}/messages`);
        if (off) return;
        chat.setMessages(msgs?.data?.messages ?? msgs?.data ?? []);
        chat.joinConversation(cid);
        joined.current = cid;
        setConvId(cid);
      })
      .catch(() => { if (!off) setFailed(true); });
    return () => {
      off = true;
      if (joined.current) {
        chat.leaveConversation(joined.current);
        joined.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?._id, customerId, attempt]);

  const send = async (t: string) => {
    const body = t.trim();
    if (!body || !convId) return;
    setText('');
    setSendError(false);
    try {
      const r = await api.post(`/chat/conversations/${convId}/messages`, { text: body });
      const sent = r?.data?.message ?? r?.data;
      if (sent?._id) chat.setMessages((prev: any[]) => (prev.some((m) => m._id === sent._id) ? prev : [...prev, sent]));
    } catch {
      setText(body);
      setSendError(true);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} presentation="bottom" title={`Conversa com ${first}`}>
      <div className={styles.body}>
        <Alert tone="warning">Não peça pagamento fora do app nem passe o PIN de entrega por aqui.</Alert>
        <section className={styles.thread} aria-live="polite" aria-label="Mensagens">
          {failed ? (
            <Alert tone="error" title="Não abrimos a conversa" action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}>
              Confira sua conexão.
            </Alert>
          ) : !convId ? (
            <>
              <Skeleton height={44} />
              <Skeleton height={44} />
            </>
          ) : (
            chat.messages.map((m: any) => <MessageBubble key={m._id} message={m} isOwn={String(m.senderId) === currentUserId} />)
          )}
        </section>
        <div className={styles.quick}>
          {QUICK_REPLIES.lojista.map((q) => (
            <button key={q} type="button" className={styles.chip} onClick={() => send(q)} disabled={!convId}>{q}</button>
          ))}
        </div>
        {sendError && <p role="alert" className={styles.error}>A mensagem não foi. Toque em enviar para tentar de novo.</p>}
        <form
          className={styles.composer}
          onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }}
        >
          <input aria-label="Mensagem" placeholder="Escrever mensagem" value={text} onChange={(e) => setText(e.target.value)} className={styles.input} maxLength={2000} />
          <button type="submit" className={styles.send} aria-label="Enviar" disabled={!text.trim() || !convId}>
            <Send size={20} aria-hidden="true" />
          </button>
        </form>
      </div>
    </Sheet>
  );
}
