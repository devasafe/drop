/**
 * 💬 Chat Conversation List
 *
 * Componente tipo WhatsApp que mostra lista de conversas pré-compra.
 * Diferencia conversas de PRODUTO vs USUÁRIO.
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import Icon from './Icon';

interface ConversationItem {
  _id: string;
  participant1: { userId: string; name: string; role: string };
  participant2: { userId: string; name: string; role: string };
  otherParticipant: { userId: string; name: string; role: string };
  productId?: string;
  conversationType: 'product' | 'user';
  messageCount: number;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage?: {
    text: string;
    senderName: string;
    createdAt: string;
  };
}

interface ChatConversationListProps {
  filter?: 'all' | 'product' | 'user';
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId?: string;
  storeId?: string;
}

export default function ChatConversationList({
  filter = 'all',
  onSelectConversation,
  selectedConversationId,
  storeId
}: ChatConversationListProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadConversations();
  }, [filter]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter !== 'all') params.conversationType = filter;

      const response = await api.get('/chat/conversations/pre-purchase/list', { params });
      setConversations(response.data.conversations || []);
    } catch (error) {
      console.error('Erro ao carregar conversas:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.otherParticipant.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (date: string) => {
    const d = new Date(date);
    const diffMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMinutes < 1) return 'Agora';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
    return d.toLocaleDateString('pt-BR');
  };

  const filterButtons: Array<{ key: 'all' | 'product' | 'user'; label: string }> = [
    { key: 'all',     label: `Todos (${conversations.length})` },
    { key: 'product', label: 'Produto' },
    { key: 'user',    label: 'Usuário' },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface)',
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <input
          type="text"
          placeholder="Buscar conversa..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '9px 12px',
            background: 'var(--surface-field)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--text)',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
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

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6 }}>
          {filterButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setSearchTerm('')}
              style={{
                padding: '5px 12px',
                background: filter === btn.key ? 'var(--brand)' : 'var(--surface-chip)',
                color: filter === btn.key ? 'var(--on-brand)' : 'var(--text-muted)',
                border: `1px solid ${filter === btn.key ? 'var(--brand)' : 'var(--line)'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all var(--dur-fast) var(--ease)',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 14 }}>
            Carregando conversas...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ marginBottom: 12, opacity: 0.4 }}><Icon name="chat" size={32} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Nenhuma conversa
            </div>
            <div style={{ fontSize: 12 }}>
              {searchTerm ? 'Nenhum resultado encontrado' : 'Clientes ainda não iniciaram conversa'}
            </div>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isSelected = selectedConversationId === conv._id;
            return (
              <div
                key={conv._id}
                onClick={() => onSelectConversation(conv._id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--divider)',
                  cursor: 'pointer',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--brand) 12%, transparent)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid var(--brand)'
                    : '2px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'background var(--dur-fast) var(--ease)',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-chip)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  }
                }}
              >
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: 'var(--text-strong)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {conv.otherParticipant.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: conv.conversationType === 'product'
                        ? 'color-mix(in srgb, var(--rating) 14%, transparent)'
                        : 'color-mix(in srgb, var(--info) 14%, transparent)',
                      color: conv.conversationType === 'product' ? 'var(--rating)' : 'var(--info)',
                      border: `1px solid ${conv.conversationType === 'product' ? 'color-mix(in srgb, var(--rating) 25%, transparent)' : 'color-mix(in srgb, var(--info) 25%, transparent)'}`,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      flexShrink: 0,
                    }}>
                      {conv.conversationType === 'product' ? 'Produto' : 'Usuário'}
                    </span>
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {conv.lastMessage ? (
                      <>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                          {conv.lastMessage.senderName}:
                        </span>{' '}
                        {conv.lastMessage.text}
                      </>
                    ) : (
                      <em style={{ opacity: 0.6 }}>Nenhuma mensagem ainda</em>
                    )}
                  </div>
                </div>

                {/* Hora + unread */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                    {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                  </span>

                  {conv.unreadCount > 0 && (
                    <div style={{
                      background: 'var(--brand)',
                      color: 'var(--on-brand)',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
