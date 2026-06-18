import notifier from '../services/notifier';

const DEBUG = process.env.NODE_ENV !== 'production';

export const emitToAll = (event: string, data: any) => {
  const io = notifier.io;
  if (!io) {
    console.warn(`[SOCKET][WARN] io não inicializado para evento: ${event}`);
    return;
  }
  try {
    if (DEBUG) console.log(`[SOCKET][EMIT] Broadcasting "${event}" to all clients`);
    io.emit(event, data);
  } catch (err) {
    console.error(`[SOCKET][ERROR] Erro ao emitir "${event}":`, err);
  }
};

export const emitToRoom = (room: string, event: string, data: any) => {
  const io = notifier.io;
  console.log(`\n📡 [SOCKET.EMIT] Tentando emitir evento`);
  console.log(`   Sala: ${room}`);
  console.log(`   Evento: ${event}`);
  console.log(`   Data: ${JSON.stringify(data)}`);
  console.log(`   IO disponível: ${!!io}`);
  
  if (!io) {
    console.error(`❌ [SOCKET.EMIT] io não inicializado para sala: ${room}`);
    return;
  }
  try {
    if (DEBUG) console.log(`[SOCKET.EMIT] Broadcasting "${event}" to room: ${room}`);
    const result = io.to(room).emit(event, data);
    console.log(`✅ [SOCKET.EMIT] Evento emitido com sucesso para sala: ${room}\n`);
  } catch (err) {
    console.error(`❌ [SOCKET.EMIT] Erro ao emitir para sala "${room}":`, err);
  }
};

/**
 * Força logout de um usuário específico via socket (best-effort).
 * Frontend (AuthContext) escuta 'auth:force_logout' e limpa token + redireciona.
 * Se o user estiver offline (sem socket), o evento se perde — o bloqueio de login
 * e o requireActiveUser nas rotas sensíveis cobrem o resto.
 */
export const emitForceLogout = (userId: string, reason: 'blocked' | 'admin_disconnect', message?: string) => {
  emitToRoom(`user:${userId}`, 'auth:force_logout', {
    reason,
    message: message || (reason === 'blocked'
      ? 'Sua conta foi bloqueada. Entre em contato com o suporte.'
      : 'Sua sessão foi encerrada por um administrador.'),
    at: new Date().toISOString(),
  });
};

export const emitProductCreated = (product: any) => {
  emitToAll('product:created', product);
};

export const emitProductUpdated = (product: any) => {
  emitToAll('product:updated', product);
};

export const emitProductDeleted = (productId: string) => {
  emitToAll('product:deleted', { _id: productId });
};

export const emitOrderCreated = (order: any) => {
  console.log('[SOCKET][emitOrderCreated] Novo pedido:', {
    orderId: order._id,
    storeId: order.storeId,
    totalValue: order.totalValue,
    deliveryFee: order.deliveryFee,
    status: order.status
  });
  
  // Payload limpo para evitar stack overflow
  const payload = {
    _id: order._id,
    status: order.status,
    totalValue: order.totalValue,
    deliveryFee: order.deliveryFee,
    createdAt: order.createdAt,
    customerId: order.customerId,
    storeId: order.storeId,
    paymentStatus: order.paymentStatus,
    products: Array.isArray(order.products) ? order.products.map((p: any) => ({
      productId: p.productId,
      quantity: p.quantity,
      price: p.price
    })) : [],
    walletDistribution: order.walletDistribution
  };
  
  emitToAll('order:created', payload);
  
  // 🏪 Notificar a loja - novo pedido recebido
  if (order.storeId) {
    const storePayload = {
      orderId: order._id,
      status: order.status,
      totalValue: order.totalValue,
      deliveryFee: order.deliveryFee,
      createdAt: order.createdAt
    };
    
    console.log('[SOCKET][emitOrderCreated] Enviando new_order para loja:', order.storeId, storePayload);
    emitToRoom(`store:${order.storeId}`, 'new_order', storePayload);
    
    // Também emitir order:created para consistency
    emitToRoom(`store:${order.storeId}`, 'order:created', payload);
  }
  
  // 👤 Notificar o cliente - seu pedido foi criado
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:created', payload);
  }
};

export const emitOrderUpdated = (order: any) => {
  const payload = {
    _id: order._id,
    status: order.status,
    totalValue: order.totalValue,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
  };

  emitToAll('order:updated', payload);
  
  // Notificar a loja (store owner)
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'order:updated', payload);
  }
  
  // 🆕 Notificar o cliente
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:updated', payload);
  }
};

export const emitOrderStatusChanged = (order: any) => {
  const payload = {
    _id: order._id,
    status: order.status,
    totalValue: order.totalValue,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
  };
  
  emitToAll('order:status_changed', payload);
  
  // Notificar a loja (store owner)
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'order:status_changed', payload);
  }
  
  // 🆕 Notificar o cliente
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:status_changed', payload);
  }
};

export const emitDeliveryCreated = (delivery: any) => {
  emitToAll('delivery:created', delivery);
  
  // 🏍️ Notificar motoboys de nova entrega disponível
  emitToRoom('motoboys', 'delivery:available', {
    deliveryId: delivery._id,
    orderId: delivery.orderId,
    distance: delivery.distance,
    fee: delivery.fee,
    createdAt: delivery.createdAt
  });
};

export const emitDeliveryUpdated = (delivery: any) => {
  emitToAll('delivery:updated', delivery);
  
  // Notificar o motoboy
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:updated', delivery);
  }
  
  // Notificar o cliente
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:updated', delivery);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};

export const emitDeliveryStatusChanged = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    status: delivery.status,
    ...delivery,
  };
  
  emitToAll('delivery:status_changed', payload);
  
  // Notificar o motoboy (se atribuído)
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:status_changed', payload);
  }
  
  // Notificar o cliente (através do pedido)
  // O cliente precisa saber que a delivery foi aceita/atualizada
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:status_changed', payload);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};

export const emitDeliveryPicked = (delivery: any, order: any) => {
  // WORKFLOW 4: Motoboy validou PIN e retirou pedido
  
  // Notificar CLIENTE
  emitToRoom(
    `user:${order.customerId}`,
    'delivery:picked',
    {
      orderId: order._id,
      deliveryId: delivery._id,
      status: '🚗 Motoboy retirou seu pedido',
      message: `Seu pedido saiu da loja e está a caminho!`,
      eta: '20-30 minutos',
      pickedAt: delivery.updatedAt
    }
  );

  // Notificar LOJA
  emitToRoom(
    `store:${order.storeId}`,
    'order:picked_up',
    {
      orderId: order._id,
      deliveryId: delivery._id,
      message: `Pedido retirado com sucesso`,
      pickedAt: delivery.updatedAt
    }
  );

  // Notificar MOTOBOY
  if (delivery.motoboyId) {
    emitToRoom(
      `user:${delivery.motoboyId}`,
      'delivery:pin_validated',
      {
        deliveryId: delivery._id,
        orderId: order._id,
        message: 'PIN validado com sucesso! Siga para o endereço de entrega',
        status: '✅ Pedido retirado'
      }
    );
  }
};

export const emitDeliveryLocationUpdated = (delivery: any) => {
  const payload = {
    _id: delivery._id,
    location: delivery.currentLocation,
    estimatedTime: delivery.estimatedTime,
  };
  
  emitToAll('delivery:location_updated', payload);
  
  // Notificar o motoboy
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:location_updated', payload);
  }
  
  // Notificar o cliente
  if (delivery.orderId) {
    const Order = require('../models/Order').default;
    Order.findById(delivery.orderId).then((order: any) => {
      if (order && order.customerId) {
        emitToRoom(`user:${order.customerId}`, 'delivery:location_updated', payload);
      }
    }).catch((err: any) => {
      console.warn('[socketEmitter] Erro ao notificar cliente:', err.message);
    });
  }
};

export const emitNotificationReceived = (notification: any) => {
  if (notification.userId) {
    emitToRoom(`user:${notification.userId}`, 'notification:received', notification);
  }
  emitToAll('notification:received', notification);
};

export const emitNotificationRead = (notification: any) => {
  if (notification.userId) {
    emitToRoom(`user:${notification.userId}`, 'notification:read', notification);
  }
};

export const emitStoreCreated = (store: any) => {
  emitToAll('store:created', store);
};

export const emitStoreUpdated = (store: any) => {
  emitToAll('store:updated', store);
  emitToRoom(`store:${store.ownerId}`, 'store:updated', store);
};

export const emitCategoryCreated = (category: any) => {
  // Apenas broadcast: quem estiver na sala da loja receberia o mesmo evento 2x
  // (sala + emitToAll) e a lista duplicava. O frontend filtra por storeId.
  emitToAll('category:created', category);
};

export const emitCategoryUpdated = (category: any) => {
  emitToAll('category:updated', category);
};

export const emitGamificationPointsEarned = (userId: string, data: any) => {
  emitToRoom(`user:${userId}`, 'gamification:points_earned', {
    userId,
    ...data,
  });
};

export const emitGamificationBadgeUnlocked = (userId: string, badge: string) => {
  emitToRoom(`user:${userId}`, 'gamification:badge_unlocked', {
    userId,
    badge,
  });
};

export const emitRankingUpdated = (rankingData: any) => {
  emitToRoom('motoboys', 'ranking:updated', rankingData);
};

// ========== CANCELAMENTOS E REJEIÇÕES ==========

export const emitOrderCancelled = (order: any, cancellation: any) => {
  // Notifica cliente
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:cancelled', {
      orderId: order._id,
      status: 'cancelado',
      reason: cancellation.reason,
      reasonCode: cancellation.reasonCode,
      refundAmount: cancellation.refundAmount,
      cancelledBy: cancellation.cancelledBy,
    });
  }
  // Notifica loja
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'order:cancelled', {
      orderId: order._id,
      status: 'cancelado',
      reason: cancellation.reason,
      cancelledBy: cancellation.cancelledBy,
    });
  }
  // Broadcast geral
  emitToAll('order:cancelled', { orderId: order._id, status: 'cancelado', cancelledBy: cancellation.cancelledBy });
};

export const emitDeliveryCancelled = (delivery: any, cancellation: any) => {
  // Notifica motoboy
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:cancelled', {
      deliveryId: delivery._id,
      status: 'cancelled',
      reason: cancellation.reason,
    });
  }
  // Notifica loja
  emitToRoom('motoboys', 'delivery:cancelled', {
    deliveryId: delivery._id,
    status: 'cancelled',
  });
};

export const emitDeliveryRejected = (delivery: any, rejectedBy: 'motoboy' | 'store', reason: string) => {
  // Buscar order para notificar cliente
  const Order = require('../models/Order').default;
  Order.findById(delivery.orderId).then((order: any) => {
    if (!order) return;

    // 🔴 Notificar CLIENTE
    emitToRoom(`user:${order.customerId}`, 'delivery:rejected', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      rejectedBy: rejectedBy,
      reason: reason,
      message: rejectedBy === 'motoboy' 
        ? `Motoboy rejeitou a entrega: ${reason}` 
        : `Loja rejeitou a entrega: ${reason}`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryRejected] Event sent to client ${order.customerId}`);

    // 🔴 Notificar LOJA
    emitToRoom(`store:${order.storeId}`, 'delivery:rejected', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      rejectedBy: rejectedBy,
      reason: reason,
      message: rejectedBy === 'motoboy' 
        ? `Motoboy rejeitou a entrega: ${reason}` 
        : `Entrega foi rejeitada: ${reason}`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryRejected] Event sent to store ${order.storeId}`);

    // 🔴 Notificar MOTOBOY
    if (delivery.motoboyId) {
      emitToRoom(`user:${delivery.motoboyId}`, 'delivery:rejected', {
        deliveryId: delivery._id.toString(),
        orderId: order._id.toString(),
        rejectedBy: rejectedBy,
        reason: reason,
        message: `Entrega foi rejeitada: ${reason}`,
        timestamp: new Date().toISOString()
      });
      console.log(`📡 [emitDeliveryRejected] Event sent to motoboy ${delivery.motoboyId}`);
    }
  }).catch((err: any) => {
    console.warn('[emitDeliveryRejected] Erro ao buscar order:', err.message);
  });
};

export const emitOrderRejectedByStore = (order: any, reason: string) => {
  // 🔴 Notificar CLIENTE
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:rejected_by_store', {
      orderId: order._id.toString(),
      reason: reason,
      message: `Sua loja rejeitou seu pedido: ${reason}`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitOrderRejectedByStore] Event sent to client ${order.customerId}`);
  }

  // 🔴 Notificar LOJA
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'order:rejected', {
      orderId: order._id.toString(),
      reason: reason,
      message: `Pedido rejeitado com sucesso`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitOrderRejectedByStore] Event sent to store ${order.storeId}`);
  }

  // 🔴 Notificar MOTOBOY (se já foi atribuído)
  if (order.deliveryId) {
    const Delivery = require('../models/Delivery').default;
    Delivery.findById(order.deliveryId).then((delivery: any) => {
      if (delivery && delivery.motoboyId) {
        emitToRoom(`user:${delivery.motoboyId}`, 'order:rejected_by_store', {
          orderId: order._id.toString(),
          deliveryId: delivery._id.toString(),
          reason: reason,
          message: `O pedido que você aceitou foi rejeitado pela loja: ${reason}`,
          timestamp: new Date().toISOString()
        });
        console.log(`📡 [emitOrderRejectedByStore] Event sent to motoboy ${delivery.motoboyId}`);
      }
    }).catch((err: any) => {
      console.warn('[emitOrderRejectedByStore] Erro ao buscar delivery:', err.message);
    });
  }
};

export const emitOrderAcceptedByStore = (order: any) => {
  // 👤 Notificar cliente que loja aceito o pedido
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'order:accepted_by_store', {
      orderId: order._id,
      status: 'aceito',
      message: '⏳ Aguardando motoboy aceitar sua entrega',
      timestamp: new Date().toISOString(),
    });
  }
  
  // 🏪 Notificar loja que pedido foi aceito por ela mesma
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'order:accepted', {
      orderId: order._id,
      status: 'aceito',
      message: '✅ Pedido aceito. Aguardando motoboy'
    });
  }
};

// 🎉 Entrega foi COMPLETADA - Notificar TODAS as partes
export const emitDeliveryCompleted = (delivery: any, order: any) => {
  console.log(`✅ [emitDeliveryCompleted] Broadcasting delivery completion for order ${order._id}`);
  
  // 🔴 Notificar CLIENTE
  if (order.customerId) {
    emitToRoom(`user:${order.customerId}`, 'delivery:completed', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      status: 'entregue',
      message: '🎉 Seu pedido foi entregue com sucesso!',
      completedAt: delivery.updatedAt,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryCompleted] Event sent to client ${order.customerId}`);
  }

  // 🔴 Notificar LOJA
  if (order.storeId) {
    emitToRoom(`store:${order.storeId}`, 'delivery:completed', {
      orderId: order._id.toString(),
      deliveryId: delivery._id.toString(),
      status: 'entregue',
      message: `Pedido entregue com sucesso`,
      completedAt: delivery.updatedAt,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryCompleted] Event sent to store ${order.storeId}`);
  }

  // 🔴 Notificar MOTOBOY
  if (delivery.motoboyId) {
    emitToRoom(`user:${delivery.motoboyId}`, 'delivery:completed', {
      deliveryId: delivery._id.toString(),
      orderId: order._id.toString(),
      status: 'entregue',
      message: '✅ Entrega concluída com sucesso! Obrigado!',
      completedAt: delivery.updatedAt,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryCompleted] Event sent to motoboy ${delivery.motoboyId}`);
  }

  // 🔴 Broadcast geral
  emitToAll('delivery:completed', {
    orderId: order._id.toString(),
    deliveryId: delivery._id.toString(),
    status: 'entregue',
    completedAt: delivery.updatedAt
  });
  console.log(`✅ [emitDeliveryCompleted] Broadcast sent`);
};

// ========== WALLET EVENTS ==========

export const emitWalletUpdated = (userId: string, userType: 'cliente' | 'lojista' | 'motoboy', wallet: any) => {
  console.log(`💰 [emitWalletUpdated] Wallet updated for ${userType} ${userId}`, {
    balance: wallet.balance,
    totalIncome: wallet.totalIncome,
    totalSpent: wallet.totalSpent
  });
  
  // Notificar usuário
  emitToRoom(`user:${userId}`, 'wallet:updated', {
    userId,
    userType,
    balance: wallet.balance,
    totalIncome: wallet.totalIncome,
    totalSpent: wallet.totalSpent,
    updatedAt: wallet.updatedAt,
    timestamp: new Date().toISOString()
  });
};

export const emitWalletTransferCompleted = (fromUser: string, toUser: string, amount: number, reference: string) => {
  console.log(`💸 [emitWalletTransferCompleted] Transfer completed: ${fromUser} → ${toUser}: R$${amount}`);
  
  // Notificar remetente
  emitToRoom(`user:${fromUser}`, 'wallet:transfer_completed', {
    type: 'sent',
    toUser,
    amount,
    reference,
    timestamp: new Date().toISOString()
  });
  
  // Notificar destinatário
  emitToRoom(`user:${toUser}`, 'wallet:transfer_received', {
    type: 'received',
    fromUser,
    amount,
    reference,
    timestamp: new Date().toISOString()
  });
};

export const emitWalletRefund = (userId: string, userType: string, amount: number, reason: string) => {
  console.log(`💵 [emitWalletRefund] Refund issued: ${userType} ${userId}: R$${amount} - ${reason}`);
  
  emitToRoom(`user:${userId}`, 'wallet:refund', {
    userId,
    userType,
    amount,
    reason,
    timestamp: new Date().toISOString()
  });
};

export const emitDeliveryAssigned = (delivery: any, motoboy: any) => {
  console.log(`🏍️ [emitDeliveryAssigned] Delivery ${delivery._id} assigned to motoboy ${motoboy._id}`);
  
  const Order = require('../models/Order').default;
  Order.findById(delivery.orderId).then((order: any) => {
    if (!order) return;
    
    // 🔴 Notificar CLIENTE
    if (order.customerId) {
      emitToRoom(`user:${order.customerId}`, 'delivery:assigned', {
        orderId: order._id.toString(),
        deliveryId: delivery._id.toString(),
        motoboyName: motoboy.name,
        motoboyRating: motoboy.rating,
        motoboyPhone: motoboy.phone,
        status: 'entregador_atribuído',
        message: `🏍️ ${motoboy.name} está a caminho!`,
        eta: '15-20 minutos',
        timestamp: new Date().toISOString()
      });
      console.log(`📡 [emitDeliveryAssigned] Event sent to client ${order.customerId}`);
    }
  }).catch((err: any) => {
    console.warn('[emitDeliveryAssigned] Erro ao buscar order:', err.message);
  });
  
  // 🔴 Notificar MOTOBOY
  if (motoboy._id) {
    emitToRoom(`user:${motoboy._id}`, 'delivery:assigned_to_me', {
      deliveryId: delivery._id.toString(),
      orderId: delivery.orderId.toString(),
      fee: delivery.fee,
      distance: delivery.distance,
      estimatedTime: delivery.estimatedTime,
      message: `✅ Entrega atribuída com sucesso! R$${delivery.fee}`,
      timestamp: new Date().toISOString()
    });
    console.log(`📡 [emitDeliveryAssigned] Event sent to motoboy ${motoboy._id}`);
  }
};
