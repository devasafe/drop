import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';

interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  text: string;
  attachments?: any[];
  status: 'sent' | 'delivered' | 'read';
  readAt?: Date;
  createdAt: Date;
}

interface UseChartOptions {
  token: string;
  socketUrl?: string;
  userId: string;
}

/**
 * Custom Hook para Chat em Tempo Real
 *
 * Usa o socket singleton via SocketContext — NÃO cria conexão própria.
 * Isso evita múltiplas sessões Socket.io na mesma aba (que causavam
 * "Invalid namespace" no servidor).
 */
export function useChat(options: UseChartOptions) {
  const { userId } = options;

  const { on, emit, isConnected } = useSocket();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<
    { userId: string; userName: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Listeners de eventos de chat — registrados via SocketContext.
   */
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      on('chat:new_message', (data: Message) => {
        setMessages((prev) => {
          if (data._id && prev.some((m) => m._id === data._id)) return prev;
          return [...prev, data];
        });
      })
    );

    unsubs.push(
      on('chat:user_typing', (data: { userId: string; userName: string; isTyping: boolean }) => {
        if (data.isTyping) {
          setTypingUsers((prev) => {
            if (!prev.find((u) => u.userId === data.userId)) {
              return [...prev, { userId: data.userId, userName: data.userName }];
            }
            return prev;
          });
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        }
      })
    );

    unsubs.push(
      on('chat:message_read', (data: { messageId: string; userId: string; readAt: Date }) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === data.messageId
              ? { ...msg, status: 'read', readAt: new Date(data.readAt) }
              : msg
          )
        );
      })
    );

    unsubs.push(on('chat:user_joined', () => {}));
    unsubs.push(on('chat:user_left', () => {}));

    unsubs.push(
      on('chat:error', (data: { message: string }) => {
        setError(data.message);
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [on]);

  /**
   * Entrar em uma conversa
   */
  const joinConversation = useCallback(
    (convId: string) => {
      if (!isConnected) {
        setError('Socket não está conectado');
        return;
      }
      setConversationId(convId);
      emit('chat:join', { conversationId: convId, userId });
    },
    [emit, isConnected, userId]
  );

  const leaveConversation = useCallback(
    (convId: string) => {
      if (!isConnected) return;
      emit('chat:leave', { conversationId: convId, userId });
      setConversationId(null);
      setMessages([]);
    },
    [emit, isConnected, userId]
  );

  /**
   * Enviar mensagem (deve ser chamado após POST na API)
   */
  const sendMessage = useCallback(
    (text: string, attachments?: any[]) => {
      if (!isConnected) {
        setError('Socket não está conectado');
        return;
      }
      if (!conversationId) {
        setError('Nenhuma conversa selecionada');
        return;
      }
      emit('chat:message', { conversationId, text, attachments });
      emit('chat:typing', { conversationId, isTyping: false });
    },
    [emit, isConnected, conversationId]
  );

  /**
   * Marcar mensagem como lida (deve ser chamado após PUT na API)
   */
  const markAsRead = useCallback(
    (messageId: string) => {
      if (!isConnected || !conversationId) return;
      emit('chat:mark_read', { conversationId, messageId });
    },
    [emit, isConnected, conversationId]
  );

  /**
   * Indicador de digitação
   */
  const setUserTyping = useCallback(
    (typing: boolean) => {
      if (!isConnected || !conversationId) return;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (typing) {
        setIsTyping(true);
        emit('chat:typing', { conversationId, isTyping: true });

        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          emit('chat:typing', { conversationId, isTyping: false });
        }, 3000);
      } else {
        setIsTyping(false);
        emit('chat:typing', { conversationId, isTyping: false });
      }
    },
    [emit, isConnected, conversationId]
  );

  /**
   * Limpar timeout no unmount
   */
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Conexão (socket compat — null, callers não devem mais ler)
    socket: null,
    isConnected,
    error,

    // Conversa
    conversationId,
    joinConversation,
    leaveConversation,

    // Mensagens
    messages,
    setMessages,
    sendMessage,
    markAsRead,

    // Digitação
    isTyping,
    setUserTyping,
    typingUsers,
  };
}

export default useChat;
