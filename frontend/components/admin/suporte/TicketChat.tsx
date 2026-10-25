import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { MessageBubble } from '../../drop/chat/MessageBubble';
import { Skeleton } from '../../ui/Skeleton';
import styles from './TicketChat.module.css';

export interface TicketChatProps {
  /** Conversa do chamado: o socket entrega ao atendente as mensagens de todos os chamados que ele assumiu. */
  conversationId?: string;
  messages: any[];
  userId: string;
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
  /** Sem resposta: chamado resolvido ou ainda não assumido. */
  isFinalized?: boolean;
  finalizedMessage?: string;
  /** Primeiro nome de quem abriu, para o campo ("Escrever para Lia"). */
  recipientName?: string;
}

/**
 * Conversa do chamado no admin (DS v2, tema claro): as mesmas bolhas da conversa do cliente, no
 * lugar do ChatPanel escuro. As mensagens novas chegam pelo socket (useChat) e entram em `messages`.
 */
export function TicketChat({ conversationId, messages: all, userId, onSendMessage, isLoading, isFinalized, finalizedMessage, recipientName }: TicketChatProps) {
  const messages = conversationId ? all.filter((m) => !m.conversationId || m.conversationId === conversationId) : all;
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    onSendMessage(body);
  };
  const label = recipientName ? `Escrever para ${recipientName}` : 'Mensagem';

  return (
    <div className={styles.wrap}>
      <div className={styles.thread} aria-live="polite">
        {isLoading ? (
          <div aria-label="Carregando conversa" aria-busy="true" className={styles.loading}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : messages.length === 0 ? (
          <p className={styles.empty}>Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((m, i) => <MessageBubble key={m._id ?? i} message={m} isOwn={String(m.senderId) === String(userId)} />)
        )}
        <div ref={end} />
      </div>
      {isFinalized ? (
        <p className={styles.closed}>{finalizedMessage}</p>
      ) : (
        <form className={styles.composer} onSubmit={send}>
          <input aria-label={label} placeholder={`${label}…`} value={text} onChange={(e) => setText(e.target.value)} className={styles.input} maxLength={2000} />
          <button type="submit" className={styles.send} aria-label="Enviar" disabled={!text.trim()}><Send size={18} aria-hidden="true" /></button>
        </form>
      )}
    </div>
  );
}

export default TicketChat;
