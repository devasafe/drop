# 🚀 PROMPT: IMPLEMENTAR WEBSOCKET REAL-TIME PARA ATUALIZAR TODAS AS PÁGINAS SEM F5

**Data:** 3 de Março de 2026  
**Objetivo:** Todas as páginas atualizam automaticamente em tempo real quando dados mudam  
**Tempo de Implementação:** 4-5 horas  
**Complexidade:** Alta

---

## 📋 Visão Geral da Solução

```
ARQUITETURA WEBSOCKET:
═══════════════════════════════════════════════════════════════

BACKEND (Node.js + Socket.IO):
├─ src/utils/socketEmitter.ts
│  └─ Exporta funções para emitir eventos
│
├─ src/app.ts / src/server.ts
│  ├─ Inicializa Socket.IO server
│  └─ Define namespaces e rooms
│
└─ Todos os controllers
   └─ Importam socketEmitter
      └─ Emitem eventos quando dados mudam

FRONTEND (React/Next.js):
├─ hooks/useSocket.ts (nova)
│  └─ Custom hook para conectar client
│
├─ hooks/useRealTime.ts (nova)
│  └─ Hook que escuta socket events
│
├─ pages/*.tsx
│  ├─ useSocket() para conectar
│  ├─ useRealTime() para atualizar dados
│  └─ useEffect(() => { refetch quando socket event }, [socket])
│
└─ Context / Redux (opcional)
   └─ CentralizedSocketContext para evitar conexões múltiplas

EVENTOS DEFINIDOS:
├─ order:created
├─ order:updated
├─ order:cancelled
├─ delivery:assigned
├─ delivery:picked
├─ delivery:delivered
├─ wallet:updated
├─ cancellation:created
├─ motoboy:rating
└─ (mais em específico para cada ação)
```

---

## ✅ PASSO 1: Verificar Socket.IO no Backend

### 1.1 Arquivo: `src/utils/socketEmitter.ts` (VERIFICAR SE EXISTE)

```bash
# Terminal:
cat src/utils/socketEmitter.ts
```

**Se NÃO existir, criar:**

```typescript
/**
 * socketEmitter.ts - Gerencia todos os emits de Socket.IO
 */

import { Server } from 'socket.io';

let io: Server;

export function setIO(socketIOInstance: Server) {
  io = socketIOInstance;
}

export function getIO() {
  return io;
}

/**
 * Emite para room específico
 * Ex: emitToRoom('user:123', 'order:updated', data)
 */
export function emitToRoom(room: string, event: string, data: any) {
  if (!io) return console.warn('⚠️  Socket.IO not initialized');
  io.to(room).emit(event, data);
  console.log(`📤 ${event} → ${room}`);
}

/**
 * Emite para todos
 */
export function emitToAll(event: string, data: any) {
  if (!io) return console.warn('⚠️  Socket.IO not initialized');
  io.emit(event, data);
  console.log(`📤 ${event} → ALL`);
}

/**
 * Namespace-aware emit
 */
export function emitToNamespace(namespace: string, room: string, event: string, data: any) {
  if (!io) return console.warn('⚠️  Socket.IO not initialized');
  io.of(namespace).to(room).emit(event, data);
  console.log(`📤 ${namespace}/${event} → ${room}`);
}

//════════════════════════════════════════════════════════════════
// EVENTOS ESPECÍFICOS DE NEGÓCIO
//════════════════════════════════════════════════════════════════

export function emitOrderCreated(order: any) {
  emitToRoom(`store:${order.storeId}`, 'order:created', {
    orderId: order._id,
    customerId: order.customerId,
    totalValue: order.totalValue,
    status: order.status,
    products: order.products,
    timestamp: new Date()
  });
}

export function emitOrderUpdated(order: any) {
  // Para cliente
  emitToRoom(`user:${order.customerId}`, 'order:updated', {
    orderId: order._id,
    status: order.status,
    statusLabel: getOrderStatusLabel(order.status),
    timestamp: new Date()
  });

  // Para loja
  emitToRoom(`store:${order.storeId}`, 'order:updated', {
    orderId: order._id,
    status: order.status,
    timestamp: new Date()
  });
}

export function emitDeliveryAssigned(delivery: any, motoboy: any) {
  // Para cliente (motoboy a caminho!)
  emitToRoom(`user:${delivery.customerId}`, 'delivery:assigned', {
    deliveryId: delivery._id,
    orderId: delivery.orderId,
    motoboyName: motoboy.name,
    motoboyRating: motoboy.averageRating,
    motoboyPhone: motoboy.phone,
    location: delivery.location,
    estimatedTime: delivery.distance * 5, // minutos
    timestamp: new Date()
  });

  // Para loja
  emitToRoom(`store:${delivery.storeId}`, 'delivery:assigned', {
    deliveryId: delivery._id,
    motoboyName: motoboy.name,
    timestamp: new Date()
  });
}

export function emitWalletUpdated(owner: string, ownerType: string, wallet: any) {
  emitToRoom(`${ownerType}:${owner}`, 'wallet:updated', {
    owner,
    ownerType,
    balance: wallet.balance,
    totalIncome: wallet.totalIncome,
    totalSpent: wallet.totalSpent,
    lastTransaction: wallet.history?.[wallet.history.length - 1],
    timestamp: new Date()
  });
}

export function emitOrderCancelled(order: any, cancellation: any) {
  // Cliente
  emitToRoom(`user:${order.customerId}`, 'order:cancelled', {
    orderId: order._id,
    reason: cancellation.reason,
    refundAmount: cancellation.refundAmount,
    timestamp: new Date()
  });

  // Loja
  emitToRoom(`store:${order.storeId}`, 'order:cancelled', {
    orderId: order._id,
    reason: cancellation.reason,
    timestamp: new Date()
  });
}

export function emitDeliveryRejected(delivery: any, rejectedBy: string, reason: string) {
  emitToRoom(`user:${delivery.customerId}`, 'delivery:reassigned', {
    deliveryId: delivery._id,
    reason,
    rejectedBy,
    message: 'Novo motoboy será atribuído',
    timestamp: new Date()
  });
}

// Função helper
function getOrderStatusLabel(status: string): string {
  const labels: any = {
    criado: 'Pedido criado',
    pago: 'Loja aceitou',
    enviado: 'Motoboy a caminho',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };
  return labels[status] || status;
}
```

### 1.2 Arquivo: `src/app.ts` / `src/server.ts` - Inicializar Socket.IO

**Procure por:**
```typescript
const app = express();
const server = http.createServer(app);
```

**Adicione depois:**

```typescript
import { Server } from 'socket.io';
import { setIO } from './utils/socketEmitter';
import cors from 'cors';

// ✅ NOVO: Inicializar Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
});

setIO(io);

// ✅ NOVO: Namespaces e rooms
io.on('connection', (socket) => {
  console.log(`✅ Cliente conectado: ${socket.id}`);

  // ✅ Cliente se junta a room específica
  // Ex: socket.emit('join_room', { userId: '123', role: 'cliente' })
  socket.on('join_room', (data: { userId: string; role: string }) => {
    const room = `${data.role}:${data.userId}`;
    socket.join(room);
    console.log(`📍 ${socket.id} entrou em ${room}`);
  });

  // ✅ Motoboys entram em room de entregas
  socket.on('join_motoboys_room', () => {
    socket.join('motoboys');
    console.log(`🚗 ${socket.id} entrou em motoboys room`);
  });

  // ✅ Cleanup ao desconectar
  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
  });
});

// ✅ Exportar io para usar em outros arquivos
export { io };
```

---

## ✅ PASSO 2: Criar Hooks React Frontend

### 2.1 Arquivo: `frontend/hooks/useSocket.ts` (NOVO)

```typescript
/**
 * useSocket.ts - Hook para conectar e gerenciar Socket.IO
 */

import { useEffect, useState, useRef, useContext, createContext } from 'react';
import { useSession } from 'next-auth/react';
import io, { Socket } from 'socket.io-client';

// ✅ Context para evitar múltiplas conexões
const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    // ✅ NÃO criar múltiplas conexões
    if (socketRef.current?.connected) return;

    console.log('🔌 Conectando ao Socket.IO...');

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: {
        token: session.user.id,
        role: session.user.role
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    // ✅ Eventos de conexão
    newSocket.on('connect', () => {
      console.log('✅ Socket conectado ao servidor');

      // ✅ Entrar em room específica do usuário
      newSocket.emit('join_room', {
        userId: session.user.id,
        role: session.user.role
      });

      if (session.user.role === 'motoboy') {
        newSocket.emit('join_motoboys_room');
      }
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket desconectado');
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    // ✅ Cleanup
    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const socket = useContext(SocketContext);
  if (!socket) {
    console.warn('⚠️  useSocket: Socket não inicializado. Use <SocketProvider>');
  }
  return socket;
}
```

### 2.2 Arquivo: `frontend/hooks/useRealTime.ts` (NOVO)

```typescript
/**
 * useRealTime.ts - Hook para escutar eventos de Socket.IO
 * Exemplo: useRealTime('order:updated', (data) => refetchOrders())
 */

import { useEffect } from 'react';
import { useSocket } from './useSocket';

export function useRealTime(event: string, callback: (data: any) => void) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    console.log(`👂 Escutando evento: ${event}`);

    socket.on(event, (data) => {
      console.log(`📩 Recebido ${event}:`, data);
      callback(data);
    });

    return () => {
      socket.off(event);
    };
  }, [socket, event, callback]);
}

/**
 * Hook para múltiplos eventos
 */
export function useRealTimeMultiple(events: string[], callback: (event: string, data: any) => void) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    events.forEach((event) => {
      socket.on(event, (data) => {
        console.log(`📩 ${event}:`, data);
        callback(event, data);
      });
    });

    return () => {
      events.forEach((event) => socket.off(event));
    };
  }, [socket, events, callback]);
}
```

---

## ✅ PASSO 3: Integrar em Todas as Páginas

### 3.1 Arquivo: `frontend/_app.tsx` (Envolver com Provider)

**ANTES:**
```typescript
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

**DEPOIS:**
```typescript
import { SocketProvider } from './hooks/useSocket';
import { SessionProvider } from 'next-auth/react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <SocketProvider>
        <Component {...pageProps} />
      </SocketProvider>
    </SessionProvider>
  );
}
```

### 3.2 Exemplo: `frontend/pages/my-orders.tsx`

**ANTES (sem real-time):**
```typescript
export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    const res = await fetch('/api/orders');
    const data = await res.json();
    setOrders(data);
  };

  return (
    <div>
      {orders.map(order => (
        <OrderCard key={order._id} order={order} />
      ))}
    </div>
  );
}
```

**DEPOIS (com real-time):**
```typescript
import { useRealTimeMultiple } from '../hooks/useRealTime';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/orders');
      const data = await res.json();
      setOrders(data);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ NOVO: Escutar múltiplos eventos e refetch automático
  useRealTimeMultiple(
    ['order:updated', 'order:cancelled', 'delivery:assigned'],
    (event, data) => {
      console.log(`📩 ${event} recebido, atualizando...`);
      
      if (event === 'order:updated') {
        // Atualizar order específica em tempo real
        setOrders(prev => 
          prev.map(order => 
            order._id === data.orderId 
              ? { ...order, status: data.status }
              : order
          )
        );
      } else if (event === 'order:cancelled') {
        // Refetch todos os pedidos (mais seguro)
        fetchOrders();
      } else if (event === 'delivery:assigned') {
        // Atualizar status de entrega se relevante
        fetchOrders();
      }
    }
  );

  return (
    <div>
      {isLoading ? (
        <div>Carregando...</div>
      ) : (
        orders.map(order => (
          <OrderCard 
            key={order._id} 
            order={order}
            // ✅ Mostrar indicador visual que está em tempo real
            isRealTime={true}
          />
        ))
      )}
    </div>
  );
}
```

### 3.3 Exemplo: `frontend/pages/my-wallet.tsx`

**ADICIONAR:**
```typescript
import { useRealTime } from '../hooks/useRealTime';

export default function MyWalletPage() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    fetchWallet();
  }, []);

  // ✅ NOVO: Escutar atualizações de carteira em tempo real
  useRealTime('wallet:updated', (data) => {
    if (data.owner === user?.id && data.ownerType === 'user') {
      console.log('💰 Carteira atualizada em tempo real');
      setWallet({
        ...wallet,
        balance: data.balance,
        totalIncome: data.totalIncome,
        totalSpent: data.totalSpent
      });
    }
  });

  // ... resto do componente
}
```

### 3.4 Exemplo: `frontend/pages/deliveries.tsx` (Motoboy)

**ADICIONAR:**
```typescript
import { useRealTimeMultiple } from '../hooks/useRealTime';

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    fetchDeliveries();
  }, []);

  // ✅ NOVO: Motoboy vê novas entregas em tempo real
  useRealTimeMultiple(
    ['delivery:available', 'delivery:reassigned'],
    (event, data) => {
      if (event === 'delivery:available') {
        console.log('🚗 Nova entrega disponível!', data);
        setDeliveries(prev => [...prev, data]);
        
        // ✅ Notificar usuário (opcional)
        if (Notification.permission === 'granted') {
          new Notification('Nova Entrega!', {
            body: `R$ ${data.fee} - ${data.distance}km`,
            icon: '/icon-delivery.png'
          });
        }
      }
    }
  );

  // ... resto
}
```

---

## ✅ PASSO 4: Emitir Eventos em Todos os Controllers

### 4.1 Arquivo: `src/controllers/orderController.ts`

**Adicionar no início:**
```typescript
import {
  emitOrderCreated,
  emitOrderUpdated,
  emitOrderCancelled,
  emitToRoom
} from '../utils/socketEmitter';
```

**Em `createOrder` (após salvar):**
```typescript
// ✅ NOVO: Notificar lojista em tempo real
emitOrderCreated(order.toObject());
```

**Em `acceptOrderByStore` (após aceitar):**
```typescript
// ✅ NOVO: Notificar cliente e motoboys
emitOrderUpdated(order.toObject());
emitToRoom('motoboys', 'delivery:available', {
  deliveryId: delivery._id,
  fee: delivery.fee,
  distance: delivery.distance,
  location: order.address
});
```

### 4.2 Arquivo: `src/controllers/deliveryController.ts`

**Em `claimDelivery` (após claim):**
```typescript
import { emitDeliveryAssigned } from '../utils/socketEmitter';

// ✅ NOVO: Notificar cliente em tempo real
const motoboy = await User.findById(motoboyId);
emitDeliveryAssigned(delivery.toObject(), motoboy?.toObject());
```

### 4.3 Arquivo: `src/controllers/walletController.ts`

**Em `transfer` / `refund` / qualquer operação:**
```typescript
import { emitWalletUpdated } from '../utils/socketEmitter';

// ✅ NOVO: Notificar carteira atualizada
emitWalletUpdated(wallet.owner, wallet.ownerType, wallet.toObject());
```

### 4.4 Arquivo: `src/controllers/cancellationController.ts`

**Em `cancelOrderByCustomer` / `rejectOrderByStore`:**
```typescript
import { emitOrderCancelled } from '../utils/socketEmitter';

// ✅ NOVO: Notificar cancelamento
emitOrderCancelled(order.toObject(), cancellation.toObject());
```

---

## ✅ PASSO 5: Checklist de Implementação

```
BACKEND:
════════════════════════════════════════════════════════════════
□ Verificar/Criar src/utils/socketEmitter.ts
  └─ Funções base: emitToRoom, emitToAll
  └─ Funções negócio: emitOrderCreated, emitDeliveryAssigned, etc

□ Atualizar src/app.ts / src/server.ts
  └─ Inicializar Socket.IO
  └─ Definir namespaces e rooms
  └─ Connection handler

□ Adicionar imports em todos os controllers:
  ├─ src/controllers/orderController.ts
  ├─ src/controllers/deliveryController.ts
  ├─ src/controllers/walletController.ts
  ├─ src/controllers/cancellationController.ts
  └─ src/controllers/gamificationController.ts

□ Chamar emitX() após cada operação que muda dados

□ Instalar socket.io:
  ```
  npm install socket.io
  ```


FRONTEND:
════════════════════════════════════════════════════════════════
□ Instalar socket.io-client:
  ```
  npm install socket.io-client
  ```

□ Criar frontend/hooks/useSocket.ts
  └─ SocketProvider com context
  └─ useSocket hook

□ Criar frontend/hooks/useRealTime.ts
  └─ useRealTime hook (1 evento)
  └─ useRealTimeMultiple hook (n eventos)

□ Atualizar frontend/_app.tsx
  └─ Envolver com <SocketProvider>

□ Atualizar CADA página:
  ├─ pages/my-orders.tsx
  ├─ pages/my-wallet.tsx
  ├─ pages/deliveries.tsx (motoboy)
  ├─ pages/store-orders.tsx (lojista)
  └─ pages/checkout.tsx (opcional, menos crítico)

□ Adicionar useRealTimeMultiple() em cada página
  └─ Escutar eventos relevantes
  └─ Refetch dados ou atualizar estado
  └─ Mostrar notificações (opcional)


TESTES:
════════════════════════════════════════════════════════════════
□ T1: Conectar 2 clientes (cliente + servidor)
     └─ Abrir browser dev tools, Network > WS
     └─ Verificar conexão estabelecida

□ T2: Criar pedido em cliente A
     └─ Servidor escuta 'order:created'
     └─ Emite para lojista
     └─ Lojista vê em tempo real (SEM F5)

□ T3: Aceitar pedido em lojista
     └─ Cliente vê como 'pago' em tempo real
     └─ Motoboys recebem nova entrega

□ T4: Motoboy reclama entrega
     └─ Cliente vê motoboy atribuído em tempo real
     └─ Nome, rating, telefone do motoboy

□ T5: Refund/Cancelamento
     └─ Carteira cliente é atualizada em tempo real

□ T6: Notificação Push (opcional)
     └─ Browser notifica "Nova entrega!" ao motoboy
```

---

## 🎯 EVENTOS RECOMENDADOS (Completo)

```javascript
// ORDERS
'order:created'       → Quando cliente cria pedido
'order:accepted'      → Quando loja aceita
'order:updated'       → Quando status muda
'order:cancelled'     → Quando cancelado

// DELIVERIES
'delivery:available'  → Entrega aguardando motoboy
'delivery:assigned'   → Motoboy atribuído
'delivery:picked'     → Saiu da loja
'delivery:delivered'  → Entregue
'delivery:cancelled'  → Cancelada
'delivery:reassigned' → Reatribuída

// WALLETS
'wallet:updated'      → Saldo/histórico alterado
'wallet:refunded'     → Reembolso processado

// GAMIFICATION
'gamification:points_earned'  → Pontos ganhos (motoboy)
'gamification:badge_earned'   → Badge conquistada

// RATINGS
'rating:submitted'    → Avaliação recebida

// ERRORS
'error:refund_failed' → Reembolso falhou
'error:payment_failed' → Pagamento falhou
```

---

## 📊 Impacto na UX

```
ANTES (com F5):
════════════════════════════════════════════════════════════════
1. Cliente cria pedido
   └─ Página fica "congelada" até refetch manual (F5)
   └─ Não sabe se pedido foi criado realmente

2. Lojista recebe pedido
   └─ Precisa atualizar manualmente para ver
   └─ Demora 30+ segundos (polling não é real-time)

3. Motoboy aceita
   └─ Cliente não sabe que motoboy foi atribuído
   └─ Precisa fazer F5 para ver

🔴 RESULTADO: UX RUIM, CONFUSÃO, SISTEMA PARECE QUEBRADO


DEPOIS (com WebSocket):
════════════════════════════════════════════════════════════════
1. Cliente cria pedido
   └─ Instantaneamente aparece no histórico
   └─ Status atualiza em tempo real ✅

2. Lojista recebe pedido
   └─ Banner notifica "Novo pedido!" 🔔
   └─ Página atualiza automicamente (1 segundo)
   └─ Não precisa fazer F5

3. Motoboy aceita
   └─ Cliente vê "🚗 Motoboy a caminho!"
   └─ Nome, foto e rating do motoboy aparecem
   └─ Atualizado em tempo real (< 100ms)

4. Refund
   └─ Carteira cliente atualiza em tempo real
   └─ Sem delay, INSTANTÂNEO

✅ RESULTADO: UX EXCELENTE, SISTEMA FLUIDO, PROFISSIONAL
```

---

## 💾 Arquivos a Modificar - Resumo Rápido

```
CRIAR NOVOS:
├─ frontend/hooks/useSocket.ts (60 linhas)
├─ frontend/hooks/useRealTime.ts (40 linhas)
└─ src/jobs/deliveryTimeout.job.ts (da análise prévia)

MODIFICAR:
├─ src/utils/socketEmitter.ts ← Expandir com novos eventos
├─ src/app.ts / src/server.ts ← Inicializar Socket.IO (30 linhas)
├─ frontend/_app.tsx ← Envolver com SocketProvider (5 linhas)
├─ frontend/pages/my-orders.tsx ← Adicionar useRealTime (15 linhas)
├─ frontend/pages/my-wallet.tsx ← Adicionar useRealTime (10 linhas)
├─ frontend/pages/deliveries.tsx ← Adicionar useRealTime (15 linhas)
├─ src/controllers/orderController.ts ← Adicionar emits (3 lugares)
├─ src/controllers/deliveryController.ts ← Adicionar emits (3 lugares)
├─ src/controllers/walletController.ts ← Adicionar emits (2 lugares)
├─ src/controllers/cancellationController.ts ← Adicionar emits (3 lugares)
└─ package.json ← Adicionar socket.io (já se tem socket.io-client?)

INSTALAR:
├─ npm install socket.io (backend)
└─ npm install socket.io-client (frontend) - verificar se já tem
```

---

## 🚀 Timeline de Implementação

```
HORA 1:
├─ Expandir socketEmitter.ts com novos eventos
├─ Inicializar Socket.IO em app.ts

HORA 2:
├─ Criar useSocket.ts (SocketProvider)
├─ Criar useRealTime.ts

HORA 3:
├─ Atualizar _app.tsx
├─ Atualizar todas as páginas (my-orders, wallet, deliveries, etc)

HORA 4:
├─ Adicionar emits em todos os controllers (orderController, deliveryController, etc)

HORA 5:
├─ Testar tudo (T1-T6)
├─ Debug WebSocket connections
├─ Validar que não há múltiplas emissões

RESULTADO: Todas as páginas atualizando em tempo real SEM F5! ✅
```

---

## ⚡ Quick Start Command

```bash
# Terminal 1: Backend
cd backend
npm install socket.io
npm run dev

# Terminal 2: Frontend
cd frontend
npm install socket.io-client
npm run dev

# Abrir 2 abas:
# Tab 1: http://localhost:3000 com usuário A
# Tab 2: http://localhost:3000 com usuário B
# Criar pedido em A, ver aparecer em B em tempo real! 🎉
```

---

**Pronto para implementar!** 🚀

Tempo total: 4-5 horas para implementação completa
Resultado: Sistema profissional com real-time updates
