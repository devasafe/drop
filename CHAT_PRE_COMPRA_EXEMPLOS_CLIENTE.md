# 💡 EXEMPLO DE INTEGRAÇÃO - Como Cliente Inicia Chat

Este documento mostra como integrar o chat pré-compra na interface do cliente (frontend).

---

## 🎯 Cenários de Uso

### 1️⃣ Chat em Página de Produto

```tsx
// pages/product/[id].tsx

import ChatPrePurchaseButton from '@/components/ChatPrePurchaseButton';

export default function ProductPage({ product }) {
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      
      {/* Botão para chat sobre este produto */}
      <ChatPrePurchaseButton
        productId={product._id}
        productName={product.name}
        storeId={product.storeId}
        storeName={product.storeName}
      />
    </div>
  );
}
```

**Resultado:**
```
[💬 Falar com a Loja sobre iPhone 14]
```

Ao clicar → Abre modal com chat sobre o PRODUTO

---

### 2️⃣ Chat em Página de Contato Geral

```tsx
// pages/contact.tsx

import ChatPrePurchaseButton from '@/components/ChatPrePurchaseButton';

export default function ContactPage() {
  const [selectedStore, setSelectedStore] = useState(null);

  return (
    <div>
      <h1>Contate Nossas Lojas</h1>
      
      <select onChange={(e) => setSelectedStore(e.target.value)}>
        <option>Selecione uma loja...</option>
        <option value="loja-1">Loja XYZ - São Paulo</option>
        <option value="loja-2">Loja ABC - Rio de Janeiro</option>
      </select>

      {selectedStore && (
        <ChatPrePurchaseButton
          storeId={selectedStore}
          // Sem productId = conversa geral
        />
      )}
    </div>
  );
}
```

**Resultado:**
```
[💬 Falar com a Loja]
```

Ao clicar → Abre modal com chat GERAL (sem produto)

---

## 🎨 Componente ChatPrePurchaseButton

### Implementação

```tsx
// components/ChatPrePurchaseButton.tsx

import React, { useState } from 'react';
import api from '@/lib/api';
import ChatModal from './ChatModal';

interface ChatPrePurchaseButtonProps {
  productId?: string;
  productName?: string;
  storeId: string;
  storeName?: string;
}

export default function ChatPrePurchaseButton({
  productId,
  productName,
  storeId,
  storeName
}: ChatPrePurchaseButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChat = async () => {
    try {
      setLoading(true);
      setError(null);

      // Criar ou obter conversa pré-compra
      const response = await api.post('/chat/conversations/pre-purchase', {
        storeId,
        productId,
        conversationType: productId ? 'product' : 'user'
      });

      setConversationId(response.data._id);
      setShowModal(true);
    } catch (err: any) {
      setError(
        err.response?.data?.error || 'Erro ao iniciar chat'
      );
      console.error('❌ Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpenChat}
        disabled={loading}
        style={{
          padding: '12px 24px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 16,
          gap: 8,
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <span>💬</span>
        <span>
          {loading
            ? 'Carregando...'
            : productId
              ? `Falar com a Loja sobre ${productName}`
              : 'Falar com a Loja'}
        </span>
      </button>

      {error && (
        <div style={{ color: '#dc3545', marginTop: 8 }}>
          {error}
        </div>
      )}

      {/* Modal de Chat */}
      {showModal && conversationId && (
        <ChatModal
          conversationId={conversationId}
          title={
            productId
              ? `Chat sobre: ${productName}`
              : `Chat com ${storeName || 'Loja'}`
          }
          onClose={() => {
            setShowModal(false);
            setConversationId(null);
          }}
        />
      )}
    </>
  );
}
```

---

## 🎪 Componente ChatModal

```tsx
// components/ChatModal.tsx

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';

interface Message {
  _id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

interface ChatModalProps {
  conversationId: string;
  title: string;
  onClose: () => void;
}

export default function ChatModal({
  conversationId,
  title,
  onClose
}: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar mensagens ao abrir
  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async () => {
    try {
      const response = await api.get(`/chat/conversations/${conversationId}`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    try {
      setSending(true);
      const response = await api.post('/chat/messages', {
        conversationId,
        text: input.trim()
      });

      setMessages(prev => [...prev, response.data.message]);
      setInput('');
    } catch (error) {
      console.error('Erro ao enviar:', error);
      alert('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        width: '90%',
        maxWidth: 500,
        height: 600,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* HEADER */}
        <div style={{
          padding: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: 24,
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* MENSAGENS */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          backgroundColor: '#f5f5f5'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#999' }}>
              Carregando...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999' }}>
              Comece a conversa!
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg._id}
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 4
                }}
              >
                <div style={{
                  maxWidth: '70%',
                  backgroundColor: '#007bff',
                  color: 'white',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 14
                }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                    {msg.senderName}
                  </div>
                  <div>{msg.text}</div>
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR')}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid #e9ecef',
          display: 'flex',
          gap: 8
        }}>
          <input
            type="text"
            placeholder="Escrever..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={sending}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #dee2e6',
              borderRadius: 20,
              fontSize: 13,
              outline: 'none'
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={sending || !input.trim()}
            style={{
              padding: '10px 16px',
              backgroundColor: input.trim() ? '#007bff' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 20,
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 600
            }}
          >
            {sending ? '⏳' : '📤'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 🔌 Integração em Página de Loja

```tsx
// pages/store/[id]/contact.tsx

import ChatPrePurchaseButton from '@/components/ChatPrePurchaseButton';

export default function StoreContactPage({ store }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <h1>Entre em Contato com {store.name}</h1>
      
      <p>Tem uma dúvida? Quer saber mais sobre nossos produtos?</p>
      
      <ChatPrePurchaseButton
        storeId={store._id}
        storeName={store.name}
      />
      
      <h2>Outras formas de contato:</h2>
      <ul>
        <li>📧 Email: {store.email}</li>
        <li>📱 Telefone: {store.phone}</li>
        <li>🕐 Horário: {store.hours}</li>
      </ul>
    </div>
  );
}
```

---

## 📲 Integração no Header/Menu

```tsx
// components/Header.tsx

import ChatPrePurchaseButton from './ChatPrePurchaseButton';

export default function Header() {
  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      backgroundColor: '#fff',
      borderBottom: '1px solid #e9ecef'
    }}>
      <div>Logo</div>
      
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <a href="/">Home</a>
        <a href="/products">Produtos</a>
        
        {/* Botão flutuante de chat */}
        <ChatPrePurchaseButton
          storeId="seu-store-id"
          storeName="Sua Loja"
        />
      </div>
    </header>
  );
}
```

---

## ✨ Variações de Botão

### Compacto
```tsx
<button style={{ width: 50, height: 50, borderRadius: '50%' }}>
  💬
</button>
```

### Com Badge
```tsx
<div style={{ position: 'relative' }}>
  <button>💬 Chat</button>
  <span style={{
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#dc3545',
    color: 'white',
    borderRadius: '50%',
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700
  }}>
    3
  </span>
</div>
```

### Com Tooltip
```tsx
<div style={{ position: 'relative', display: 'inline-block' }}>
  <button>💬</button>
  <div style={{
    position: 'absolute',
    bottom: 'calc(100% + 10px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#333',
    color: 'white',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 12,
    whiteSpace: 'nowrap',
    display: 'none'
  }} className="tooltip">
    Falar com a loja
  </div>
</div>
```

---

## 🎯 Fluxo Completo do Cliente

```
1. Cliente navega no site
   ↓
2. Vê um produto que gosta
   ↓
3. Clica em "💬 Falar com a Loja sobre iPhone 14"
   ↓
4. Modal abre com histórico (vazio na primeira vez)
   ↓
5. Cliente digita: "Qual é o melhor preço?"
   ↓
6. Mensagem é enviada via POST /chat/messages
   ↓
7. Modal fecha (ou fica aberto)
   ↓
8. Cliente sai do site
   ↓
9. Lojista recebe notificação (próximo: Socket.io)
   ↓
10. Lojista acessa /seller/dashboard → Chat Pré-Compra
    ↓
11. Vê a conversa com 📦 ícone de produto
    ↓
12. Clica e responde: "Temos por R$ 3.599!"
    ↓
13. Cliente volta ao site
    ↓
14. Vê resposta da loja
    ↓
15. Pede desconto
    ↓
16. Lojista aprova
    ↓
17. Cliente faz compra 🎉
```

---

## 🚀 Deploy

```bash
# Backend
npm run build:backend
npm run start:backend

# Frontend
npm run build:frontend
npm run export  # ou npm run start:frontend
```

---

## 📋 Checklist de Implementação

- [ ] Copiar `ChatPrePurchaseButton.tsx` para `frontend/components/`
- [ ] Copiar `ChatModal.tsx` para `frontend/components/`
- [ ] Adicionar botão em página de produto
- [ ] Adicionar botão em página de contato
- [ ] Testar no navegador
- [ ] Verificar console para erros
- [ ] Testar com múltiplos produtos
- [ ] Testar com múltiplas lojas
- [ ] Adicionar à documentação

---

**Pronto para integrar!** 🚀
