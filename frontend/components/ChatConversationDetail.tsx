/**
 * 💬 Chat Conversation Detail
 *
 * Mostra a conversa específica com histórico e input para enviar mensagens.
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import Icon from './Icon';

interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  text: string;
  status: 'sent' | 'delivered' | 'read';
  readAt?: string;
  createdAt: string;
}

interface ConversationDetail {
  _id: string;
  participant1: { userId: string; name: string; role: string };
  participant2: { userId: string; name: string; role: string };
  conversationType: 'product' | 'user';
  lastMessageAt?: string;
}

interface ChatConversationDetailProps {
  conversationId: string;
  onBack?: () => void;
  currentUserId?: string;
  otherParticipantId?: string;
  otherParticipantName?: string;
}

export default function ChatConversationDetail({
  conversationId,
  onBack,
  currentUserId,
  otherParticipantId,
}: ChatConversationDetailProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Na primeira renderização da conversa o scroll vai pro fim sem animação
  // (abre já nas últimas mensagens); depois disso, mensagens novas rolam suave.
  const initialScrollDone = useRef(false);
  const { on, emit, isConnected } = useSocket();

  const userId = currentUserId || (
    typeof window !== 'undefined'
      ? (JSON.parse(localStorage.getItem('user') || '{}').id || '')
      : ''
  );

  /* ── Notification permission ── */
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  /* ── Load conversation ── */
  useEffect(() => {
    initialScrollDone.current = false; // nova conversa: reabrir já no fim
    loadConversation();
  }, [conversationId]);

  /* ── Socket listeners (via SocketContext singleton) ── */
  useEffect(() => {
    if (isConnected) {
      emit('chat:join', { conversationId });
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(on('chat:new_message', (data: Message) => {
      if (data.conversationId === conversationId) {
        // Dedup por _id: o remetente recebe o eco da própria mensagem via socket
        // (já está na sala), o que duplicava a mensagem adicionada no envio.
        setMessages(prev => (data._id && prev.some(m => m._id === data._id)) ? prev : [...prev, data]);
        if (isMinimized) {
          setUnreadCount(prev => prev + 1);
          if (Notification.permission === 'granted') {
            new Notification('Nova mensagem', {
              body: `${data.senderName}: ${data.text.substring(0, 50)}`,
              icon: '/message-icon.png',
            });
          }
        }
      }
    }));

    unsubs.push(on('chat:user_typing', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        setIsTyping(data.isTyping);
      }
    }));

    unsubs.push(on('chat:messages_read', (data: { messageIds: string[]; readAt: string }) => {
      setMessages(prev =>
        prev.map(msg =>
          data.messageIds.includes(msg._id)
            ? { ...msg, status: 'read', readAt: data.readAt }
            : msg
        )
      );
    }));

    unsubs.push(on('chat:message_delivered', (data: { messageId: string }) => {
      setMessages(prev =>
        prev.map(msg =>
          msg._id === data.messageId ? { ...msg, status: 'delivered' } : msg
        )
      );
    }));

    return () => { unsubs.forEach(u => u()); };
  }, [conversationId, currentUserId, isMinimized, on, emit, isConnected]);

  /* ── Auto-scroll + mark as read ── */
  useEffect(() => {
    if (messages.length === 0 || isMinimized) return;
    const behavior: ScrollBehavior = initialScrollDone.current ? 'smooth' : 'auto';
    // rAF garante que o layout da lista já aconteceu antes de rolar pro fim
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    });
    initialScrollDone.current = true;
    markMessagesAsRead();
  }, [messages, isMinimized]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/chat/conversations/${conversationId}`);
      setMessages(response.data.messages || []);
      setConversation(response.data.conversation);
    } catch (error) {
      console.error('Erro ao carregar conversa:', error);
    } finally {
      setLoading(false);
    }
  };

  const markMessagesAsRead = async () => {
    const unreadIds = messages
      .filter(msg => msg.status !== 'read' && msg.senderId !== currentUserId)
      .map(msg => msg._id);

    if (unreadIds.length === 0) return;
    try {
      await api.post('/chat/messages/mark-as-read', { conversationId, messageIds: unreadIds });
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    try {
      setSending(true);
      const response = await api.post('/chat/messages', {
        conversationId,
        text: messageText.trim(),
        attachments: [],
        ...(otherParticipantId && { otherParticipantId }),
      });
      // Dedup: se o eco do socket chegou antes da resposta do POST, não duplica.
      setMessages(prev => (response.data?._id && prev.some(m => m._id === response.data._id)) ? prev : [...prev, response.data]);
      setMessageText('');
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (date: string) =>
    new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const getOtherParticipant = () => {
    if (!conversation) return null;
    return currentUserId === conversation.participant1.userId.toString()
      ? conversation.participant2
      : conversation.participant1;
  };

  const otherParticipant = getOtherParticipant();

  /* ── Loading state ── */
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: 'var(--bg)',
        gap: 10,
        color: 'var(--text-muted)',
        fontSize: 14,
        fontFamily: 'var(--font-body)',
      }}>
        <div style={{
          width: 20, height: 20,
          border: '2px solid var(--line)',
          borderTopColor: 'var(--brand)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        Carregando conversa...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: 'var(--surface-chip)',
              border: '1px solid var(--line)',
              color: 'var(--text-muted)',
              fontSize: 16,
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 6,
              lineHeight: 1,
              transition: 'all var(--dur-fast) var(--ease)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--brand) 14%, transparent)'; e.currentTarget.style.color = 'var(--brand-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-chip)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            ←
          </button>
        )}

        <div style={{ flex: 1 }}>
          <div style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text-strong)',
            fontFamily: 'var(--font-display)',
          }}>
            {otherParticipant?.name || 'Conversa'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {conversation?.conversationType === 'product' ? 'Conversa de produto' : 'Conversa de usuário'}
          </div>
        </div>

        {/* Minimizar / unread badge */}
        <button
          onClick={() => {
            setIsMinimized(v => !v);
            if (isMinimized) setUnreadCount(0);
          }}
          style={{
            position: 'relative',
            background: 'var(--surface-chip)',
            border: '1px solid var(--line)',
            color: 'var(--text-muted)',
            width: 30, height: 30,
            borderRadius: 6,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13,
            transition: 'all var(--dur-fast) var(--ease)',
          }}
          title={isMinimized ? 'Restaurar' : 'Minimizar'}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--brand) 14%, transparent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-chip)'; }}
        >
          {isMinimized ? '▲' : '▼'}
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -6, right: -6,
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: '50%',
              width: 18, height: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
            }}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Messages ── */}
      {!isMinimized && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {messages.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 10,
              color: 'var(--text-subtle)',
              textAlign: 'center',
            }}>
              <div style={{ opacity: 0.4 }}><Icon name="chat" size={36} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>
                Nenhuma mensagem ainda
              </div>
              <div style={{ fontSize: 12 }}>Comece a conversa agora!</div>
            </div>
          ) : (
            messages.map(message => {
              const isOwn = message.senderId === userId;
              return (
                <div
                  key={message._id}
                  style={{
                    display: 'flex',
                    justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '72%',
                    padding: '9px 13px',
                    borderRadius: 14,
                    borderBottomRightRadius: isOwn ? 4 : 14,
                    borderBottomLeftRadius: isOwn ? 14 : 4,
                    background: isOwn ? 'var(--brand)' : 'var(--surface-2)',
                    color: isOwn ? 'var(--on-brand)' : 'var(--text-strong)',
                    border: isOwn ? 'none' : '1px solid var(--line)',
                    fontSize: 14,
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}>
                    {!isOwn && (
                      <div style={{
                        fontSize: 11,
                        fontWeight: 600,
                        marginBottom: 4,
                        color: 'var(--brand-2)',
                        letterSpacing: '0.01em',
                      }}>
                        {message.senderName}
                      </div>
                    )}
                    <div>{message.text}</div>
                    <div style={{
                      fontSize: 10,
                      marginTop: 5,
                      opacity: 0.55,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                    }}>
                      <span>{formatTime(message.createdAt)}</span>
                      {isOwn && (
                        <span style={{
                          color: message.status === 'read' ? 'var(--brand-2)' : 'var(--text-muted)',
                          fontWeight: message.status === 'read' ? 700 : 400,
                          transition: 'color var(--dur-base) var(--ease)',
                        }}
                          title={message.status}
                        >
                          {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓' : '○'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                padding: '8px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                borderBottomLeftRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>digitando</span>
                {[0, 200, 400].map(delay => (
                  <div
                    key={delay}
                    style={{
                      width: 4, height: 4,
                      borderRadius: '50%',
                      background: 'color-mix(in srgb, var(--brand) 70%, transparent)',
                      animation: `typing 1.4s ${delay}ms infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── Input ── */}
      {!isMinimized && (
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 8,
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="Escreva uma mensagem..."
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={sending}
            style={{
              flex: 1,
              padding: '9px 13px',
              background: 'var(--surface-field)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
              opacity: sending ? 0.5 : 1,
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--brand)';
              e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--brand) 16%, transparent)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={sending || !messageText.trim()}
            style={{
              padding: '9px 14px',
              background: messageText.trim() && !sending ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 30%, transparent)',
              color: 'var(--on-brand)',
              border: 'none',
              borderRadius: 8,
              cursor: sending || !messageText.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
              fontFamily: 'inherit',
              flexShrink: 0,
              transition: 'all var(--dur-fast) var(--ease)',
            }}
            onMouseEnter={e => { if (!sending && messageText.trim()) e.currentTarget.style.background = 'var(--brand-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = messageText.trim() && !sending ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 30%, transparent)'; }}
          >
            {sending ? '...' : 'Enviar'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
