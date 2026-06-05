# WebSocket Real-Time — Implementação Completa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar todos os gaps de WebSocket que impedem o site de ser completamente em tempo real.

**Architecture:** A infraestrutura Socket.IO já existe e está ~70% funcional. Este plano corrige gaps pontuais: eventos que são definidos mas nunca emitidos, listeners do frontend que ouvem o evento errado, e estado de UI que não responde a eventos de socket. Nenhuma nova infraestrutura é criada — apenas conexões que faltam.

**Tech Stack:** Socket.IO 4, Node.js/Express, Next.js 13, TypeScript, CSS Modules

---

## Mapa de Arquivos

**Backend (modificar):**
- `src/services/notifier.ts` — adicionar handler `delivery:location_updated` no `io.on('connection')`
- `src/controllers/broadcastController.ts` — corrigir nome do evento de `notification` → `notification:received`
- `src/controllers/walletController.ts` — adicionar chamadas `emitWalletUpdated` / `emitWalletTransferCompleted`

**Frontend (modificar):**
- `frontend/hooks/useSync.ts` — corrigir `useDeliveries` (remover entregues do pool) + adicionar `useWallet`
- `frontend/components/Nav.tsx` — usar `useNotifications().unreadCount` ao invés de estado local
- `frontend/pages/notifications.tsx` — usar `useNotifications()` do `useSync.ts` para tempo real
- `frontend/pages/my-wallet.tsx` — usar `useWallet()` para saldo em tempo real

---

## Análise dos Gaps (resumo)

| Gap | Impacto | Arquivo |
|-----|---------|---------|
| Motoboy emite `delivery:location_updated` mas servidor não trata | Cliente não vê localização ao vivo | `notifier.ts` |
| Broadcast emite evento `notification` mas frontend ouve `notification:received` | Badge de notificações não aparece | `broadcastController.ts` |
| `walletController` não chama `emitWalletUpdated` | Saldo da carteira não atualiza em tempo real | `walletController.ts` |
| `useDeliveries` não remove entrega quando outra pessoa aceita | Motoboy vê entrega já pega por outro | `useSync.ts` |
| Nav escuta `notification` (só motoboys), deveria usar `useNotifications` | Badge não funciona para clientes/lojistas | `Nav.tsx` |
| `notifications.tsx` não usa socket | Página de notificações não atualiza ao vivo | `notifications.tsx` |
| `my-wallet.tsx` não usa socket | Saldo não atualiza sem refresh | `my-wallet.tsx` |

---

## Task 1: Backend — Relay localização do motoboy via Socket.IO

**Situação:** `useLocationTracking` emite `delivery:location_updated` do browser do motoboy para o servidor. O servidor em `notifier.ts` não tem handler para este evento → ninguém recebe a localização em tempo real.

**Files:**
- Modify: `src/services/notifier.ts`

- [ ] **Step 1: Localizar o bloco `io.on('connection')` em `notifier.ts`**

Abra `src/services/notifier.ts`. O bloco está na linha ~188:
```typescript
io.on('connection', (socket: Socket) => {
  // ... handlers existentes ...
  socket.on('disconnect', () => { ... });
});
```

- [ ] **Step 2: Adicionar handler `delivery:location_updated` dentro do `io.on('connection')`**

Adicione imediatamente antes do handler `disconnect` (antes da linha `socket.on('disconnect', ...)`):

```typescript
    // 📍 Relay localização do motoboy para cliente e loja
    socket.on('delivery:location_updated', async (data: {
      deliveryId: string;
      latitude: number;
      longitude: number;
      accuracy?: number;
      timestamp?: string;
    }) => {
      if (role !== 'motoboy') return; // só motoboys emitem localização

      const { deliveryId, latitude, longitude, accuracy, timestamp } = data;
      if (!deliveryId || latitude == null || longitude == null) return;

      try {
        const Delivery = require('../models/Delivery').default;
        const Order = require('../models/Order').default;

        const delivery = await Delivery.findById(deliveryId)
          .select('orderId motoboyId')
          .lean();

        // Segurança: só o motoboy atribuído pode enviar localização
        if (!delivery || delivery.motoboyId?.toString() !== userId) return;

        const order = await Order.findById(delivery.orderId)
          .select('customerId storeId')
          .lean();

        if (!order) return;

        const locationPayload = {
          _id: deliveryId,
          location: { latitude, longitude, accuracy },
          estimatedTime: null,
          timestamp: timestamp || new Date().toISOString(),
        };

        // Enviar para cliente
        io!.to(`user:${order.customerId}`).emit('delivery:location_updated', locationPayload);
        // Enviar para loja
        io!.to(`store:${order.storeId}`).emit('delivery:location_updated', locationPayload);

        console.log(`📍 [Socket] Location relayed: delivery=${deliveryId} lat=${latitude} lng=${longitude}`);
      } catch (err) {
        console.error('[Socket] Error relaying location:', err);
      }
    });
```

- [ ] **Step 3: Verificar TypeScript sem erros**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd D:/PROJETOS/Drop && git add src/services/notifier.ts && git commit -m "feat(socket): relay motoboy location updates to client and store rooms"
```

---

## Task 2: Backend — Corrigir evento de broadcast notification

**Situação:** `broadcastController.ts` emite evento `notification` mas `useNotifications` em `useSync.ts` escuta `notification:received`. Os dois nunca se encontram — o badge da navbar não é atualizado para usuários não-motoboy quando broadcast chega.

**Files:**
- Modify: `src/controllers/broadcastController.ts`

- [ ] **Step 1: Ler o bloco de emit em `broadcastController.ts`**

Linha ~87-96:
```typescript
// Emite via socket para cada usuário
for (const u of batch) {
  try {
    emitToRoom(`user:${u._id}`, 'notification', {
      type: 'broadcast',
      title: title.trim(),
      message: body.trim(),
      broadcastId: broadcast._id,
    });
  } catch { /* ignora erros individuais de socket */ }
}
```

- [ ] **Step 2: Corrigir o evento e o payload**

Substitua o bloco de emit por:

```typescript
      // Emite via socket para cada usuário (notification:received — ouvido por useNotifications)
      for (const u of batch) {
        try {
          emitToRoom(`user:${u._id}`, 'notification:received', {
            _id: `broadcast_${broadcast._id}_${u._id}`,
            userId: u._id.toString(),
            title: title.trim(),
            message: body.trim(),
            type: 'broadcast',
            read: false,
            broadcastId: broadcast._id,
            createdAt: new Date().toISOString(),
          });
        } catch { /* ignora erros individuais de socket */ }
      }
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd D:/PROJETOS/Drop && git add src/controllers/broadcastController.ts && git commit -m "fix(socket): broadcast notifications use notification:received event to match frontend listeners"
```

---

## Task 3: Backend — Emitir eventos de wallet em `walletController.ts`

**Situação:** As funções `emitWalletUpdated` e `emitWalletTransferCompleted` existem em `socketEmitter.ts` mas nunca são chamadas. Quando o saldo muda (depósito, saque, transferência), o frontend não recebe notificação — o usuário tem que recarregar a página para ver o novo saldo.

**Files:**
- Modify: `src/controllers/walletController.ts`

- [ ] **Step 1: Adicionar import no topo de `walletController.ts`**

Logo após os imports existentes (linha ~12), adicione:

```typescript
import { emitWalletUpdated, emitWalletTransferCompleted } from '../utils/socketEmitter';
```

- [ ] **Step 2: Emitir após `creditWallet` (linha ~118)**

Após `await session.commitTransaction(); session.endSession();` em `creditWallet`, mas antes do `return res.json(...)`:

```typescript
    await session.commitTransaction();
    session.endSession();

    // 💰 Notificar usuário em tempo real
    emitWalletUpdated(userId, 'cliente', {
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      updatedAt: new Date(),
    });

    return res.json({
```

- [ ] **Step 3: Emitir após `transferWallet` (banco, linha ~170)**

Após `await wallet.save();` em `transferWallet`, antes do `return res.json(...)`:

```typescript
    await wallet.save();

    // 💸 Notificar usuário do saldo atualizado
    emitWalletUpdated(userId, 'motoboy', {
      balance: wallet.balance,
      totalIncome: wallet.totalIncome,
      totalSpent: wallet.totalSpent,
      updatedAt: new Date(),
    });

    return res.json({
```

- [ ] **Step 4: Emitir após `transferBetweenWallets` (linha ~581)**

Após `await session.commitTransaction(); session.endSession();` (dentro do try interno de `transferBetweenWallets`), antes do `return res.json(...)`:

```typescript
      await session.commitTransaction();
      session.endSession();

      // 💸 Notificar ambas as partes em tempo real
      const fromOwnerId = fromStoreId || userId;
      const fromOwnerType = fromStoreId ? 'lojista' : 'cliente';
      emitWalletUpdated(fromOwnerId, fromOwnerType as any, {
        balance: fromWallet.balance,
        totalIncome: fromWallet.totalIncome,
        totalSpent: fromWallet.totalSpent,
        updatedAt: new Date(),
      });

      if (toUserId) {
        emitWalletTransferCompleted(fromOwnerId, toUserId, amount, transferRef);
      }

      return res.json({
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
cd D:/PROJETOS/Drop && git add src/controllers/walletController.ts && git commit -m "feat(socket): emit wallet:updated and wallet:transfer_completed after balance changes"
```

---

## Task 4: Frontend — Corrigir `useDeliveries` e adicionar `useWallet`

**Situação A:** Quando motoboy X aceita uma entrega, `delivery:status_changed` chega com `status: 'assigned'`. O `useDeliveries` dos outros motoboys atualiza o status mas não REMOVE a entrega do pool de disponíveis — o card continua visível mas já está ocupado.

**Situação B:** Não existe hook `useWallet` — as páginas de carteira não recebem atualizações em tempo real de `wallet:updated`.

**Files:**
- Modify: `frontend/hooks/useSync.ts`

- [ ] **Step 1: Corrigir handler `handleDeliveryStatusChanged` no `useDeliveries`**

Encontre o hook `useDeliveries` (linha ~109). O handler atual atualiza o status mas não remove. Substitua:

```typescript
    const handleDeliveryStatusChanged = (data: any) => {
      setDeliveries(prev =>
        prev.map(d => (d._id === data._id ? { ...d, status: data.status } : d))
      );
    };
```

Por:

```typescript
    // Quando entrega muda de status: se não está mais 'pending', remove do pool de disponíveis
    const handleDeliveryStatusChanged = (data: any) => {
      if (data.status !== 'pending') {
        setDeliveries(prev => prev.filter(d => d._id !== data._id));
      } else {
        setDeliveries(prev =>
          prev.map(d => (d._id === data._id ? { ...d, status: data.status } : d))
        );
      }
    };
```

- [ ] **Step 2: Adicionar hook `useWallet` ao final de `useSync.ts`**

Após o último export (`useProduct`) no final do arquivo, adicione:

```typescript
export const useWallet = (ownerId?: string, ownerType: 'user' | 'store' = 'user') => {
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }

    const endpoint = ownerType === 'store'
      ? `/wallets/store/${ownerId}`
      : `/wallets/${ownerId}`;

    const fetchWallet = async () => {
      try {
        const res = await api.get(endpoint);
        setWallet(res.data);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar carteira:', err);
        setLoading(false);
      }
    };

    fetchWallet();

    const handleWalletUpdated = (data: any) => {
      if (data.userId === ownerId || data.userId === ownerId) {
        setWallet((prev: any) => ({
          ...prev,
          balance: data.balance,
          totalIncome: data.totalIncome,
          totalSpent: data.totalSpent,
        }));
      }
    };

    const handleTransferReceived = (data: any) => {
      // Re-fetch para obter dados atualizados
      fetchWallet();
    };

    const handleRefund = (data: any) => {
      if (data.userId === ownerId) {
        fetchWallet();
      }
    };

    const unsub1 = on('wallet:updated', handleWalletUpdated);
    const unsub2 = on('wallet:transfer_received', handleTransferReceived);
    const unsub3 = on('wallet:refund', handleRefund);

    return () => {
      unsub1(); unsub2(); unsub3();
    };
  }, [ownerId, ownerType, on]);

  return { wallet, loading, setWallet };
};
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd D:/PROJETOS/Drop && git add frontend/hooks/useSync.ts && git commit -m "feat(socket): fix useDeliveries to remove claimed deliveries + add useWallet hook"
```

---

## Task 5: Frontend — Corrigir badge de notificações na Nav

**Situação:** `Nav.tsx` escuta evento `notification` (emitido apenas para a room `motoboys` via `notifyMotoboys()`). Clientes e lojistas nunca recebem este evento — o badge de notificações na navbar não é atualizado em tempo real para eles. A solução é usar `useNotifications()` de `useSync.ts`, que escuta `notification:received` (que agora é emitido corretamente após Task 2).

**Files:**
- Modify: `frontend/components/Nav.tsx`

- [ ] **Step 1: Adicionar import de `useNotifications`**

Adicione ao bloco de imports existente no topo do arquivo:

```typescript
import { useNotifications } from '../hooks/useSync';
```

- [ ] **Step 2: Substituir estado local de notificações**

Encontre (linha ~108):
```typescript
  const [notifications, setNotifications] = useState<any[]>([]);
```

Substitua por:
```typescript
  const { unreadCount: notifUnreadCount } = useNotifications();
```

- [ ] **Step 3: Remover o `useEffect` de fetch e o listener `notification`**

Remova os dois useEffects de notificações:

**Remover bloco 1** (fetch inicial, linhas ~146-151):
```typescript
  useEffect(() => {
    if (!user) return;
    api.get('/notifications').then(res => {
      setNotifications(res.data);
    }).catch(() => { /* silencioso — badge some, não trava a navbar */ });
  }, [user]);
```

**Remover bloco 2** (listener `notification`, linhas ~154-160):
```typescript
  useEffect(() => {
    if (!socket || !user) return;
    const unsub = socket.on('notification', () => {
      // Incrementa o badge imediatamente sem refetch completo
      setNotifications(prev => [...prev, { _id: Date.now().toString(), read: false }]);
    });
```
(note: este bloco retorna `unsub` — remova o bloco inteiro incluindo o `return unsub;` e o fechamento)

**Remover bloco 3** (zeragem ao entrar em notificações, linhas ~167-171):
```typescript
  useEffect(() => {
    if (router.pathname === '/notifications') {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  }, [router.pathname]);
```

- [ ] **Step 4: Corrigir variável `unread`**

Encontre (linha ~165):
```typescript
  const unread = notifications.filter((n: any) => !n.read).length;
```

Substitua por:
```typescript
  const unread = notifUnreadCount;
```

- [ ] **Step 5: Verificar TypeScript sem erros**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -30
```
Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
cd D:/PROJETOS/Drop && git add frontend/components/Nav.tsx && git commit -m "fix(nav): use useNotifications hook for real-time notification badge instead of local state"
```

---

## Task 6: Frontend — `notifications.tsx` com atualizações em tempo real

**Situação:** A página `/notifications` faz um GET ao carregar e nunca mais atualiza. Se uma nova notificação chegar enquanto o usuário está na página, ela não aparece. Usando `useNotifications()` de `useSync.ts` o problema é resolvido — o hook escuta `notification:received` e adiciona ao estado automaticamente.

**Files:**
- Modify: `frontend/pages/notifications.tsx`

- [ ] **Step 1: Adicionar import de `useNotifications` e `useSocket`**

No topo do arquivo, após os imports existentes, adicione:
```typescript
import { useNotifications } from '../hooks/useSync';
```

- [ ] **Step 2: Substituir estado local pelo hook**

Encontre (linhas ~56-71):
```typescript
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
      // Marca todas como lidas silenciosamente ao abrir a página
      api.patch('/notifications/read-all').catch(() => {});
    } catch {
      setError('Não foi possível carregar as notificações.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (user) fetchNotifications();
  }, [user, loading, router, fetchNotifications]);
```

Substitua por:
```typescript
  const { notifications: rawNotifications, loading: notifLoading } = useNotifications();
  const notifications = rawNotifications as Notification[];
  const fetching = notifLoading;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    // Marca todas como lidas ao abrir a página
    if (user) {
      api.patch('/notifications/read-all').catch(() => {});
    }
  }, [user, loading, router]);
```

- [ ] **Step 3: Corrigir a função `remove`**

A função `remove` existente chama `setNotifications` diretamente. Como agora usamos o hook, precisamos uma versão que chame a API e depois re-fetche.

Encontre:
```typescript
  const remove = async (id: string) => {
    setNotifications(prev => prev.filter(n => n._id !== id));
    try { await api.delete(`/notifications/${id}`); } catch { }
  };
```

A lógica de remoção otimista continua OK se o hook expõe `setNotifications`. Mas como `useNotifications` não expõe setter para deletar, a abordagem mais simples é manter a remoção via API e controlar estado local sobreposto. Alternativamente, adicione `setNotifications` ao retorno de `useNotifications` ou use estado local para remoções:

Substitua por:
```typescript
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const remove = async (id: string) => {
    setRemovedIds(prev => new Set([...prev, id]));
    try { await api.delete(`/notifications/${id}`); } catch { }
  };

  const visibleNotifications = notifications.filter(n => !removedIds.has(n._id));
```

E no JSX, use `visibleNotifications` ao invés de `notifications`:
- `notifications.length === 0` → `visibleNotifications.length === 0`
- `notifications.map(...)` → `visibleNotifications.map(...)`
- `const unreadCount = notifications.filter(n => !n.read).length;` → `const unreadCount = visibleNotifications.filter(n => !n.read).length;`

- [ ] **Step 4: Verificar TypeScript**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
cd D:/PROJETOS/Drop && git add frontend/pages/notifications.tsx && git commit -m "feat(notifications): real-time updates via useNotifications hook"
```

---

## Task 7: Frontend — Saldo da carteira em tempo real

**Situação:** `my-wallet.tsx` busca dados via API uma vez ao montar e nunca atualiza. Quando um pagamento de pedido credita a carteira, o usuário vê o saldo antigo até recarregar. Usando `useWallet()` (criado na Task 4), o saldo atualiza automaticamente.

**Files:**
- Modify: `frontend/pages/my-wallet.tsx`

- [ ] **Step 1: Adicionar import de `useWallet`**

No topo do arquivo, após os imports existentes:
```typescript
import { useWallet } from '../hooks/useSync';
```

- [ ] **Step 2: Usar `useWallet` para atualização em tempo real**

Encontre o estado atual de wallet (linha ~28-29):
```typescript
  const [wallet, setWallet] = useState<MyWallet | null>(null);
```

Após `const currentRole = user?.activeRole || user?.role || 'cliente';`, adicione:
```typescript
  const ownerType = (currentRole === 'lojista' || currentRole === 'store') ? 'store' : 'user';
  const ownerId = ownerType === 'store' ? user?.storeId : user?._id;
  const { wallet: realtimeWallet } = useWallet(ownerId, ownerType);
```

Depois, no `useEffect` que faz o fetch da wallet, adicione uma sincronização com o wallet em tempo real quando ele chegar:
```typescript
  // Sincroniza saldo em tempo real quando socket emite wallet:updated
  useEffect(() => {
    if (realtimeWallet && wallet) {
      setWallet(prev => prev ? {
        ...prev,
        balance: realtimeWallet.balance,
        totalIncome: realtimeWallet.totalIncome,
        totalSpent: realtimeWallet.totalSpent,
      } : prev);
    }
  }, [realtimeWallet]);
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd D:/PROJETOS/Drop && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
cd D:/PROJETOS/Drop && git add frontend/pages/my-wallet.tsx && git commit -m "feat(wallet): real-time balance updates via useWallet hook"
```

---

## Task 8: Push para GitHub

- [ ] **Step 1: Push branch**

```bash
cd D:/PROJETOS/Drop && git push
```

---

## Verificação Manual (após deploy)

Para confirmar que o WebSocket está funcionando:

### Localização do motoboy
1. Fazer login como motoboy e aceitar uma entrega
2. Em outro browser, fazer login como cliente daquele pedido e abrir `/order-[id]`
3. O motoboy deve permitir acesso à localização no browser
4. A localização deve aparecer no mapa do cliente em tempo real (≤10s de delay)

### Badge de notificações
1. Fazer login como CEO/admin em `/admin/broadcasts`
2. Criar um broadcast targeting 'cliente'
3. Em outro browser, fazer login como cliente
4. O badge de notificações (sino) deve acender imediatamente sem refresh

### Carteira em tempo real
1. Fazer login como cliente e abrir `/my-wallet`
2. Em outro browser/terminal, fazer um pagamento que credita essa carteira
3. O saldo deve atualizar sem reload da página

### Pool de entregas do motoboy
1. Dois browsers logados como motoboy diferentes
2. Ambos na página `/motoboy` veem as mesmas entregas disponíveis
3. Motoboy A aceita uma entrega
4. A entrega deve desaparecer do browser do Motoboy B imediatamente

---

## Self-Review

**Spec coverage:**
- ✅ Localização do motoboy em tempo real → Task 1
- ✅ Badge de notificações para todos os roles → Tasks 2 + 5
- ✅ Saldo da carteira em tempo real → Tasks 3 + 4 (useWallet) + 7
- ✅ Pool de entregas remove claimed → Task 4
- ✅ Página de notificações com updates ao vivo → Task 6

**Placeholder scan:** Nenhum "TBD" ou "TODO" encontrado. Todos os passos têm código concreto.

**Type consistency:** 
- `useWallet` usa o mesmo padrão de outros hooks em `useSync.ts`
- `wallet:updated` payload: `{ userId, balance, totalIncome, totalSpent }` — consistente com `emitWalletUpdated` em `socketEmitter.ts`
- `notification:received` payload inclui `_id`, `title`, `message`, `type`, `read`, `createdAt` — consistente com interface `Notification` no frontend

**Gaps não cobertos neste plano (fora de escopo):**
- Admin dashboard métricas ao vivo (baixa prioridade, admin pode usar refresh)
- Chat pré-compra (já funcionando via `sockets/chat.ts`)
- Suporte tickets (já emitem `support:new_ticket` e `support:ticket_resolved`)
