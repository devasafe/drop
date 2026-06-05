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
      backgroundColor: '#111111',
      fontFamily: "'Inter', sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
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
            background: '#161616',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            fontSize: 13,
            color: 'rgba(255,255,255,0.92)',
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = '#6C2BD9';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,43,217,0.12)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
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
                background: filter === btn.key ? '#6C2BD9' : 'rgba(255,255,255,0.05)',
                color: filter === btn.key ? '#fff' : 'rgba(255,255,255,0.45)',
                border: `1px solid ${filter === btn.key ? '#6C2BD9' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
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
          <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            Carregando conversas...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.35)' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}><Icon name="chat" size={36} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
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
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer',
                  background: isSelected
                    ? 'rgba(108,43,217,0.12)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid #6C2BD9'
                    : '2px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
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
                      color: 'rgba(255,255,255,0.92)',
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
                        ? 'rgba(245,158,11,0.12)'
                        : 'rgba(56,189,248,0.12)',
                      color: conv.conversationType === 'product' ? '#F59E0B' : '#38BDF8',
                      border: `1px solid ${conv.conversationType === 'product' ? 'rgba(245,158,11,0.2)' : 'rgba(56,189,248,0.2)'}`,
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      flexShrink: 0,
                    }}>
                      {conv.conversationType === 'product' ? 'Produto' : 'Usuário'}
                    </span>
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.4)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {conv.lastMessage ? (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
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
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}
                  </span>

                  {conv.unreadCount > 0 && (
                    <div style={{
                      background: '#6C2BD9',
                      color: '#fff',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      boxShadow: '0 0 8px rgba(108,43,217,0.5)',
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
