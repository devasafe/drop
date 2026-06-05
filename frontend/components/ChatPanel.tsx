import React, { useEffect, useRef } from 'react';
import styles from './ChatPanel.module.css';
import ChatBubble from './ChatBubble';

interface Message {
  _id: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  text: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
}

interface ChatPanelProps {
  conversationId: string;
  userId: string;
  messages: Message[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  typingUsers?: Array<{ userId: string; userName: string }>;
  onSendMessage: (text: string) => void;
  onMarkAsRead: (messageId: string) => void;
  onUserTyping: (isTyping: boolean) => void;
  title?: string;
  subtitle?: string;
  onFinalize?: () => void;
  isFinalized?: boolean;
  finalizedMessage?: string;
}

/**
 * Painel principal de chat
 *
 * @example
 * <ChatPanel
 *   conversationId={conversation._id}
 *   userId={user._id}
 *   messages={messages}
 *   onSendMessage={handleSendMessage}
 *   onMarkAsRead={handleMarkAsRead}
 *   onUserTyping={handleTyping}
 * />
 */
export const ChatPanel: React.FC<ChatPanelProps> = ({
  conversationId,
  userId,
  messages,
  isLoading,
  onLoadMore,
  typingUsers = [],
  onSendMessage,
  onMarkAsRead,
  onUserTyping,
  title = 'Chat',
  subtitle,
  onFinalize,
  isFinalized = false,
  finalizedMessage,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [isComposing, setIsComposing] = React.useState(false);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  /**
   * Marcar mensagens como lidas ao aparecer
   */
  useEffect(() => {
    messages.forEach((msg) => {
      if (msg.status !== 'read' && msg.senderId !== userId) {
        // Pequeno delay para simular leitura natural
        const timer = setTimeout(() => {
          onMarkAsRead(msg._id);
        }, 500);

        return () => clearTimeout(timer);
      }
    });
  }, [messages, userId, onMarkAsRead]);

  /**
   * Enviar mensagem
   */
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    onSendMessage(inputValue);
    setInputValue('');
    onUserTyping(false);
  };

  /**
   * Lidar com digitação
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    onUserTyping(value.length > 0);
  };

  return (
    <div className={styles.chatPanel}>
      {/* Cabeçalho */}
      <div className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h3>{title}</h3>
          {subtitle && <span className={styles.subtitleBadge}>{subtitle}</span>}
        </div>
        <div className={styles.info}>
          {onFinalize && !isFinalized && (
            <button className={styles.finalizeBtn} onClick={onFinalize}>
              Finalizar atendimento
            </button>
          )}
          {isFinalized && (
            <span className={styles.finalizedBadge}>Atendimento encerrado</span>
          )}
        </div>
      </div>

      {/* Área de mensagens */}
      <div className={styles.messagesContainer} ref={messagesContainerRef}>
        {isLoading && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Carregando mensagens...
          </div>
        )}

        {messages.length === 0 && (
          <div className={styles.empty}>
            Nenhuma mensagem ainda. Comece uma conversa!
          </div>
        )}

        {messages.map((message) => (
          <ChatBubble
            key={message._id}
            message={message}
            isOwn={message.senderId === userId}
            onMarkAsRead={onMarkAsRead}
          />
        ))}

        {typingUsers.length > 0 && (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDots}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
            <span>{typingUsers.map(u => u.userName).join(', ')} está digitando</span>
          </div>
        )}

      </div>

      {/* Input de mensagem */}
      {isFinalized ? (
        <div className={styles.finalizedNotice}>
          {finalizedMessage ?? 'Este atendimento foi encerrado. Abra um novo ticket se precisar de ajuda.'}
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className={styles.inputContainer}>
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder="Digite uma mensagem..."
            className={styles.input}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading || isComposing}
            className={styles.sendButton}
          >
            📤
          </button>
        </form>
      )}
    </div>
  );
};

export default ChatPanel;
