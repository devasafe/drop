# ✅ WEBSOCKET IMPLEMENTATION CHECKLIST - PRONTO PARA USAR

**Data:** 3 de Março de 2026  
**Status:** 🟢 Pronto para Implementação  
**Tempo Total:** 4-5 horas  

---

## 🚀 SETUP RÁPIDO

### Instalar Dependências

```bash
# Backend
cd backend
npm install socket.io

# Frontend
cd frontend
npm install socket.io-client

# Ambos prontos!
```

---

## 📋 BACKEND - CHECKLIST

### PASSO 1: Expandir socketEmitter.ts (30 min)
```
✅ Arquivo: src/utils/socketEmitter.ts

Funções Base:
□ setIO(io)
□ getIO()
□ emitToRoom(room, event, data)
□ emitToAll(event, data)

Funções de Negócio:
□ emitOrderCreated(order)
□ emitOrderUpdated(order)
□ emitDeliveryAssigned(delivery, motoboy)
□ emitWalletUpdated(owner, ownerType, wallet)
□ emitOrderCancelled(order, cancellation)
□ emitDeliveryRejected(delivery, rejectedBy, reason)
```

### PASSO 2: Inicializar Socket.IO (20 min)
```
✅ Arquivo: src/app.ts ou src/server.ts

□ import { Server } from 'socket.io'
□ const io = new Server(server, { cors: {...} })
□ setIO(io)
□ io.on('connection', (socket) => {
    socket.on('join_room', (data) => {...})
    socket.on('join_motoboys_room', () => {...})
    socket.on('disconnect', () => {...})
  })
□ export { io }
```

### PASSO 3: Adicionar Emits em Controllers (1.5 horas)

#### orderController.ts
```
✅ Importar:
□ import { emitOrderCreated, emitOrderUpdated, emitOrderCancelled } from '../utils/socketEmitter'

Em createOrder():
□ Após order.save()
  └─ emitOrderCreated(order.toObject())

Em acceptOrderByStore():
□ Após delivery.save()
  └─ emitOrderUpdated(order.toObject())
  └─ emitToRoom('motoboys', 'delivery:available', {...})
```

#### deliveryController.ts
```
✅ Importar:
□ import { emitDeliveryAssigned, emitToRoom } from '../utils/socketEmitter'

Em claimDelivery():
□ Após delivery.save()
  └─ const motoboy = await User.findById(motoboyId)
  └─ emitDeliveryAssigned(delivery.toObject(), motoboy?.toObject())

Em finalizarEntrega():
□ Após order.status = 'entregue'
  └─ emitToRoom(`user:${order.customerId}`, 'delivery:delivered', {...})
```

#### walletController.ts
```
✅ Importar:
□ import { emitWalletUpdated } from '../utils/socketEmitter'

Em transfer() / deposit() / withdraw():
□ Após wallet.save()
  └─ emitWalletUpdated(wallet.owner, wallet.ownerType, wallet.toObject())
```

#### cancellationController.ts
```
✅ Importar:
□ import { emitOrderCancelled, emitDeliveryRejected } from '../utils/socketEmitter'

Em cancelOrderByCustomer():
□ Após order.save()
  └─ emitOrderCancelled(order.toObject(), cancellation.toObject())

Em rejectOrderByStore():
□ Após order.save()
  └─ emitOrderCancelled(order.toObject(), cancellation.toObject())

Em rejectDeliveryByMotoboy():
□ Após delivery.save()
  └─ emitDeliveryRejected(delivery.toObject(), 'motoboy', reason)
```

---

## 📋 FRONTEND - CHECKLIST

### PASSO 1: Criar useSocket Hook (20 min)
```
✅ Arquivo: frontend/hooks/useSocket.ts

□ import io from 'socket.io-client'
□ import { useSession } from 'next-auth/react'
□ createContext(SocketContext)
□ function SocketProvider({ children }) { ... }
□ export function useSocket() { ... }
```

### PASSO 2: Criar useRealTime Hook (15 min)
```
✅ Arquivo: frontend/hooks/useRealTime.ts

□ export function useRealTime(event, callback) { ... }
□ socket.on(event, (data) => callback(data))
□ socket.off(event) on cleanup

□ export function useRealTimeMultiple(events, callback) { ... }
□ Loop events e add listeners
```

### PASSO 3: Envolver App com Provider (5 min)
```
✅ Arquivo: frontend/_app.tsx

Demo ANTES:
  export default function App({ Component, pageProps }) {
    return <Component {...pageProps} />
  }

Demo DEPOIS:
  import { SocketProvider } from './hooks/useSocket'
  
  export default function App({ Component, pageProps }) {
    return (
      <SessionProvider session={pageProps.session}>
        <SocketProvider>
          <Component {...pageProps} />
        </SocketProvider>
      </SessionProvider>
    )
  }
```

### PASSO 4: Atualizar Páginas (2 horas)

#### my-orders.tsx
```
✅ Adicionar:
□ import { useRealTimeMultiple } from '../hooks/useRealTime'

□ useRealTimeMultiple(
    ['order:updated', 'order:cancelled', 'delivery:assigned'],
    (event, data) => {
      if (event === 'order:updated') {
        setOrders(prev => prev.map(o => 
          o._id === data.orderId ? {...o, status: data.status} : o
        ))
      } else if (event === 'order:cancelled') {
        fetchOrders()  // refetch
      } else if (event === 'delivery:assigned') {
        fetchOrders()
      }
    }
  )
```

#### my-wallet.tsx
```
✅ Adicionar:
□ import { useRealTime } from '../hooks/useRealTime'

□ useRealTime('wallet:updated', (data) => {
    if (data.owner === user?.id) {
      setWallet({
        ...wallet,
        balance: data.balance,
        totalIncome: data.totalIncome,
        totalSpent: data.totalSpent
      })
    }
  })
```

#### deliveries.tsx (Motoboy)
```
✅ Adicionar:
□ import { useRealTimeMultiple } from '../hooks/useRealTime'

□ useRealTimeMultiple(
    ['delivery:available', 'delivery:reassigned'],
    (event, data) => {
      if (event === 'delivery:available') {
        setDeliveries(prev => [...prev, data])
        // Notificação push opcional
        if (Notification.permission === 'granted') {
          new Notification('Nova Entrega!', {
            body: `R$ ${data.fee}`
          })
        }
      } else if (event === 'delivery:reassigned') {
        setDeliveries(prev => prev.filter(d => d._id !== data.deliveryId))
      }
    }
  )
```

#### store-orders.tsx (Lojista)
```
✅ Adicionar:
□ import { useRealTime } from '../hooks/useRealTime'

□ useRealTime('order:created', (data) => {
    setOrders(prev => [...prev, data])
    // Toast notificação
    toast.success(`📬 Novo pedido! R$ ${data.totalValue}`)
  })

□ useRealTime('order:updated', (data) => {
    setOrders(prev => prev.map(o =>
      o._id === data.orderId ? {...o, status: data.status} : o
    ))
  })
```

---

## 🧪 TESTES - CHECKLIST

```
TESTE 1: Conexão básica
□ Abrir browser DevTools → Network → WS
□ Deve aparecer: ws://localhost:5000/socket.io/
□ Status: "101 Switching Protocols"

TESTE 2: join_room
□ Abrir console
□ Deve aparecer: "✅ Socket conectado ao servidor"
□ Também: "📍 Socket entrou em user:XXX"

TESTE 3: order:created
□ Abrir 2 abas browser
□ Tab A: POST /orders (criar pedido)
□ Tab B: Socket escuta 'order:created'
□ Tab B: Deve receber em < 100ms (SEM F5)

TESTE 4: wallet:updated
□ Tab A: POST /wallet/transfer (enviar dinheiro)
□ Tab B: Deve receber socket event
□ Tab B: Saldo atualiza em tempo real

TESTE 5: delivery:assigned
□ Tab A: POST /deliveries/claim (motoboy reclama)
□ Tab B: Socket.on('delivery:assigned')
□ Tab B: Vê nome e rating do motoboy

TESTE 6: order:cancelled
□ Tab A: POST /orders/cancel
□ Tab B: Socket.on('order:cancelled')
□ Tab B: Vê refund na carteira

TESTE 7: Motoboys room
□ Abrir 3 abas
│ ├─ Tab Cliente (user:123)
│ ├─ Tab Motoboy 1 (motoboys room)
│ └─ Tab Motoboy 2 (motoboys room)
□ Tab Cliente: POST /orders (criar)
□ Tab Lojista: POST /accept
□ Tab Motoboy 1 + 2: Ambos recebem 'delivery:available'
□ Ambos podem claim, apenas 1 consegue (atomic)

TESTE 8: Load test
□ Abrir 10 abas
□ Enviar 100 eventos/segundo
□ Nenhuma perda de mensagem
□ Latência < 200ms
```

---

## 🚨 Problemas Comuns

```
❌ "Socket não inicializado"
√ Solução: Verificar se <SocketProvider> envolve todo App

❌ "Múltiplas conexões"
√ Solução: useRef na SocketProvider para não fazer reconnect

❌ "Não recebe eventos"
√ Solução: Verificar se socket.join('room') foi chamado

❌ "Re-render infinito"
√ Solução: Adicionar useCallback em callback do useRealTime

❌ "Latência alta (> 1 segundo)"
√ Solução: Verificar backend logs, pode estar slow em DB queries

❌ "Desconecta frequentemente"
√ Solução: Aumentar reconnectionAttempts, adicionar heartbeat
```

---

## 📊 Sumário de Arquivos

```
CRIAR:
├─ frontend/hooks/useSocket.ts (70 linhas)
├─ frontend/hooks/useRealTime.ts (45 linhas)

MODIFICAR:
├─ src/utils/socketEmitter.ts (100 → 250 linhas)
├─ src/app.ts (add 20 linhas)
├─ frontend/_app.tsx (add 3 linhas)
├─ src/controllers/orderController.ts (add 3 linhas)
├─ src/controllers/deliveryController.ts (add 5 linhas)
├─ src/controllers/walletController.ts (add 3 linhas)
├─ src/controllers/cancellationController.ts (add 3 linhas)
├─ frontend/pages/my-orders.tsx (add 15 linhas)
├─ frontend/pages/my-wallet.tsx (add 12 linhas)
├─ frontend/pages/deliveries.tsx (add 15 linhas)
└─ frontend/pages/store-orders.tsx (add 15 linhas)

TOTAL: ~15 arquivos, ~120 linhas novas
TEMPO: 4-5 horas
```

---

## 🏁 PRONTO PARA COMEÇAR?

1. ✅ Leu [PROMPT_WEBSOCKET_REALTIME.md](PROMPT_WEBSOCKET_REALTIME.md)?
2. ✅ Entendeu a arquitetura em [WEBSOCKET_ARQUITETURA_VISUAL.md](WEBSOCKET_ARQUITETURA_VISUAL.md)?
3. ✅ Seguiu este checklist?

**ENTÃO COMECE A IMPLEMENTAR!** 🚀

→ Terminal 1: `npm install socket.io socket.io-client`  
→ Terminal 2: `npm run dev` (backend)  
→ Terminal 3: `npm run dev` (frontend)  
→ Abrir 2 abas: criar pedido em uma, ver atualizar na outra SEM F5!  

---

**Resultado Final:**
- ✅ Todas as páginas atualizam em tempo real
- ✅ Sem F5, sem delay
- ✅ Cliente vê motoboy a caminho instantaneamente
- ✅ Carteira atualiza em < 100ms
- ✅ Sistema profissional e fluido

**Vamos lá!** 🎉
