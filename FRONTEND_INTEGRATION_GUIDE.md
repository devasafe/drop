# 📱 Chat System - Frontend Integration Guide

## 🎯 Exemplo de Integração Completa

### 1. Página de Pedido do Cliente

**Arquivo: `pages/cliente/pedido/[id].tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useChat from '../../../frontend/hooks/useChat';
import ChatPanel from '../../../frontend/components/ChatPanel';
import ChatInput from '../../../frontend/components/ChatInput';
import api from '../../../services/api';

interface Order {
  _id: string;
  number: string;
  store: { _id: string; name: string };
  delivery?: { _id: string; driver: { _id: string; name: string } };
}

export default function OrderDetailPage() {
  const router = useRouter();
  const { id: orderId } = router.query;
  const [order, setOrder] = useState<Order | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Obter token do localStorage
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('token') 
    : null;

  // Setup do chat
  const {
    socket,
    isConnected,
    messages,
    joinConversation,
    leaveConversation,
    sendMessage,
    markAsRead,
    setUserTyping,
    typingUsers,
    error: chatError
  } = useChat({
    token: token || '',
    userId: 'current_user_id' // Obter do contexto/store
  });

  /**
   * Carregar dados do pedido
   */
  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const response = await api.get(`/orders/${orderId}`);
        setOrder(response.data);
      } catch (error) {
        console.error('Erro ao carregar pedido:', error);
      }
    };

    fetchOrder();
  }, [orderId]);

  /**
   * Criar ou obter conversa com a loja
   */
  useEffect(() => {
    if (!socket || !isConnected || !order) return;

    const createOrGetConversation = async () => {
      try {
        setLoading(true);
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_cliente',
          participant1: {
            userId: order.store._id,
            role: 'loja',
            name: order.store.name
          },
          orderId: order._id
        });

        const convId = response.data._id;
        setConversationId(convId);

        // Entrar na sala
        joinConversation(convId);

        // Carregar mensagens
        await loadMessages(convId);
      } catch (error) {
        console.error('Erro ao criar conversa:', error);
      } finally {
        setLoading(false);
      }
    };

    createOrGetConversation();
  }, [socket, isConnected, order]);

  /**
   * Carregar mensagens da API
   */
  const loadMessages = async (convId: string) => {
    try {
      const response = await api.get(`/api/chat/conversations/${convId}`);
      // Messages já são carregadas via socket
      console.log('Mensagens carregadas:', response.data.messages.length);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  /**
   * Enviar mensagem
   */
  const handleSendMessage = async (text: string, attachments?: any[]) => {
    if (!conversationId || !isConnected) return;

    try {
      // Primeiro salvar na API
      await api.post('/api/chat/messages', {
        conversationId,
        text,
        attachments
      });

      // Socket.io faz o broadcast automaticamente
      sendMessage(text, attachments);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  /**
   * Marcar como lido
   */
  const handleMarkAsRead = async (messageId: string) => {
    if (!conversationId) return;

    try {
      await api.put(`/api/chat/messages/${messageId}/read`);
      markAsRead(messageId);
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  /**
   * Indicador de digitação
   */
  const handleUserTyping = (isTyping: boolean) => {
    setUserTyping(isTyping);
  };

  /**
   * Sair do chat
   */
  useEffect(() => {
    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId]);

  if (!order) return <div>Carregando pedido...</div>;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Detalhes do pedido */}
      <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #ccc' }}>
        <h1>Pedido #{order.number}</h1>
        <p>Loja: {order.store.name}</p>
        {order.delivery && (
          <p>Entregador: {order.delivery.driver.name}</p>
        )}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {chatError && (
          <div style={{
            padding: '10px',
            background: '#fee',
            color: '#c00',
            borderBottom: '1px solid #ccc'
          }}>
            Erro: {chatError}
          </div>
        )}

        {!isConnected && (
          <div style={{
            padding: '10px',
            background: '#ffd700',
            color: '#000',
            borderBottom: '1px solid #ccc'
          }}>
            Conectando ao chat...
          </div>
        )}

        <ChatPanel
          conversationId={conversationId || ''}
          userId="current_user_id"
          messages={messages}
          isLoading={loading}
          typingUsers={typingUsers}
          onSendMessage={handleSendMessage}
          onMarkAsRead={handleMarkAsRead}
          onUserTyping={handleUserTyping}
        />

        <ChatInput
          onSendMessage={handleSendMessage}
          onTyping={handleUserTyping}
          disabled={!isConnected || loading}
        />
      </div>
    </div>
  );
}
```

### 2. Página de Entrega do Motoboy

**Arquivo: `pages/motoboy/delivery/[id].tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import useChat from '../../../frontend/hooks/useChat';
import ChatPanel from '../../../frontend/components/ChatPanel';
import ChatInput from '../../../frontend/components/ChatInput';
import api from '../../../services/api';

interface Delivery {
  _id: string;
  order: { _id: string };
  driver: { _id: string; name: string };
  store: { _id: string; name: string };
}

export default function DeliveryPage() {
  const { id: deliveryId } = useRouter().query;
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatType, setChatType] = useState<'loja' | 'cliente'>('loja');

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('token')
    : null;

  const { socket, isConnected, messages, joinConversation } = useChat({
    token: token || '',
    userId: 'current_motoboy_id'
  });

  /**
   * Iniciar chat com loja ou cliente
   */
  const startChat = async (type: 'loja' | 'cliente') => {
    if (!delivery || !socket || !isConnected) return;

    try {
      const conversationType = type === 'loja' 
        ? 'loja_motoboy' 
        : 'motoboy_cliente';

      const response = await api.post('/api/chat/conversations', {
        type: conversationType,
        orderId: delivery.order._id,
        deliveryId: delivery._id
      });

      setConversationId(response.data._id);
      setChatType(type);
      joinConversation(response.data._id);
    } catch (error) {
      console.error('Erro ao iniciar chat:', error);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <button onClick={() => startChat('loja')}>
        Chat com Loja
      </button>
      <button onClick={() => startChat('cliente')}>
        Chat com Cliente
      </button>

      {conversationId && (
        <>
          <ChatPanel
            conversationId={conversationId}
            userId="current_motoboy_id"
            messages={messages}
            onSendMessage={handleSendMessage}
            onMarkAsRead={handleMarkAsRead}
            onUserTyping={handleUserTyping}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            onTyping={handleUserTyping}
          />
        </>
      )}
    </div>
  );
}
```

### 3. Página de Pedido da Loja

**Arquivo: `pages/loja/pedidos/[id].tsx`**

Segue o mesmo padrão, mas:
- Pode iniciar chats com múltiplos clientes
- Pode iniciar chat com motoboy após designar entrega
- Precisa gerenciar múltiplas conversas simultaneamente

```typescript
const handleNewConversation = async (participantId: string, type: string) => {
  const response = await api.post('/api/chat/conversations', {
    type,
    participant2: { userId: participantId },
    orderId: orderId
  });

  // Adicionar conversa à lista
  setConversations(prev => [...prev, response.data]);
};
```

## 🎨 Estilos CSS

### ChatPanel.module.css

```css
.chatPanel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
}

.header {
  padding: 15px;
  border-bottom: 1px solid #ddd;
  background: #f5f5f5;
}

.messagesContainer {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inputContainer {
  padding: 15px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 10px;
}

.input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.sendButton {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.sendButton:hover {
  background: #0056b3;
}

.sendButton:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.typing {
  font-size: 12px;
  color: #666;
  font-style: italic;
}
```

### ChatBubble.module.css

```css
.bubble {
  padding: 10px 15px;
  border-radius: 8px;
  max-width: 70%;
  word-wrap: break-word;
}

.own {
  background: #007bff;
  color: white;
  margin-left: auto;
  border-radius: 8px 8px 0 8px;
}

.other {
  background: #f0f0f0;
  color: #333;
  margin-right: auto;
  border-radius: 8px 8px 8px 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  margin-bottom: 5px;
  gap: 10px;
}

.senderInfo {
  display: flex;
  align-items: center;
  gap: 5px;
}

.senderName {
  font-weight: bold;
}

.roleBadge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.3);
  color: white;
}

.own .roleBadge {
  background: rgba(0,0,0,0.2);
}

.other .roleBadge {
  background: #ddd;
  color: #333;
}

.roleBadge.loja {
  background: #28a745;
}

.roleBadge.cliente {
  background: #007bff;
}

.roleBadge.motoboy {
  background: #ff6b6b;
}

.time {
  font-size: 11px;
  opacity: 0.7;
}

.content {
  margin: 5px 0;
}

.text {
  margin: 0;
  line-height: 1.4;
}

.attachments {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
}

.attachment {
  max-width: 250px;
}

.attachment img {
  max-width: 100%;
  border-radius: 4px;
}

.location,
.file {
  background: rgba(0,0,0,0.1);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
}

.footer {
  font-size: 11px;
  margin-top: 3px;
  opacity: 0.7;
}

.footer.read {
  color: #0099ff;
}
```

### ChatInput.module.css

```css
.chatInput {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px;
  border-top: 1px solid #ddd;
  background: #f9f9f9;
}

.attachmentsPreview {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.attachmentPreview {
  position: relative;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.imagePreview {
  position: relative;
  width: 80px;
  height: 80px;
}

.imagePreview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.removeButton {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inputGroup {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.actions {
  display: flex;
  gap: 5px;
}

.actionButton {
  padding: 8px 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.actionButton:hover {
  background: #e0e0e0;
}

.textarea {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  resize: none;
  min-height: 40px;
}

.sendButton {
  padding: 10px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.sendButton:hover {
  background: #0056b3;
}

.sendButton:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

## ✅ Checklist de Integração Frontend

- [ ] Instalar socket.io-client: `npm install socket.io-client`
- [ ] Copiar `useChat.ts` para `frontend/hooks/`
- [ ] Copiar componentes para `frontend/components/`
- [ ] Copiar CSS modules para mesma pasta dos componentes
- [ ] Integrar em página de pedido do cliente
- [ ] Integrar em página de entrega do motoboy
- [ ] Integrar em página de pedido da loja
- [ ] Testar com 3 browsers (3 roles diferentes)
- [ ] Testar com DevTools (aba Network + Console)
- [ ] Verificar Socket.io Admin UI

## 🚀 Próximos Passos

1. **Notificações Push** - Notificar quando nova mensagem chegar
2. **Leitura de Recibos** - Mostrar "lido" com timestamp
3. **Indicador Online** - Mostrar quem está online
4. **Histórico** - Pagination para carregar mensagens antigas
5. **Busca** - Buscar dentro de conversa específica

