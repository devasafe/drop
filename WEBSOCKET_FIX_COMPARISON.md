// ============================================================
// 🔌 COMPARAÇÃO: ANTES vs DEPOIS
// ============================================================

/**
 * ARQUIVO: src/utils/socketEmitter.ts
 * 
 * PROBLEMA: Cliente não recebia atualizações quando motoboy
 *           aceitava uma delivery
 */

// ============================================================
// ❌ ANTES (Bugado)
// ============================================================

/*
export const emitDeliveryStatusChanged = (delivery: any) => {
  emitToAll('delivery:status_changed', {
    _id: delivery._id,
    status: delivery.status,
    ...delivery,
  });
  if (delivery.motoboyId) {
    // ✅ Motoboy recebe
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:status_changed', {
      _id: delivery._id,
      status: delivery.status,
      ...delivery,
    });
  }
  // ❌ Cliente NÃO recebe!
};
*/

// Resultado:
// - Motoboy: ✅ Vê atualização (🚗 Motoboy a caminho!)
// - Cliente: ❌ Não vê atualização (⏳ Aguardando motoboy...)

// ============================================================
// ✅ DEPOIS (Corrigido)
// ============================================================

export const emitDeliveryStatusChanged = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    status: delivery.status,
    ...delivery,
  };
  
  // Broadcast para todos
  emitToAll('delivery:status_changed', payload);
  
  // Notificar o motoboy (se atribuído)
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:status_changed', payload);
  }
  
  // 🆕 Notificar o cliente (através do pedido)
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        // ✅ Agora cliente recebe!
        emitToRoom(`user:${order.customerId}`, 'delivery:status_changed', payload);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};

// Resultado:
// - Motoboy: ✅ Vê atualização (🚗 Motoboy a caminho!)
// - Cliente: ✅ Vê atualização (🚗 Motoboy a caminho!)
// - Loja: ✅ Vê atualização (via broadcast)

// ============================================================
// 🧪 TESTE: O que muda na UI
// ============================================================

/**
 * TESTE 1: Cliente cria pedido
 * ────────────────────────────
 * 
 * UI /order-[orderId]:
 *   ⏳
 *   "Aguardando motoboy aceitar..."
 *   Status: pago
 */

/**
 * TESTE 2: Loja aceita o pedido
 * ──────────────────────────────
 * 
 * Backend:
 *   1. POST /api/orders/:id/accept
 *   2. Cria: new Delivery({ status: 'pending' })
 *   3. Emite: emitDeliveryCreated()
 * 
 * UI /order-[orderId]:
 *   ⏳ (sem mudança, ainda esperando)
 *   "Aguardando motoboy aceitar..."
 *   Status: pago
 */

/**
 * TESTE 3: Motoboy ACEITA a delivery
 * ───────────────────────────────────
 * 
 * Backend:
 *   1. POST /api/deliveries/:id/claim
 *   2. Atualiza: delivery.status = 'assigned'
 *   3. Emite: emitDeliveryStatusChanged()
 * 
 * ❌ ANTES:
 *   UI /order-[orderId] (Cliente):
 *     ⏳ (SEM MUDANÇA - BUG!)
 *     "Aguardando motoboy aceitar..."
 *     Status: pago
 * 
 * ✅ DEPOIS:
 *   UI /order-[orderId] (Cliente):
 *     🚗 (MUDANÇA AUTOMÁTICA!)
 *     "Motoboy a caminho!"
 *     Status: assigned
 *     (Página atualiza em tempo real - sem refresh!)
 */

// ============================================================
// 🔍 DEBUGGING: Como Verificar
// ============================================================

/**
 * 1. No Console do Backend (npm run dev):
 *    Procure por:
 *    
 *    [SOCKET][EMIT] Broadcasting "delivery:status_changed" to room: user:{customerId}
 *                                                                          ▲
 *                                                                    ISSO É NOVO!
 * 
 * 2. No DevTools do Browser (Cliente):
 *    Abra Console:
 *    
 *    window.socket.on('delivery:status_changed', (data) => {
 *      console.log('Cliente recebeu:', data);
 *    });
 */

// ============================================================
// 📊 DIAGRAMA EXPLICATIVO
// ============================================================

/**
 * 
 * FLUXO COMPLETO:
 * 
 * ┌──────────────────────────────────────────────────────────┐
 * │                         MOTOBOY                           │
 * │                     (claimDelivery)                       │
 * │                       POST /claim                         │
 * │                           │                               │
 * │                           ▼                               │
 * └──────────────────────────────────────────────────────────┘
 *                             │
 *                             │
 *                             ▼
 *         ┌───────────────────────────────────┐
 *         │ Backend: claimDelivery()           │
 *         │                                   │
 *         │ delivery.motoboyId = userId       │
 *         │ delivery.status = 'assigned'      │
 *         │                                   │
 *         │ await delivery.save()             │
 *         │                                   │
 *         │ emitDeliveryStatusChanged(        │
 *         │   delivery.toObject()             │
 *         │ )                                 │
 *         └───────────────────────────────────┘
 *                             │
 *                    ┌────────┼────────┐
 *                    │        │        │
 *                    ▼        ▼        ▼
 *         ┌──────────────┐ ┌────────────────┐ ┌──────────────┐
 *         │  emitToAll() │ │ emitToRoom(    │ │ emitToRoom(  │
 *         │              │ │   user:{moto}  │ │  user:{cust} │
 *         │ Broadcast    │ │ )              │ │ ) ✅ NOVO!   │
 *         │ a TODOS      │ │                │ │              │
 *         │              │ │ Notifica       │ │ Notifica     │
 *         │              │ │ MOTOBOY        │ │ CLIENTE      │
 *         └──────────────┘ └────────────────┘ └──────────────┘
 *                    │                │               │
 *                    │                │               │
 *    ┌───────────────┴─────────────────┴───────────────┴──────┐
 *    │                                                         │
 *    ▼                                                         ▼
 * Websocket                                                Websocket
 * Broadcast                                                Unicast
 * 
 * 
 * RECEPÇÃO NO FRONTEND:
 * 
 * ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
 * │   Motoboy Browser    │  │  Cliente Browser     │  │  Loja Tab    │
 * │                      │  │                      │  │              │
 * │ socket.on('delivery: │  │ socket.on('delivery: │  │ socket.on    │
 * │ status_changed',())  │  │ status_changed',())  │  │ (orders)     │
 * │                      │  │                      │  │              │
 * │ ✅ Recebe!          │  │ ✅ Recebe! (NOVO)   │  │ ✅ Recebe!   │
 * │                      │  │                      │  │              │
 * │ Estado:              │  │ Estado:              │  │ Estado:      │
 * │ delivery.status =    │  │ delivery.status =    │  │ order.status │
 * │ 'assigned'           │  │ 'assigned'           │  │ updated      │
 * │                      │  │                      │  │              │
 * │ UI Atualiza:         │  │ UI Atualiza:         │  │ UI Atualiza: │
 * │ 🚗 Em trânsito       │  │ 🚗 Em trânsito       │  │ Entrega      │
 * │ (componente re-rend) │  │ (componente re-rend) │  │ assigned     │
 * └──────────────────────┘  └──────────────────────┘  └──────────────┘
 */

// ============================================================
// 💾 OUTRAS FUNÇÕES TAMBÉM CORRIGIDAS
// ============================================================

/*
export const emitDeliveryUpdated = (delivery: any) => {
  emitToAll('delivery:updated', delivery);
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:updated', delivery);
  }
  if (delivery.orderId) {
    Order.findById(delivery.orderId).then(order => {
      if (order?.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:updated', delivery);
      }
    });
  }
};

export const emitDeliveryLocationUpdated = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    location: delivery.currentLocation,
    estimatedTime: delivery.estimatedTime,
  };
  emitToAll('delivery:location_updated', payload);
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:location_updated', payload);
  }
  if (delivery.orderId) {
    Order.findById(delivery.orderId).then(order => {
      if (order?.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:location_updated', payload);
      }
    });
  }
};
*/

// ============================================================
// ✅ RESULTADO FINAL
// ============================================================

/*
 * ANTES (BUG):
 *   Cliente: "Ainda esperando..." ❌
 *   Motoboy: "Vejo que fui atribuído" ✅
 * 
 * DEPOIS (CORRIGIDO):
 *   Cliente: "Vejo que motoboy foi atribuído!" ✅
 *   Motoboy: "Vejo que fui atribuído" ✅
 *   Loja: "Vejo que delivery foi atribuída" ✅
 * 
 * DIFERENÇA:
 *   +1 linha de lógica = Sincronização perfeita em tempo real! 🎉
 */
