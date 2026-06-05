# 🔧 GUIA MANUAL DE CORREÇÃO - SOCKET LISTENERS

## 📍 PROBLEMA
Status do pedido não atualiza automaticamente quando loja aceita ou motoboy é atribuído. Só atualiza quando valida o PIN.

---

## 🛠️ CORREÇÃO 1: SocketContext.tsx
**Arquivo**: `frontend/contexts/SocketContext.tsx`

### ❌ PROBLEMA (Linhas 67-79):
```typescript
const on = (event: string, handler: (...args: any[]) => void) => {
  const socket = connectSocket(token || '');
  socket.on(event, handler);
};

const off = (event: string, handler: (...args: any[]) => void) => {
  const socket = connectSocket(token || '');
  socket.off(event, handler);
};

const emit = (event: string, ...args: any[]) => {
  const socket = connectSocket(token || '');
  socket.emit(event, ...args);
};
```

### ✅ SOLUÇÃO:
Adicione `socketRef` para manter a mesma instância:

**LINHA 1**: Adicionar import:
```typescript
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
```

**LINHA 18**: Após `reconnectTimeoutRef`, adicionar:
```typescript
const socketRef = useRef<any>(null);
```

**LINHA 24**: Dentro do `useEffect`, adicionar:
```typescript
const socket = connectSocket(token);
socketRef.current = socket;  // ✅ GUARDAR REFERÊNCIA
```

**LINHAS 67-79**: Substituir as funções `on`, `off`, `emit`:
```typescript
const on = (event: string, handler: (...args: any[]) => void) => {
  // ✅ USAR socketRef em vez de criar nova instância
  const socket = socketRef.current || getSocket();
  if (socket) {
    console.log(`📡 [Socket] Listener adicionado: ${event}`);
    socket.on(event, handler);
  }
};

const off = (event: string, handler: (...args: any[]) => void) => {
  // ✅ USAR socketRef em vez de criar nova instância
  const socket = socketRef.current || getSocket();
  if (socket) {
    console.log(`🔇 [Socket] Listener removido: ${event}`);
    socket.off(event, handler);
  }
};

const emit = (event: string, ...args: any[]) => {
  // ✅ USAR socketRef em vez de criar nova instância
  const socket = socketRef.current || getSocket();
  if (socket) {
    console.log(`📤 [Socket] Evento emitido: ${event}`, args);
    socket.emit(event, ...args);
  }
};
```

---

## 🛠️ CORREÇÃO 2: store-order-[id].tsx
**Arquivo**: `frontend/pages/store-order-[id].tsx`

### ❌ PROBLEMA (Linhas 1-26):
Falta listeners diretos na página para atualizar quando eventos chegam.

### ✅ SOLUÇÃO:

**LINHA 1-4**: Adicionar imports:
```typescript
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useOrder, useDelivery } from '../hooks/useSync';
import { useSocket } from '../contexts/SocketContext';  // ✅ NOVO
```

**LINHA 11**: Após obter o hook `useOrder`, adicionar:
```typescript
const { order, loading: orderLoading, setOrder } = useOrder(id);
const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
const { on, off } = useSocket();  // ✅ NOVO - obter socket
```

**DEPOIS DA LINHA 18** (após `setErroAvaliacao`): Adicionar novo useEffect:
```typescript
// ✅ NOVO: Listeners diretos de socket na página
useEffect(() => {
  if (!id) return;

  const handleOrderAccepted = (data: any) => {
    if (data.orderId === id) {
      console.log('✅ [Store Order Page] Loja aceitou:', data);
      setOrder((prev: any) => ({ ...prev, status: 'pago' }));
    }
  };

  const handleMotoboyAssigned = (data: any) => {
    if (data.orderId === id) {
      console.log('🏍️ [Store Order Page] Motoboy atribuído:', data);
      // Buscar dados atualizados da delivery
      if (order?.deliveryId) {
        api.get(`/deliveries/${order.deliveryId}`).then(res => {
          setDelivery(res.data);
        });
      }
    }
  };

  const handleDeliveryPicked = (data: any) => {
    if (data.orderId === id) {
      console.log('🚗 [Store Order Page] Pedido retirado:', data);
      if (order?.deliveryId) {
        api.get(`/deliveries/${order.deliveryId}`).then(res => {
          setDelivery(res.data);
        });
      }
    }
  };

  const handleDeliveryCompleted = (data: any) => {
    if (data.deliveryId === order?.deliveryId) {
      console.log('✅ [Store Order Page] Entrega finalizada:', data);
      if (order?.deliveryId) {
        api.get(`/deliveries/${order.deliveryId}`).then(res => {
          setDelivery(res.data);
        });
      }
    }
  };

  on('order:accepted_by_store', handleOrderAccepted);
  on('motoboy:assigned', handleMotoboyAssigned);
  on('delivery:picked', handleDeliveryPicked);
  on('delivery:completed', handleDeliveryCompleted);

  return () => {
    off('order:accepted_by_store', handleOrderAccepted);
    off('motoboy:assigned', handleMotoboyAssigned);
    off('delivery:picked', handleDeliveryPicked);
    off('delivery:completed', handleDeliveryCompleted);
  };
}, [id, order?.deliveryId, on, off, setOrder, setDelivery]);
```

---

## 🛠️ CORREÇÃO 3: store-order-[id].tsx (Status Display)
**Arquivo**: `frontend/pages/store-order-[id].tsx`

### ❌ PROBLEMA (Linha ~30):
```typescript
let statusMsg = 'Aguardando motoboy aceitar a entrega...';
if (delivery && delivery.status === 'assigned') statusMsg = 'Motoboy a caminho!';
```

Não mostra status português e não é reativo.

### ✅ SOLUÇÃO:

**SUBSTITUIR a função de status** (linhas ~30-34):
```typescript
// ✅ Traduzir status português para UI
const statusMap: Record<string, string> = {
  'criado': '📝 Pedido Criado',
  'pago': '✅ Pago (Aguardando loja aceitar)',
  'enviado': '🚚 Entregue',
  'entregue': '✅ Entrega Finalizada',
  'cancelado': '❌ Cancelado',
  'rejeitado': '⚠️ Rejeitado'
};

const getStatusMessage = () => {
  if (!delivery) {
    return 'Aguardando motoboy aceitar a entrega...';
  }
  
  if (delivery.status === 'pending') {
    return 'Aguardando motoboy aceitar...';
  }
  if (delivery.status === 'assigned') {
    return '🏍️ Motoboy a caminho para a loja!';
  }
  if (delivery.status === 'picked') {
    return '🚗 Motoboy retirou seu pedido! Siga para seu endereço.';
  }
  if (delivery.status === 'delivered') {
    return '✅ Entrega feita com sucesso! Por favor, avalie o atendimento:';
  }
  
  return 'Aguardando atualização...';
};
```

**SUBSTITUIR a exibição** (linha ~44):
```typescript
// ANTES:
<p><b>Status:</b> {order.status}</p>

// DEPOIS:
<p><b>Status do Pedido:</b> {statusMap[order.status] || order.status}</p>
<p><b>Status da Entrega:</b> {delivery?.status || 'Aguardando...'}</p>
```

**SUBSTITUIR statusMsg** (linha ~52):
```typescript
// ANTES:
<div style={{marginTop:16, fontWeight:'bold'}}>{statusMsg}</div>

// DEPOIS:
<div style={{marginTop:16, fontWeight:'bold', fontSize:16}}>{getStatusMessage()}</div>
```

---

## 📋 RESUMO DAS MUDANÇAS

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `SocketContext.tsx` | 1-4 | Adicionar import `getSocket` |
| `SocketContext.tsx` | 18 | Adicionar `socketRef` |
| `SocketContext.tsx` | 24 | Guardar referência: `socketRef.current = socket` |
| `SocketContext.tsx` | 67-79 | Usar `socketRef` em `on`, `off`, `emit` |
| `store-order-[id].tsx` | 1-5 | Adicionar imports `useSocket` |
| `store-order-[id].tsx` | 11-12 | Adicionar `setOrder`, `setDelivery`, `on`, `off` |
| `store-order-[id].tsx` | ~19 | Adicionar `useEffect` com listeners de socket |
| `store-order-[id].tsx` | ~30 | Adicionar `statusMap` e `getStatusMessage()` |
| `store-order-[id].tsx` | ~44 | Mostrar status português + delivery status |
| `store-order-[id].tsx` | ~52 | Usar `getStatusMessage()` dinâmico |

---

## ✅ DEPOIS DE FAZER TODAS AS MUDANÇAS:

```bash
# Compilar frontend
cd d:\PROJETOS\Drop\frontend
npm run build

# Compilar backend
cd d:\PROJETOS\Drop
npm run build

# Rodar ambos
# Terminal 1: npm run dev (na pasta principal)
# Terminal 2: cd frontend && npm run dev
```

---

## 🧪 COMO TESTAR:

1. **Cliente**: http://localhost:3000 (já logado)
2. **Loja**: http://localhost:3000/seller/dashboard
3. **Motoboy**: http://localhost:3000/motoboy

**Etapa 1**: Cliente compra
- Loja recebe "Novo pedido" ✅ AUTOMÁTICO

**Etapa 2**: Loja clica "Aceitar Pedido"
- Cliente vê "Pago (Aguardando loja aceitar)" ✅ AUTOMÁTICO (sem F5)
- Motoboy recebe entrega disponível ✅ AUTOMÁTICO

**Etapa 3**: Motoboy clica "Aceitar Entrega"
- Cliente vê "🏍️ Motoboy a caminho" ✅ AUTOMÁTICO (sem F5)
- Vê PIN de retirada ✅ AUTOMÁTICO

**Etapa 4**: Loja valida PIN
- Cliente vê "🚗 Motoboy retirou seu pedido" ✅ AUTOMÁTICO (sem F5)

---

**Status**: Pronto para editar manualmente
**Data**: 25/02/2026

