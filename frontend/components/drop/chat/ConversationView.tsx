import { useEffect, useRef } from 'react';
import styles from './ConversationView.module.css';
import { MessageBubble } from './MessageBubble';
import Icon from '../../Icon';
import type { Message } from './types';

export interface ConversationViewProps {
  messages: Message[];
  loading: boolean;
  currentUserId: string;
  typingName?: string;
}

/**
 * Área de mensagens do widget de chat: loading, estado vazio ou lista de
 * bolhas (MessageBubble), com auto-scroll para o fim quando `messages` muda
 * e indicador de "digitando..." quando há alguém digitando.
 */
export function ConversationView({ messages, loading, currentUserId, typingName }: ConversationViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.();
  }, [messages]);

  return (
    <div className={styles.conversation}>
      {loading ? (
        <div className={styles.status}>
          <span className={styles.spinner} />
          Carregando mensagens...
        </div>
      ) : messages.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon name="chat" size={28} />
          </span>
          Sem mensagens ainda
        </div>
      ) : (
        <div className={styles.list}>
          {messages.map((msg, idx) => (
            <MessageBubble
              key={msg._id || idx}
              message={msg}
              isOwn={msg.senderId === currentUserId}
            />
          ))}
        </div>
      )}
      {typingName && <div className={styles.typing}>digitando...</div>}
      <div ref={endRef} />
    </div>
  );
}
