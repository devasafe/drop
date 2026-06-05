# 📋 CÓDIGO PRONTO PARA COPIAR - INTEGRAÇÃO FRONTEND

**Copie e cole o código abaixo em suas páginas**

---

## 📋 Arquivo 1: Cliente - `frontend/pages/order-[id].tsx`

```typescript
import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import { useOrder, useDelivery } from '../hooks/useSync';
import { CancelOrderModal } from '../components/order/CancelOrderModal';
import { CancellationStatusDisplay } from '../components/order/CancellationStatusDisplay';
import useChat from '../hooks/useChat';
import ChatPanel from '../components/ChatPanel';
import ChatInput from '../components/ChatInput';
import AuthContext from '../contexts/AuthContext';
import api from '../lib/api';

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading } = useOrder(id);
  const { delivery, loading: deliveryLoading } = useDelivery(order?.deliveryId);
  const { user, token } = useContext(AuthContext);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

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
    userId: user?._id || ''
  });

  useEffect(() => {
    if (!socket || !isConnected || !order || !user) return;

    const createOrGetConversation = async () => {
      try {
        setChatLoading(true);
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_cliente',
          participant1: {
            userId: order.storeObj._id,
            role: 'loja',
            name: order.storeObj.name
          },
          participant2: {
            userId: user._id,
            role: 'cliente',
            name: user.name
          },
          orderId: order._id
        });

        const convId = response.data._id;
        setConversationId(convId);
        joinConversation(convId);
      } catch (error) {
        console.error('Erro ao criar conversa:', error);
      } finally {
        setChatLoading(false);
      }
    };

    createOrGetConversation();
  }, [socket, isConnected, order, user, joinConversation]);

  const handleSendMessage = async (text: string, attachments?: any[]) => {
    if (!conversationId || !isConnected) return;

    try {
      await api.post('/api/chat/messages', {
        conversationId,
        text,
        attachments
      });

      sendMessage(text, attachments);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleMarkAsRead = async (messageId: string) => {
    if (!conversationId) return;

    try {
      await api.put(`/api/chat/messages/${messageId}/read`);
      markAsRead(messageId);
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId, leaveConversation]);

  if (orderLoading) return <div>Carregando pedido...</div>;

  const statusMap: Record<string, string> = {
    created: 'criado',
    paid: 'pago',
    shipped: 'enviado',
    delivered: 'entregue',
    cancelled: 'cancelado',
    assigned: 'motoboy atribuído',
    picked: 'retirado'
  };

  function traduzStatus(status: string) {
    if (!status) return '';
    const key = status.toLowerCase();
    return statusMap[key] || status;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  const storeContact = order.storeObj
    ? `${order.storeObj.name || ''} | ${order.storeObj.address || ''}`
    : '-';

  const customerAddress = order.customerObj?.addresses?.[0];
  const customerContact = customerAddress
    ? `${order.customerObj.name || ''} | ${customerAddress.label || ''} | ${customerAddress.street}, ${customerAddress.number}`
    : '-';

  return (
    <div style={{ display: 'flex', gap: '20px', minHeight: '100vh' }}>
      <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #eee' }}>
        <h1>Detalhes da Entrega</h1>
        <p><b>Pedido:</b> {order._id}</p>
        <p><b>Status:</b> {traduzStatus(delivery?.status || order.status)}</p>
        <p><b>Taxa:</b> R$ {delivery?.fee?.toFixed(2) || order.deliveryFee?.toFixed(2) || '0,00'}</p>
        <p><b>Retirada:</b> {formatDate(delivery?.pickedAt)}</p>
        <p><b>Entrega:</b> {formatDate(delivery?.deliveredAt)}</p>
        <p><b>Contato Loja:</b> {storeContact}</p>
        <p><b>Contato Cliente:</b> {customerContact}</p>
        
        {showCancelModal && (
          <CancelOrderModal orderId={order._id} onClose={() => setShowCancelModal(false)} />
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #eee' }}>
        <div style={{ padding: '15px', borderBottom: '1px solid #eee', background: '#f5f5f5' }}>
          <h3>💬 Chat com a Loja</h3>
          {!isConnected && <span style={{ color: '#ff6b6b' }}>🔴 Conectando...</span>}
          {isConnected && <span style={{ color: '#51cf66' }}>🟢 Conectado</span>}
          {chatError && <span style={{ color: '#ff6b6b' }}> ❌ {chatError}</span>}
        </div>

        {conversationId ? (
          <>
            <ChatPanel
              conversationId={conversationId}
              userId={user?._id || ''}
              messages={messages}
              isLoading={chatLoading}
              typingUsers={typingUsers}
              onSendMessage={handleSendMessage}
              onMarkAsRead={handleMarkAsRead}
              onUserTyping={setUserTyping}
            />

            <ChatInput
              onSendMessage={handleSendMessage}
              onTyping={setUserTyping}
              disabled={!isConnected || chatLoading}
            />
          </>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
            Carregando chat...
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 🏪 Arquivo 2: Loja - `frontend/pages/store-order-[id].tsx`

**Encontre a linha com `export default function StoreOrderStatus()` e copie o código abaixo:**

```typescript
import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import api from '../lib/api';
import { useOrder, useDelivery } from '../hooks/useSync';
import { useSocket } from '../contexts/SocketContext';
import useChat from '../hooks/useChat';
import ChatPanel from '../components/ChatPanel';
import ChatInput from '../components/ChatInput';
import AuthContext from '../contexts/AuthContext';

export default function StoreOrderStatus() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading, setOrder } = useOrder(id);
  const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
  const { on } = useSocket();
  const { user, token } = useContext(AuthContext);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [avaliando, setAvaliando] = useState(false);
  const [avaliado, setAvaliado] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState('');

  // CHAT
  const [conversationWithCustomer, setConversationWithCustomer] = useState<string | null>(null);
  const [conversationWithMotoboy, setConversationWithMotoboy] = useState<string | null>(null);
  const [activeChatTab, setActiveChatTab] = useState<'customer' | 'motoboy'>('customer');
  const [chatLoading, setChatLoading] = useState(false);

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
    userId: user?._id || ''
  });

  useEffect(() => {
    if (!socket || !isConnected || !order || !user || conversationWithCustomer) return;

    const createConversationWithCustomer = async () => {
      try {
        setChatLoading(true);
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_cliente',
          participant1: {
            userId: user._id,
            role: 'loja',
            name: user.name
          },
          participant2: {
            userId: order.customerObj._id,
            role: 'cliente',
            name: order.customerObj.name
          },
          orderId: order._id
        });

        setConversationWithCustomer(response.data._id);
        joinConversation(response.data._id);
      } catch (error) {
        console.error('Erro ao criar conversa com cliente:', error);
      } finally {
        setChatLoading(false);
      }
    };

    createConversationWithCustomer();
  }, [socket, isConnected, order, user, conversationWithCustomer, joinConversation]);

  useEffect(() => {
    if (!socket || !isConnected || !delivery?.driverId || !user || conversationWithMotoboy) return;

    const createConversationWithMotoboy = async () => {
      try {
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_motoboy',
          participant1: {
            userId: user._id,
            role: 'loja',
            name: user.name
          },
          participant2: {
            userId: delivery.driverId,
            role: 'motoboy',
            name: delivery.driverName || 'Motoboy'
          },
          deliveryId: delivery._id
        });

        setConversationWithMotoboy(response.data._id);
      } catch (error) {
        console.error('Erro ao criar conversa com motoboy:', error);
      }
    };

    createConversationWithMotoboy();
  }, [socket, isConnected, delivery?.driverId, user, conversationWithMotoboy]);

  const handleSendMessage = async (text: string, attachments?: any[]) => {
    const conversationId = activeChatTab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    if (!conversationId || !isConnected) return;

    try {
      await api.post('/api/chat/messages', {
        conversationId,
        text,
        attachments
      });

      sendMessage(text, attachments);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleSwitchTab = (tab: 'customer' | 'motoboy') => {
    const oldConversationId = activeChatTab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    const newConversationId = tab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    if (oldConversationId && oldConversationId !== newConversationId) {
      leaveConversation(oldConversationId);
    }

    if (newConversationId && newConversationId !== oldConversationId) {
      joinConversation(newConversationId);
    }

    setActiveChatTab(tab);
  };

  useEffect(() => {
    return () => {
      if (conversationWithCustomer) {
        leaveConversation(conversationWithCustomer);
      }
      if (conversationWithMotoboy) {
        leaveConversation(conversationWithMotoboy);
      }
    };
  }, [conversationWithCustomer, conversationWithMotoboy, leaveConversation]);

  // ... rest of your existing code ...

  return (
    <div>
      {/* Seu código existente aqui */}

      {/* ADICIONE ISTO NO FINAL */}
      <div style={{ marginTop: '40px', padding: '20px', borderTop: '2px solid #eee' }}>
        <h2>💬 Chat</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button
            onClick={() => handleSwitchTab('customer')}
            style={{
              padding: '10px 20px',
              background: activeChatTab === 'customer' ? '#007bff' : '#f0f0f0',
              color: activeChatTab === 'customer' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            👤 Cliente {conversationWithCustomer ? '✓' : ''}
          </button>
          
          {conversationWithMotoboy && (
            <button
              onClick={() => handleSwitchTab('motoboy')}
              style={{
                padding: '10px 20px',
                background: activeChatTab === 'motoboy' ? '#ff6b6b' : '#f0f0f0',
                color: activeChatTab === 'motoboy' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🏍️ Motoboy ✓
            </button>
          )}
        </div>

        <div style={{ marginBottom: '10px', fontSize: '12px' }}>
          {!isConnected && <span style={{ color: '#ff6b6b' }}>🔴 Conectando...</span>}
          {isConnected && <span style={{ color: '#51cf66' }}>🟢 Conectado</span>}
          {chatError && <span style={{ color: '#ff6b6b' }}> ❌ {chatError}</span>}
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: '8px', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          {activeChatTab === 'customer' ? (
            conversationWithCustomer ? (
              <>
                <ChatPanel
                  conversationId={conversationWithCustomer}
                  userId={user?._id || ''}
                  messages={messages}
                  isLoading={chatLoading}
                  typingUsers={typingUsers}
                  onSendMessage={handleSendMessage}
                  onMarkAsRead={markAsRead}
                  onUserTyping={setUserTyping}
                />
                <ChatInput
                  onSendMessage={handleSendMessage}
                  onTyping={setUserTyping}
                  disabled={!isConnected || chatLoading}
                />
              </>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                Carregando conversa com cliente...
              </div>
            )
          ) : (
            conversationWithMotoboy ? (
              <>
                <ChatPanel
                  conversationId={conversationWithMotoboy}
                  userId={user?._id || ''}
                  messages={messages}
                  isLoading={chatLoading}
                  typingUsers={typingUsers}
                  onSendMessage={handleSendMessage}
                  onMarkAsRead={markAsRead}
                  onUserTyping={setUserTyping}
                />
                <ChatInput
                  onSendMessage={handleSendMessage}
                  onTyping={setUserTyping}
                  disabled={!isConnected || chatLoading}
                />
              </>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                Motoboy ainda não foi atribuído
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 🏍️ Arquivo 3: Motoboy - `frontend/pages/motoboy/delivery/[id].tsx`

**Encontre o arquivo e adicione ao final (antes do `</div>` fechador):**

```typescript
// EM IMPORTS (adicione no topo do arquivo)
import useChat from '../../../hooks/useChat';
import ChatPanel from '../../../components/ChatPanel';
import ChatInput from '../../../components/ChatInput';

// EM ESTADOS (adicione com os outros useState)
const [conversationWithStore, setConversationWithStore] = useState<string | null>(null);
const [conversationWithCustomer, setConversationWithCustomer] = useState<string | null>(null);
const [activeChatTab, setActiveChatTab] = useState<'store' | 'customer'>('store');
const [chatLoading, setChatLoading] = useState(false);

// HOOK DO CHAT (adicione após os outros hooks)
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
  userId: user?._id || ''
});

// EFEITOS (adicione com os outros useEffect)
useEffect(() => {
  if (!socket || !isConnected || !delivery || !user || conversationWithStore) return;

  const createConversationWithStore = async () => {
    try {
      setChatLoading(true);
      const response = await api.post('/api/chat/conversations', {
        type: 'loja_motoboy',
        participant1: {
          userId: delivery.storeId,
          role: 'loja',
          name: delivery.storeName || 'Loja'
        },
        participant2: {
          userId: user._id,
          role: 'motoboy',
          name: user.name
        },
        deliveryId: delivery._id
      });

      setConversationWithStore(response.data._id);
      joinConversation(response.data._id);
    } catch (error) {
      console.error('Erro ao criar conversa com loja:', error);
    } finally {
      setChatLoading(false);
    }
  };

  createConversationWithStore();
}, [socket, isConnected, delivery, user, conversationWithStore, joinConversation]);

useEffect(() => {
  if (!socket || !isConnected || !delivery || !user || conversationWithCustomer) return;

  const createConversationWithCustomer = async () => {
    try {
      const response = await api.post('/api/chat/conversations', {
        type: 'motoboy_cliente',
        participant1: {
          userId: delivery.customerId,
          role: 'cliente',
          name: delivery.customerName || 'Cliente'
        },
        participant2: {
          userId: user._id,
          role: 'motoboy',
          name: user.name
        },
        orderId: delivery.orderId,
        deliveryId: delivery._id
      });

      setConversationWithCustomer(response.data._id);
    } catch (error) {
      console.error('Erro ao criar conversa com cliente:', error);
    }
  };

  createConversationWithCustomer();
}, [socket, isConnected, delivery, user, conversationWithCustomer]);

const handleSendMessage = async (text: string, attachments?: any[]) => {
  const conversationId = activeChatTab === 'store'
    ? conversationWithStore
    : conversationWithCustomer;

  if (!conversationId || !isConnected) return;

  try {
    await api.post('/api/chat/messages', {
      conversationId,
      text,
      attachments
    });

    sendMessage(text, attachments);
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
  }
};

const handleSwitchTab = (tab: 'store' | 'customer') => {
  const oldConversationId = activeChatTab === 'store'
    ? conversationWithStore
    : conversationWithCustomer;

  const newConversationId = tab === 'store'
    ? conversationWithStore
    : conversationWithCustomer;

  if (oldConversationId && oldConversationId !== newConversationId) {
    leaveConversation(oldConversationId);
  }

  if (newConversationId && newConversationId !== oldConversationId) {
    joinConversation(newConversationId);
  }

  setActiveChatTab(tab);
};

useEffect(() => {
  return () => {
    if (conversationWithStore) {
      leaveConversation(conversationWithStore);
    }
    if (conversationWithCustomer) {
      leaveConversation(conversationWithCustomer);
    }
  };
}, [conversationWithStore, conversationWithCustomer, leaveConversation]);

// NA JSX (adicione antes do </div> final):
<div style={{ marginTop: '40px', padding: '20px', borderTop: '2px solid #eee' }}>
  <h2>💬 Chat</h2>
  
  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
    <button
      onClick={() => handleSwitchTab('store')}
      style={{
        padding: '10px 20px',
        background: activeChatTab === 'store' ? '#28a745' : '#f0f0f0',
        color: activeChatTab === 'store' ? 'white' : '#333',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold'
      }}
    >
      🏪 Loja
    </button>
    
    {conversationWithCustomer && (
      <button
        onClick={() => handleSwitchTab('customer')}
        style={{
          padding: '10px 20px',
          background: activeChatTab === 'customer' ? '#007bff' : '#f0f0f0',
          color: activeChatTab === 'customer' ? 'white' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        👤 Cliente
      </button>
    )}
  </div>

  <div style={{ marginBottom: '10px', fontSize: '12px' }}>
    {!isConnected && <span style={{ color: '#ff6b6b' }}>🔴 Conectando...</span>}
    {isConnected && <span style={{ color: '#51cf66' }}>🟢 Conectado</span>}
    {chatError && <span style={{ color: '#ff6b6b' }}> ❌ {chatError}</span>}
  </div>

  <div style={{ border: '1px solid #eee', borderRadius: '8px', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
    {activeChatTab === 'store' ? (
      conversationWithStore ? (
        <>
          <ChatPanel
            conversationId={conversationWithStore}
            userId={user?._id || ''}
            messages={messages}
            isLoading={chatLoading}
            typingUsers={typingUsers}
            onSendMessage={handleSendMessage}
            onMarkAsRead={markAsRead}
            onUserTyping={setUserTyping}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            onTyping={setUserTyping}
            disabled={!isConnected || chatLoading}
          />
        </>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          Carregando conversa com loja...
        </div>
      )
    ) : (
      conversationWithCustomer ? (
        <>
          <ChatPanel
            conversationId={conversationWithCustomer}
            userId={user?._id || ''}
            messages={messages}
            isLoading={chatLoading}
            typingUsers={typingUsers}
            onSendMessage={handleSendMessage}
            onMarkAsRead={markAsRead}
            onUserTyping={setUserTyping}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            onTyping={setUserTyping}
            disabled={!isConnected || chatLoading}
          />
        </>
      ) : (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          Carregando conversa com cliente...
        </div>
      )
    )}
  </div>
</div>
```

---

## ✅ Checklist

- [ ] Copiei o código para `order-[id].tsx`
- [ ] Copiei o código para `store-order-[id].tsx`
- [ ] Copiei o código para `motoboy/delivery/[id].tsx`
- [ ] Rodei `npm run dev`
- [ ] Teste com 3 navegadores (3 roles)
- [ ] Mensagens aparecem em tempo real
- [ ] Indicador de digitação funciona
- [ ] Anexos funcionam

