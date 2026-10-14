import { useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { useChat } from '../../../hooks/useChat';
import { useAuth } from '../../../contexts/AuthContext';
import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { ConversationView } from '../../drop/chat/ConversationView';
import { ChatComposer } from '../../drop/chat/ChatComposer';
import { QUICK_REPLIES } from '../../../lib/chatQuickReplies';
import styles from './RideChatSheet.module.css';

export type RideChatKind = 'loja_motoboy' | 'motoboy_cliente';

export interface RideChatSheetProps {
  open: boolean;
  onClose: () => void;
  deliveryId: string;
  orderId: string;
  kind: RideChatKind;
  /** loja_motoboy: id da LOJA (o servidor acha o dono). motoboy_cliente: id do cliente. */
  otherParticipantId: string;
  otherName: string;
}

const MAX_TEXT = 1000; // limite do sendMessage no servidor

/** Conversa da corrida (retirada: loja; entrega: cliente). Só mostra mensagens desta conversa. */
export function RideChatSheet({ open, onClose, deliveryId, orderId, kind, otherParticipantId, otherName }: RideChatSheetProps) {
  const { user } = useAuth();
  const me = String((user as any)?.id ?? (user as any)?._id ?? '');
  const chat = useChat({ token: '', userId: me });
  const [convId, setConvId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState(false);
  const joined = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !deliveryId) return undefined;
    if (!otherParticipantId) { setFailed(true); return undefined; }
    let off = false;
    setFailed(false);
    setConvId(null);
    api.post('/chat/conversations', { type: kind, otherParticipantId, orderId, deliveryId })
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
  }, [open, deliveryId, orderId, kind, otherParticipantId, attempt]);

  const send = async (t: string) => {
    const body = t.trim().slice(0, MAX_TEXT);
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

  // Lição da Task 68 (D1): `chat:new_message` chega de todas as conversas; o fio só mostra esta.
  const thread = convId
    ? chat.messages.filter((m: any) => !m.conversationId || String(m.conversationId) === convId)
    : [];
  const replies = kind === 'loja_motoboy' ? QUICK_REPLIES.motoboyLoja : QUICK_REPLIES.motoboyCliente;

  return (
    <Sheet open={open} onClose={onClose} presentation="bottom" title={`Conversa com ${otherName}`}>
      <div className={styles.body}>
        <Alert tone="warning">Não combine pagamento fora do app. O código de entrega o cliente diz pessoalmente.</Alert>
        <section className={styles.thread} aria-live="polite" aria-label="Mensagens">
          {failed ? (
            <Alert tone="error" title="Não abrimos a conversa" action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}>
              Confira sua conexão.
            </Alert>
          ) : (
            <ConversationView messages={thread as any} loading={!convId} currentUserId={me} />
          )}
        </section>
        <div className={styles.quick}>
          {replies.map((q) => (
            <button key={q} type="button" className={styles.chip} onClick={() => send(q)} disabled={!convId}>{q}</button>
          ))}
        </div>
        {sendError && <p role="alert" className={styles.error}>A mensagem não foi. Toque em enviar para tentar de novo.</p>}
        <ChatComposer value={text} onChange={setText} onSend={() => send(text)} disabled={!convId || !text.trim()} />
      </div>
    </Sheet>
  );
}

export default RideChatSheet;
