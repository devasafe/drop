# 🛠️ GUIA DE IMPLEMENTAÇÃO - WEBSOCKET CHECKOUT

## PASSO 1: Configurar autenticação no Socket (Backend)

### Arquivo: `src/services/notifier.ts`

```typescript
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

export const setupSocket = (io: Server) => {
  // Middleware: Validar JWT em toda conexão
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Token não fornecido'));
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      socket.userId = decoded.id;
      socket.userRole = decoded.role; // 'cliente', 'loja', 'motoboy'
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  // Quando cliente conecta
  io.on('connection', (socket) => {
    console.log(`✅ [${socket.userRole}] ${socket.userId} conectado`);

    // Ingressar em salas específicas
    socket.join(`user:${socket.userId}`);

    if (socket.userRole === 'loja') {
      // Buscar storeId do usuário
      Store.findOne({ ownerId: socket.userId }).then(store => {
        if (store) {
          socket.join(`store:${store._id}`);
          console.log(`🏪 Loja ${store._id} ingressou`);
        }
      });
    }

    if (socket.userRole === 'motoboy') {
      socket.join('motoboys');
      console.log(`🏍️ Motoboy ingressou na sala geral`);
    }

    // Desconexão
    socket.on('disconnect', () => {
      console.log(`❌ ${socket.userId} desconectado`);
    });

    // Listener: Motoboy compartilha localização
    socket.on('delivery:location_updated', (data) => {
      // Validar que é motoboy
      if (socket.userRole !== 'motoboy') return;

      // Emitir para cliente e loja
      io.to(`delivery:${data.deliveryId}`).emit('motoboy:location_updated', {
        latitude: data.latitude,
        longitude: data.longitude,
        motoboyId: socket.userId,
        timestamp: new Date()
      });
    });
  });
};
```

---

## PASSO 2: Emitir evento quando cliente cria pedido

### Arquivo: `src/controllers/orderController.ts`

**Modificar função `createOrder`:**

```typescript
import { emitOrderCreated, emitToRoom } from '../utils/socketEmitter';

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // ... código existente ...

    const order = new Order({
      customerId: req.user?.id,
      storeId,
      products: items,
      totalValue,
      deliveryFee,
      status: 'created'
    });

    await order.save();

    // ✅ NOVO: Emitir evento
    emitOrderCreated({
      _id: order._id,
      customerId: order.customerId,
      storeId: order.storeId,
      totalValue: order.totalValue,
      status: 'created',
      createdAt: order.createdAt
    });

    // ✅ NOVO: Notificar LOJA especificamente
    const store = await Store.findById(storeId);
    if (store) {
      emitToRoom(
        `store:${store._id}`,
        'new_order',
        {
          orderId: order._id,
          customerName: customer.name,
          totalValue: order.totalValue,
          itemCount: items.length,
          timestamp: order.createdAt
        }
      );
    }

    // ✅ NOVO: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId}`,
      'order:created',
      {
        orderId: order._id,
        status: 'created',
        totalValue: order.totalValue
      }
    );

    return res.status(201).json(order);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
};
```

---

## PASSO 3: Emitir evento quando loja aceita

### Arquivo: `src/controllers/cancellationController.ts`

**Modificar função `acceptOrderByStore`:**

```typescript
import {
  emitToRoom,
  emitDeliveryCreated
} from '../utils/socketEmitter';

export const acceptOrderByStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: orderId } = req.params;
    const { distance } = req.body;

    const order = await Order.findById(orderId).populate('customerId');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Mudar status para 'pago'
    order.status = 'pago';
    order.acceptedAt = new Date();
    await order.save();

    // Criar delivery
    const fee = 7 + (Number(distance || 0) * 1);
    const delivery = new Delivery({
      orderId: order._id,
      distance: Number(distance || 0),
      fee,
      status: 'pending',
      pinRetirada: Math.floor(100000 + Math.random() * 900000).toString(),
      pin: Math.floor(100000 + Math.random() * 900000).toString()
    });
    await delivery.save();

    order.deliveryId = delivery._id;
    await order.save();

    // ✅ NOVO: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId._id}`,
      'order:accepted_by_store',
      {
        orderId: order._id,
        storeName: order.storeName,
        deliveryFee: delivery.fee,
        status: 'waiting_motoboy',
        message: '⏳ Aguardando motoboy aceitar sua entrega'
      }
    );

    // ✅ NOVO: Notificar MOTOBOYS
    emitToRoom(
      'motoboys',
      'delivery:available',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        distance: delivery.distance,
        fee: delivery.fee,
        customerName: order.customerName,
        storeName: order.storeName
      }
    );

    // ✅ NOVO: Feedback para LOJA
    emitToRoom(
      `store:${order.storeId}`,
      'order:accepted',
      {
        orderId: order._id,
        status: 'waiting_motoboy',
        deliveryId: delivery._id
      }
    );

    return res.json({
      success: true,
      delivery: delivery
    });
  } catch (error: any) {
    console.error('Erro ao aceitar pedido:', error);
    return res.status(500).json({ error: error.message });
  }
};
```

---

## PASSO 4: Emitir evento quando motoboy aceita

### Arquivo: `src/controllers/deliveryController.ts`

**Modificar função `assignDelivery`:**

```typescript
import { emitToRoom } from '../utils/socketEmitter';

export const assignDelivery = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params;
    const motoboyId = req.user?.id;

    const delivery = await Delivery.findById(deliveryId)
      .populate({ path: 'orderId' });
    
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const order = delivery.orderId as any;

    // Atribuir motoboy
    delivery.motoboyId = motoboyId;
    delivery.status = 'assigned';
    delivery.startTime = new Date();
    await delivery.save();

    const motoboy = await User.findById(motoboyId);

    // ✅ NOVO: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId}`,
      'motoboy:assigned',
      {
        orderId: order._id,
        motoboyName: motoboy.name,
        motoboyPhone: motoboy.phone,
        motoboyRating: motoboy.rating,
        motoboyLocation: motoboy.currentLocation,
        deliveryId: delivery._id,
        status: '🚗 Motoboy a caminho para a loja',
        eta: '10-15 minutos'
      }
    );

    // ✅ NOVO: Notificar LOJA
    emitToRoom(
      `store:${order.storeId}`,
      'motoboy:assigned_to_order',
      {
        orderId: order._id,
        motoboyName: motoboy.name,
        deliveryId: delivery._id
      }
    );

    // ✅ NOVO: Notificar MOTOBOYS (remover de disponíveis)
    emitToRoom(
      'motoboys',
      'delivery:claimed',
      { deliveryId: delivery._id, motoboyId }
    );

    // ✅ NOVO: Criar sala para esta entrega específica
    // Agora cliente, loja e motoboy podem rastrear juntos
    emitToRoom(
      `delivery:${delivery._id}`,
      'delivery:started',
      {
        motoboyId,
        motoboyName: motoboy.name,
        currentLocation: motoboy.currentLocation
      }
    );

    return res.json({
      success: true,
      delivery: delivery,
      message: 'Entrega atribuída com sucesso'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to assign delivery' });
  }
};
```

---

## PASSO 5: Emitir evento quando pedido é retirado

### Arquivo: `src/controllers/deliveryController.ts`

**Adicionar/Modificar função `validarPinRetirada`:**

```typescript
export const validarPinRetirada = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params;
    const { pinRetirada } = req.body;

    const delivery = await Delivery.findById(deliveryId)
      .populate({ path: 'orderId' });
    
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.pinRetirada !== pinRetirada) {
      return res.status(400).json({ error: 'PIN inválido' });
    }

    const order = delivery.orderId as any;

    // Atualizar status
    delivery.status = 'picked';
    delivery.pickedAt = new Date();
    await delivery.save();

    // ✅ NOVO: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId}`,
      'delivery:picked',
      {
        orderId: order._id,
        status: '🚗 Motoboy retirou seu pedido',
        message: 'Seu pedido saiu da loja e está a caminho!',
        eta: '20-30 minutos'
      }
    );

    // ✅ NOVO: Notificar LOJA
    emitToRoom(
      `store:${order.storeId}`,
      'order:picked_up',
      {
        orderId: order._id,
        pickedAt: delivery.pickedAt,
        motoboyName: (await User.findById(delivery.motoboyId)).name
      }
    );

    // ✅ NOVO: Atualizar sala de entrega
    emitToRoom(
      `delivery:${delivery._id}`,
      'delivery:in_transit',
      {
        status: 'picked',
        pickedAt: delivery.pickedAt
      }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao validar PIN' });
  }
};
```

---

## PASSO 6: Emitir evento quando entrega é concluída

### Arquivo: `src/controllers/deliveryController.ts`

**Modificar função `finalizarEntrega`:**

```typescript
export const finalizarEntrega = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: deliveryId } = req.params;
    const { pin } = req.body;

    const delivery = await Delivery.findById(deliveryId)
      .populate({ path: 'orderId' });
    
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.pin !== pin) return res.status(400).json({ error: 'PIN inválido' });

    const order = delivery.orderId as any;

    // Atualizar delivery e order
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
    await delivery.save();

    order.status = 'entregue';
    order.deliveredAt = new Date();
    await order.save();

    // ✅ NOVO: Notificar CLIENTE
    emitToRoom(
      `user:${order.customerId}`,
      'delivery:completed',
      {
        orderId: order._id,
        status: '✅ Pedido entregue',
        deliveredAt: delivery.deliveredAt,
        message: 'Pedido entregue com sucesso!',
        nextAction: 'Avaliar motoboy e loja',
        motoboyRatingUrl: `/avaliar-motoboy/${delivery._id}`
      }
    );

    // ✅ NOVO: Notificar LOJA
    emitToRoom(
      `store:${order.storeId}`,
      'order:delivered',
      {
        orderId: order._id,
        deliveredAt: delivery.deliveredAt,
        customerName: order.customerName
      }
    );

    // ✅ NOVO: Notificar MOTOBOY
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:completed',
      {
        deliveryId: delivery._id,
        earnedFee: delivery.fee,
        completedAt: delivery.deliveredAt
      }
    );

    // ✅ NOVO: Fechar sala de rastreamento
    emitToRoom(
      `delivery:${delivery._id}`,
      'delivery:closed',
      { status: 'completed' }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao finalizar entrega' });
  }
};
```

---

## PASSO 7: Frontend - Cliente vê status em tempo real

### Arquivo: `frontend/pages/order/[id].tsx`

```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSocket } from '@/lib/socket';

export default function OrderDetail() {
  const router = useRouter();
  const { id: orderId } = router.query;
  const [order, setOrder] = useState(null);
  const socket = getSocket();

  useEffect(() => {
    if (!orderId) return;

    // Buscar pedido inicial
    fetch(`/api/orders/${orderId}`)
      .then(r => r.json())
      .then(data => setOrder(data));

    // Listener: Loja aceitou
    socket.on('order:accepted_by_store', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: 'waiting_motoboy',
          message: '⏳ Aguardando motoboy aceitar sua entrega'
        }));
      }
    });

    // Listener: Motoboy atribuído
    socket.on('motoboy:assigned', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: 'motoboy_assigned',
          motoboy: {
            name: data.motoboyName,
            phone: data.motoboyPhone,
            rating: data.motoboyRating
          },
          message: `🚗 ${data.motoboyName} saiu para buscar seu pedido`
        }));
      }
    });

    // Listener: Pedido retirado
    socket.on('delivery:picked', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: 'picked',
          message: `🚗 Pedido saiu da loja. Chegará em ${data.eta}`
        }));
      }
    });

    // Listener: Localização do motoboy
    socket.on('motoboy:location_updated', (data) => {
      setOrder(prev => ({
        ...prev,
        motoboy: {
          ...prev.motoboy,
          location: { lat: data.latitude, lng: data.longitude },
          eta: data.eta
        }
      }));
    });

    // Listener: Entregue
    socket.on('delivery:completed', (data) => {
      if (data.orderId === orderId) {
        setOrder(prev => ({
          ...prev,
          status: 'delivered',
          message: '✅ Pedido entregue com sucesso!'
        }));
      }
    });

    return () => {
      socket.off('order:accepted_by_store');
      socket.off('motoboy:assigned');
      socket.off('delivery:picked');
      socket.off('motoboy:location_updated');
      socket.off('delivery:completed');
    };
  }, [orderId, socket]);

  if (!order) return <div>Carregando...</div>;

  return (
    <div className="p-6">
      <h1>Pedido #{orderId}</h1>
      <p className="text-lg font-bold">{order.message}</p>

      {order.status === 'motoboy_assigned' && (
        <div className="mt-4 p-4 bg-blue-50 rounded">
          <p>🏍️ <strong>{order.motoboy?.name}</strong></p>
          <p>⭐ {order.motoboy?.rating}</p>
          <p>📞 {order.motoboy?.phone}</p>
        </div>
      )}

      {order.motoboy?.location && (
        <div className="mt-4">
          <p>ETA: {order.motoboy?.eta}</p>
          {/* Colocar mapa aqui */}
        </div>
      )}

      {order.status === 'delivered' && (
        <div className="mt-4">
          <a
            href={`/avaliar-motoboy/${order.delivery._id}`}
            className="btn btn-primary"
          >
            ⭐ Avaliar Motoboy
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## PASSO 8: Frontend - Loja vê pedidos em tempo real

### Arquivo: `frontend/pages/store-dashboard.tsx`

```typescript
import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

export default function StoreDashboard() {
  const [orders, setOrders] = useState([]);
  const socket = getSocket();

  useEffect(() => {
    // Buscar pedidos iniciais
    fetch('/api/orders')
      .then(r => r.json())
      .then(data => setOrders(data));

    // Listener: Novo pedido
    socket.on('new_order', (data) => {
      // Buscar dados completos do pedido
      fetch(`/api/orders/${data.orderId}`)
        .then(r => r.json())
        .then(order => {
          setOrders(prev => [order, ...prev]);
          // Notificação
          showNotification(`🔔 Novo pedido de ${order.customerName}`);
        });
    });

    // Listener: Motoboy atribuído
    socket.on('motoboy:assigned_to_order', (data) => {
      setOrders(prev =>
        prev.map(o =>
          o._id === data.orderId
            ? {
                ...o,
                delivery: {
                  ...o.delivery,
                  motoboyId: data.motoboyId,
                  motoboyName: data.motoboyName
                }
              }
            : o
        )
      );
    });

    // Listener: Pedido retirado
    socket.on('order:picked_up', (data) => {
      setOrders(prev =>
        prev.map(o =>
          o._id === data.orderId
            ? { ...o, delivery: { ...o.delivery, status: 'picked' } }
            : o
        )
      );
    });

    // Listener: Pedido entregue
    socket.on('order:delivered', (data) => {
      setOrders(prev => prev.filter(o => o._id !== data.orderId));
      // Mover para histórico
      setHistoryOrders(prev => [...prev, ...orders.filter(o => o._id === data.orderId)]);
    });

    return () => {
      socket.off('new_order');
      socket.off('motoboy:assigned_to_order');
      socket.off('order:picked_up');
      socket.off('order:delivered');
    };
  }, [socket]);

  return (
    <div className="p-6">
      <h1>📋 Pedidos em Andamento ({orders.length})</h1>

      <div className="grid gap-4 mt-4">
        {orders.map(order => (
          <div key={order._id} className="p-4 border rounded">
            <p className="font-bold">#{order._id}</p>
            <p>👤 {order.customerName}</p>
            <p>📦 {order.products.length} itens</p>
            <p>💰 R$ {order.totalValue}</p>

            {!order.delivery && (
              <button className="mt-2 btn btn-success">✅ Aceitar Pedido</button>
            )}

            {order.delivery && !order.delivery.motoboyId && (
              <p className="mt-2 text-yellow-600">⏳ Aguardando motoboy...</p>
            )}

            {order.delivery?.motoboyId && (
              <p className="mt-2 text-blue-600">
                🏍️ {order.delivery.motoboyName}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## PASSO 9: Frontend - Motoboy vê entregas disponíveis

### Arquivo: `frontend/pages/motoboy/available-deliveries.tsx`

```typescript
import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

export default function AvailableDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const socket = getSocket();

  useEffect(() => {
    // Buscar entregas iniciais
    fetch('/api/deliveries/available')
      .then(r => r.json())
      .then(data => setDeliveries(data));

    // Listener: Nova entrega disponível
    socket.on('delivery:available', (delivery) => {
      setDeliveries(prev => [delivery, ...prev]);
      // Notificação
      playSound();
    });

    // Listener: Entrega pega por outro motoboy
    socket.on('delivery:claimed', (data) => {
      setDeliveries(prev =>
        prev.filter(d => d.deliveryId !== data.deliveryId)
      );
    });

    // Listener: Entrega cancelada
    socket.on('delivery:cancelled', (data) => {
      setDeliveries(prev =>
        prev.filter(d => d.deliveryId !== data.deliveryId)
      );
    });

    return () => {
      socket.off('delivery:available');
      socket.off('delivery:claimed');
      socket.off('delivery:cancelled');
    };
  }, [socket]);

  const handleAccept = async (deliveryId) => {
    const res = await fetch(`/api/deliveries/${deliveryId}/assign`, {
      method: 'POST'
    });

    if (res.ok) {
      // Remover da lista (será feito via socket anyway)
      setDeliveries(prev =>
        prev.filter(d => d.deliveryId !== deliveryId)
      );
    }
  };

  return (
    <div className="p-6">
      <h1>🚚 Entregas Disponíveis ({deliveries.length})</h1>

      <div className="grid gap-4 mt-4">
        {deliveries.map(d => (
          <div key={d.deliveryId} className="p-4 border rounded">
            <p className="font-bold">📦 {d.customerName}</p>
            <p>📍 {d.storeName}</p>
            <p>🚗 {d.distance}km</p>
            <p className="text-green-600 font-bold">R$ {d.fee}</p>

            <button
              onClick={() => handleAccept(d.deliveryId)}
              className="mt-2 btn btn-primary"
            >
              ✅ Aceitar Entrega
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## ✅ Checklist de Implementação Rápida

```
BACKEND:
- [ ] Configurar JWT no Socket (src/services/notifier.ts)
- [ ] Emitir new_order em createOrder
- [ ] Emitir events em acceptOrderByStore
- [ ] Emitir events em assignDelivery
- [ ] Emitir events em validarPinRetirada
- [ ] Emitir events em finalizarEntrega
- [ ] Compilar: npm run build ✅

FRONTEND:
- [ ] Implementar listeners em order detail page
- [ ] Implementar listeners em store dashboard
- [ ] Implementar listeners em motoboy dashboard
- [ ] Testar com múltiplos usuários
- [ ] Compilar: npm run build ✅
```

