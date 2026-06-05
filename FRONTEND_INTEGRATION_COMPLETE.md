# 🚀 INTEGRAÇÃO FRONTEND - PASSO A PASSO

**Status:** Pronto para implementar  
**Tempo:** 2-3 dias  
**Dificuldade:** Médio

---

## 📋 Pré-requisitos

- ✅ Backend rodando (Socket.io configurado)
- ✅ Arquivos de código prontos:
  - `frontend/hooks/useChat.ts`
  - `frontend/components/ChatPanel.tsx`
  - `frontend/components/ChatBubble.tsx`
  - `frontend/components/ChatInput.tsx`

---

## 📦 Passo 1: Instalar Dependências

```bash
npm install socket.io-client
```

---

## 📁 Passo 2: Estrutura de Pastas

Crie a estrutura:

```
frontend/
├── hooks/
│   └── useChat.ts ✅ (já criado)
├── components/
│   ├── ChatPanel.tsx ✅ (já criado)
│   ├── ChatBubble.tsx ✅ (já criado)
│   ├── ChatInput.tsx ✅ (já criado)
│   └── styles/ (opcional)
│       ├── ChatPanel.module.css
│       ├── ChatBubble.module.css
│       └── ChatInput.module.css
└── pages/
    ├── pedido/[id].tsx (cliente) ← VAMOS INTEGRAR
    ├── store-order-[id].tsx (loja) ← VAMOS INTEGRAR
    └── motoboy/delivery/[id].tsx (motoboy) ← JÁ EXISTE
```

---

## 🎯 Passo 3: Integração na Página do Cliente

### Arquivo: `frontend/pages/order-[id].tsx` (PEDIDO DO CLIENTE)

Substitua o arquivo inteiro por:

```typescript
import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import { useOrder, useDelivery } from '../hooks/useSync';
import { CancelOrderModal } from '../components/order/CancelOrderModal';
import { CancellationStatusDisplay } from '../components/order/CancellationStatusDisplay';
import useChat from '../hooks/useChat'; // ← NOVO
import ChatPanel from '../components/ChatPanel'; // ← NOVO
import ChatInput from '../components/ChatInput'; // ← NOVO
import AuthContext from '../contexts/AuthContext'; // ← NOVO
import api from '../lib/api'; // ← NOVO

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading } = useOrder(id);
  const { delivery, loading: deliveryLoading } = useDelivery(order?.deliveryId);
  const { user, token } = useContext(AuthContext); // ← NOVO
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null); // ← NOVO
  const [chatLoading, setChatLoading] = useState(false); // ← NOVO

  // ✅ NOVO: Setup do Chat
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

  // ✅ NOVO: Criar/obter conversa com a loja
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

  // ✅ NOVO: Enviar mensagem
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

  // ✅ NOVO: Marcar como lido
  const handleMarkAsRead = async (messageId: string) => {
    if (!conversationId) return;

    try {
      await api.put(`/api/chat/messages/${messageId}/read`);
      markAsRead(messageId);
    } catch (error) {
      console.error('Erro ao marcar como lido:', error);
    }
  };

  // ✅ NOVO: Sair do chat ao desmontar
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
      {/* Lado Esquerdo: Detalhes */}
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

      {/* Lado Direito: Chat */}
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

## 🏪 Passo 4: Integração na Página da Loja

### Arquivo: `frontend/pages/store-order-[id].tsx` (PEDIDOS DA LOJA)

Vou criar um exemplo para a loja gerenciar múltiplas conversas:

```typescript
import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import api from '../lib/api';
import { useOrder, useDelivery } from '../hooks/useSync';
import { useSocket } from '../contexts/SocketContext';
import useChat from '../hooks/useChat'; // ← NOVO
import ChatPanel from '../components/ChatPanel'; // ← NOVO
import ChatInput from '../components/ChatInput'; // ← NOVO
import AuthContext from '../contexts/AuthContext'; // ← NOVO

export default function StoreOrderStatus() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading, setOrder } = useOrder(id);
  const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
  const { on } = useSocket();
  const { user, token } = useContext(AuthContext); // ← NOVO
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [avaliando, setAvaliando] = useState(false);
  const [avaliado, setAvaliado] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState('');

  // ✅ NOVO: Chat com Cliente
  const [conversationWithCustomer, setConversationWithCustomer] = useState<string | null>(null); // ← NOVO
  const [conversationWithMotoboy, setConversationWithMotoboy] = useState<string | null>(null); // ← NOVO
  const [activeChatTab, setActiveChatTab] = useState<'customer' | 'motoboy'>('customer'); // ← NOVO
  const [chatLoading, setChatLoading] = useState(false); // ← NOVO

  // ✅ NOVO: Setup do Chat
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

  // ✅ NOVO: Criar conversa com cliente
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

  // ✅ NOVO: Criar conversa com motoboy (após atribuição)
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

  // ✅ NOVO: Enviar mensagem
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

  // ✅ NOVO: Mudar de conversa
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

  // ✅ NOVO: Cleanup ao desmontar
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

  // ... resto do código existente ...

  return (
    <div style={{ display: 'flex', gap: '20px', minHeight: '100vh' }}>
      {/* Lado Esquerdo: Detalhes do Pedido */}
      <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #eee' }}>
        <h1>Status do Pedido</h1>
        {/* ... seu código existente aqui ... */}
      </div>

      {/* Lado Direito: Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #eee' }}>
        <div style={{ padding: '15px', borderBottom: '1px solid #eee', background: '#f5f5f5' }}>
          <h3>💬 Chat</h3>
          
          {/* Abas de Chat */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={() => handleSwitchTab('customer')}
              style={{
                padding: '8px 15px',
                background: activeChatTab === 'customer' ? '#007bff' : '#f0f0f0',
                color: activeChatTab === 'customer' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              👤 Cliente
            </button>
            
            {conversationWithMotoboy && (
              <button
                onClick={() => handleSwitchTab('motoboy')}
                style={{
                  padding: '8px 15px',
                  background: activeChatTab === 'motoboy' ? '#ff6b6b' : '#f0f0f0',
                  color: activeChatTab === 'motoboy' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                🏍️ Motoboy
              </button>
            )}
          </div>

          <div style={{ marginTop: '10px', fontSize: '12px' }}>
            {!isConnected && <span style={{ color: '#ff6b6b' }}>🔴 Conectando...</span>}
            {isConnected && <span style={{ color: '#51cf66' }}>🟢 Conectado</span>}
            {chatError && <span style={{ color: '#ff6b6b' }}> ❌ {chatError}</span>}
          </div>
        </div>

        {/* Área de Chat */}
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
  );
}
```

---

## 🏍️ Passo 5: Integração na Página do Motoboy

### Arquivo: `frontend/pages/motoboy/delivery/[id].tsx`

Adicione isto ao código existente:

```typescript
// ← ADICIONE ESTES IMPORTS NO INÍCIO
import useChat from '../../../hooks/useChat';
import ChatPanel from '../../../components/ChatPanel';
import ChatInput from '../../../components/ChatInput';

// ← ADICIONE ESTAS VARIÁVEIS DE ESTADO
const [conversationWithStore, setConversationWithStore] = useState<string | null>(null);
const [conversationWithCustomer, setConversationWithCustomer] = useState<string | null>(null);
const [activeChatTab, setActiveChatTab] = useState<'store' | 'customer'>('store');
const [chatLoading, setChatLoading] = useState(false);

// ← ADICIONE ESTE HOOK DE CHAT
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

// ← ADICIONE ESTE EFEITO PARA CRIAR CONVERSA COM LOJA
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

// ← ADICIONE ESTE EFEITO PARA CRIAR CONVERSA COM CLIENTE
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

// ← ADICIONE ESTA FUNÇÃO
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

// ← ADICIONE ESTA FUNÇÃO
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

// ← ADICIONE ESTE CLEANUP
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

// ← ADICIONE ISTO NA JSX (antes do </div> final):
<div style={{ marginTop: '20px', padding: '20px', borderTop: '1px solid #eee' }}>
  <h3>💬 Chat</h3>
  
  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
    <button
      onClick={() => handleSwitchTab('store')}
      style={{
        padding: '8px 15px',
        background: activeChatTab === 'store' ? '#28a745' : '#f0f0f0',
        color: activeChatTab === 'store' ? 'white' : '#333',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      🏪 Loja
    </button>
    
    {conversationWithCustomer && (
      <button
        onClick={() => handleSwitchTab('customer')}
        style={{
          padding: '8px 15px',
          background: activeChatTab === 'customer' ? '#007bff' : '#f0f0f0',
          color: activeChatTab === 'customer' ? 'white' : '#333',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        👤 Cliente
      </button>
    )}
  </div>

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
        Carregando conversa...
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
```

---

## ✅ Passo 6: Verificação

### Teste no Frontend

1. **Backend deve estar rodando:**
   ```bash
   npm run dev
   # Ver: ✅ [SOCKET] Chat socket.io configurado
   ```

2. **Abra 3 navegadores (incógnito) com 3 usuários diferentes:**
   - Browser 1: Cliente logado
   - Browser 2: Loja logada
   - Browser 3: Motoboy logado

3. **Teste cada página:**
   - ✅ Cliente vê conversa com loja
   - ✅ Loja vê conversa com cliente
   - ✅ Motoboy vê conversa com loja
   - ✅ Mensagens aparecem em tempo real

4. **Teste recursos:**
   - ✅ Enviar mensagem
   - ✅ Indicador de digitação
   - ✅ Marcar como lido
   - ✅ Anexos

---

## 🐛 Troubleshooting

### "useChat is not defined"
- Verifique que `frontend/hooks/useChat.ts` existe
- Verifique o import: `import useChat from '../hooks/useChat'`

### "Socket não conecta"
- Verifique token JWT é válido
- Verifique backend está rodando
- Veja console do navegador: Network > WebSocket

### "Mensagens não aparecem"
- Verifique API está funcionando: POST /api/chat/messages
- Verifique Socket.io está emitindo evento
- Veja logs do servidor

### "Componentes não aparecem"
- Verifique importação dos componentes
- Verifique pastas existem: `frontend/components/`
- Verifique typo nos nomes

---

## 📊 Status Após Esta Etapa

```
✅ Backend:    Integrado em app.ts
✅ Frontend:   3 páginas com chat
✅ Socket.io:  Conectando em tempo real
✅ Mensagens:  Enviando e recebendo
✅ Attachs:    Funcionando
⏳ Testes:     Próximo passo

Progresso: ~50% do projeto
```

