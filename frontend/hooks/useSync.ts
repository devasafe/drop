import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';

export const useProducts = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get('/products');
        // ✅ FIX: API retorna { products: [...], pagination: {...} }
        // não apenas um array
        const productsData = res.data?.products || res.data || [];
        setProducts(Array.isArray(productsData) ? productsData : []);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar produtos:', err);
        setProducts([]); // ✅ Fallback: definir array vazio em caso de erro
        setLoading(false);
      }
    };

    fetchProducts();

    // Socket listeners
    const handleProductCreated = (data: any) => {
      setProducts(prev => [data, ...prev]);
    };

    const handleProductUpdated = (data: any) => {
      setProducts(prev =>
        prev.map(p => (p._id === data._id ? data : p))
      );
    };

    const handleProductDeleted = (data: any) => {
      setProducts(prev => prev.filter(p => p._id !== data._id));
    };

    const unsubscribe1 = on('product:created', handleProductCreated);
    const unsubscribe2 = on('product:updated', handleProductUpdated);
    const unsubscribe3 = on('product:deleted', handleProductDeleted);

    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
    };
  }, [on]);

  return { products, loading, setProducts };
};

export const useOrders = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, isConnected } = useSocket();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevConnectedRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get('/orders');
      const ordersData = res.data?.orders || res.data || [];
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
      setOrders([]);
      setLoading(false);
    }
  }, []);

  // Refetch com debounce para evitar múltiplas chamadas simultâneas
  const refetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders();
    }, 300);
  }, [fetchOrders]);

  // Refetch automático quando socket reconecta
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      // Socket acabou de (re)conectar — sincronizar dados
      fetchOrders();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, fetchOrders]);

  useEffect(() => {
    fetchOrders();

    // Todos os eventos que afetam pedidos disparam refetch completo
    const orderEvents = [
      'order:created',
      'order:updated',
      'order:status_changed',
      'order:cancelled',
      'order:accepted_by_store',
      'order:rejected_by_store',
    ];

    const unsubscribers = orderEvents.map(event =>
      on(event, () => {
        console.log(`📡 [useOrders] Evento "${event}" recebido — refetching...`);
        refetch();
      })
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribers.forEach(u => u());
    };
  }, [on, fetchOrders, refetch]);

  return { orders, loading, setOrders, refetch };
};

export const useDeliveries = () => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, isConnected } = useSocket();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevConnectedRef = useRef(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await api.get('/deliveries/available');
      const deliveriesData = res.data?.deliveries || res.data || [];
      setDeliveries(Array.isArray(deliveriesData) ? deliveriesData : []);
      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar entregas:', err);
      setDeliveries([]);
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDeliveries();
    }, 300);
  }, [fetchDeliveries]);

  // Refetch automático quando socket reconecta
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      fetchDeliveries();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, fetchDeliveries]);

  useEffect(() => {
    fetchDeliveries();

    const deliveryEvents = [
      'delivery:created',
      'delivery:updated',
      'delivery:status_changed',
      'delivery:available',
      'delivery:assigned',
      'delivery:cancelled',
    ];

    const unsubscribers = deliveryEvents.map(event =>
      on(event, () => {
        console.log(`📡 [useDeliveries] Evento "${event}" recebido — refetching...`);
        refetch();
      })
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribers.forEach(u => u());
    };
  }, [on, fetchDeliveries, refetch]);

  return { deliveries, loading, setDeliveries, refetch };
};

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    // Não tentar buscar notificações sem token (usuário deslogado em páginas
    // públicas como /inicio). Evita 401 ruidoso no console.
    const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('token');
    if (!hasToken) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const fetchNotifications = async () => {
      try {
        const res = await api.get('/notifications');
        // ✅ FIX: Suporta tanto array direto quanto { notifications: [...] }
        const notificationsData = Array.isArray(res.data)
          ? res.data
          : res.data?.notifications || [];
        setNotifications(Array.isArray(notificationsData) ? notificationsData : []);
        const unread = (notificationsData || []).filter((n: any) => !n.read).length;
        setUnreadCount(unread);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar notificações:', err);
        setNotifications([]); // ✅ Fallback: definir array vazio em caso de erro
        setUnreadCount(0);
        setLoading(false);
      }
    };

    fetchNotifications();

    const handleNotificationReceived = (data: any) => {
      setNotifications(prev => [data, ...prev]);
      if (!data.read) setUnreadCount(prev => prev + 1);
    };

    const handleNotificationRead = (data: any) => {
      setNotifications(prev =>
        prev.map(n => (n._id === data._id ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const unsubscribe1 = on('notification:received', handleNotificationReceived);
    const unsubscribe2 = on('notification:read', handleNotificationRead);

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [on]);

  return { notifications, unreadCount, loading, setNotifications };
};

export const useStores = () => {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await api.get('/stores');
        // ✅ FIX: Suporta tanto array direto quanto { stores: [...] }
        const storesData = Array.isArray(res.data) 
          ? res.data 
          : res.data?.stores || [];
        setStores(Array.isArray(storesData) ? storesData : []);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar lojas:', err);
        setStores([]); // ✅ Fallback: definir array vazio em caso de erro
        setLoading(false);
      }
    };

    fetchStores();

    const handleStoreCreated = (data: any) => {
      setStores(prev => [data, ...prev]);
    };

    const handleStoreUpdated = (data: any) => {
      setStores(prev =>
        prev.map(s => (s._id === data._id ? data : s))
      );
    };

    const unsubscribe1 = on('store:created', handleStoreCreated);
    const unsubscribe2 = on('store:updated', handleStoreUpdated);

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [on]);

  return { stores, loading, setStores };
};

export const useGamification = (userId?: string) => {
  const [gam, setGam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!userId) return;

    const fetchGamification = async () => {
      try {
        const res = await api.get(`/gamification/${userId}`);
        setGam(res.data);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar gamificação:', err);
        setLoading(false);
      }
    };

    fetchGamification();

    const handlePointsEarned = (data: any) => {
      setGam(prev => ({
        ...prev,
        points: prev.points + data.pointsEarned,
        recentActivity: [data, ...prev.recentActivity],
      }));
    };

    const handleBadgeUnlocked = (data: any) => {
      setGam(prev => ({
        ...prev,
        badges: [...prev.badges, data.badge],
      }));
    };

    const unsubscribe1 = on('gamification:points_earned', handlePointsEarned);
    const unsubscribe2 = on('gamification:badge_unlocked', handleBadgeUnlocked);

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [userId, on]);

  return { gam, loading, setGam };
};

export const useAddresses = () => {
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAddresses = async () => {
      try {
        const res = await api.get('/user/addresses');
        // ✅ DEBUG: Log da resposta
        console.log('[useAddresses] Response:', res.data);
        console.log('[useAddresses] Type:', typeof res.data);
        console.log('[useAddresses] Is Array:', Array.isArray(res.data));
        
        // ✅ FIX: Endpoint agora retorna array direto
        const addressesData = Array.isArray(res.data) ? res.data : [];
        setAddresses(addressesData);
        console.log('[useAddresses] Final count:', addressesData.length);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar endereços:', err);
        setAddresses([]);
        setLoading(false);
      }
    };

    fetchAddresses();
  }, []);

  return { addresses, loading, setAddresses };
};

export const useOngoingDeliveries = () => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, isConnected } = useSocket();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const prevConnectedRef = useRef(false);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await api.get('/deliveries/ongoing');
      const deliveriesData = res.data?.deliveries || res.data || [];
      setDeliveries(Array.isArray(deliveriesData) ? deliveriesData : []);
      setLoading(false);
    } catch (err) {
      console.error('Erro ao buscar entregas em andamento:', err);
      setDeliveries([]);
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDeliveries();
    }, 300);
  }, [fetchDeliveries]);

  // Refetch automático quando socket reconecta
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      fetchDeliveries();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, fetchDeliveries]);

  useEffect(() => {
    fetchDeliveries();

    const deliveryEvents = [
      'delivery:created',
      'delivery:updated',
      'delivery:status_changed',
      'delivery:completed',
      'delivery:cancelled',
      'delivery:picked',
      'delivery:assigned_to_me',
      'delivery:assigned_to_you',
      'delivery:return_confirmed',
      'delivery:rejected',
    ];

    const unsubscribers = deliveryEvents.map(event =>
      on(event, () => {
        console.log(`📡 [useOngoingDeliveries] Evento "${event}" recebido — refetching...`);
        refetch();
      })
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribers.forEach(u => u());
    };
  }, [on, fetchDeliveries, refetch]);

  return { deliveries, loading, setDeliveries, refetch };
};

export const useDeliveryHistory = () => {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    const fetchDeliveries = async () => {
      try {
        const res = await api.get('/deliveries/history');
        setDeliveries(res.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar histórico de entregas:', err);
        setLoading(false);
      }
    };

    fetchDeliveries();

    const handleDeliveryStatusChanged = (data: any) => {
      // 🎯 Quando delivery é completada ou cancelada, adiciona ao histórico
      if (data.status === 'delivered' || data.status === 'cancelled') {
        setDeliveries(prev => {
          // Evita duplicatas
          if (prev.some(d => d._id === data._id)) {
            return prev.map(d => (d._id === data._id ? data : d));
          }
          return [data, ...prev];
        });
      }
    };

    const handleDeliveryCompleted = (data: any) => {
      // 🎯 Quando delivery é completada, adiciona ao histórico
      console.log(`📚 [useDeliveryHistory] Delivery completed, adding to history:`, data.deliveryId);
      setDeliveries(prev => {
        // Evita duplicatas
        if (prev.some(d => d._id === data.deliveryId)) {
          return prev.map(d => (d._id === data.deliveryId ? { ...d, status: 'delivered' } : d));
        }
        return [{ _id: data.deliveryId, status: 'delivered', ...data }, ...prev];
      });
    };

    // 📡 Register socket listeners
    const unsubscribe1 = on('delivery:status_changed', handleDeliveryStatusChanged);
    const unsubscribe2 = on('delivery:completed', handleDeliveryCompleted);

    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [on]);

  return { deliveries, loading, setDeliveries };
};

export const useOrder = (orderId?: string) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const res = await api.get(`/orders/${orderId}`);
        setOrder(res.data);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar pedido:', err);
        setLoading(false);
      }
    };

    fetchOrder();

    const handleOrderUpdated = (data: any) => {
      if (data._id === orderId) {
        setOrder(data);
      }
    };

    const handleOrderStatusChanged = (data: any) => {
      if (data._id === orderId) {
        setOrder(prev => ({ ...prev, status: data.status }));
      }
    };

    // ✅ NOVO: Listener para quando loja aceita o pedido
    const handleOrderAcceptedByStore = (data: any) => {
      if (data.orderId === orderId) {
        console.log('✅ [Socket] Loja aceitou o pedido:', data);
        setOrder(prev => ({ ...prev, status: 'pago' }));
      }
    };

    // ✅ NOVO: Listener para quando motoboy é atribuído
    const handleMotoboyAssigned = (data: any) => {
      if (data.orderId === orderId) {
        console.log('🏍️ [Socket] Motoboy atribuído:', data);
        // Atualizar delivery info
        setOrder(prev => ({ 
          ...prev, 
          deliveryMotoboy: data.motoboyName,
          motoboyStatus: data.status
        }));
      }
    };

    // ✅ NOVO: Listener para quando pedido é retirado
    const handleDeliveryPicked = (data: any) => {
      if (data.orderId === orderId) {
        console.log('🚗 [Socket] Pedido retirado:', data);
        setOrder(prev => ({ ...prev, deliveryStatus: 'picked' }));
      }
    };

    const unsub1 = on('order:updated', handleOrderUpdated);
    const unsub2 = on('order:status_changed', handleOrderStatusChanged);
    const unsub3 = on('order:accepted_by_store', handleOrderAcceptedByStore);
    const unsub4 = on('motoboy:assigned', handleMotoboyAssigned);
    const unsub5 = on('delivery:picked', handleDeliveryPicked);

    return () => {
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5();


    };
  }, [orderId, on]);

  return { order, loading, setOrder };
};

export const useDelivery = (deliveryId?: string) => {
  const [delivery, setDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!deliveryId) {
      setLoading(false);
      return;
    }

    const fetchDelivery = async () => {
      try {
        const res = await api.get(`/deliveries/${deliveryId}`);
        setDelivery(res.data);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar entrega:', err);
        setLoading(false);
      }
    };

    fetchDelivery();

    const handleDeliveryUpdated = (data: any) => {
      if (data._id === deliveryId) {
        setDelivery(data);
      }
    };

    const handleDeliveryStatusChanged = (data: any) => {
      if (data._id === deliveryId) {
        setDelivery(prev => ({ ...prev, status: data.status }));
      }
    };

    const handleDeliveryLocationUpdated = (data: any) => {
      if (data._id === deliveryId) {
        setDelivery(prev => ({
          ...prev,
          currentLocation: data.location,
          estimatedTime: data.estimatedTime,
        }));
      }
    };

    // ✅ NOVO: Listener para quando pedido é retirado
    const handleDeliveryPicked = (data: any) => {
      if (data.deliveryId === deliveryId) {
        console.log('🚗 [Socket] Delivery retirado:', data);
        setDelivery(prev => ({ ...prev, status: 'picked' }));
      }
    };

    // ✅ NOVO: Listener para quando PIN é validado
    const handlePinValidated = (data: any) => {
      if (data.deliveryId === deliveryId) {
        console.log('✅ [Socket] PIN validado:', data);
        setDelivery(prev => ({ ...prev, status: 'picked' }));
      }
    };

    // ✅ NOVO: Listener para quando entrega é completada
    const handleDeliveryCompleted = (data: any) => {
      if (data.deliveryId === deliveryId) {
        console.log('✅ [Socket] Delivery completed:', data);
        setDelivery(prev => ({ ...prev, status: 'delivered' }));
      }
    };

    const unsub1 = on('delivery:updated', handleDeliveryUpdated);
    const unsub2 = on('delivery:status_changed', handleDeliveryStatusChanged);
    const unsub3 = on('delivery:location_updated', handleDeliveryLocationUpdated);
    const unsub4 = on('delivery:picked', handleDeliveryPicked);
    const unsub5 = on('delivery:pin_validated', handlePinValidated);
    const unsub6 = on('delivery:completed', handleDeliveryCompleted);

    return () => {
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6();



    };
  }, [deliveryId, on]);

  return { delivery, loading, setDelivery };
};

export const useCategories = (storeId?: string) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }

    const fetchCategories = async () => {
      try {
        const res = await api.get(`/categories?storeId=${storeId}`);
        setCategories(res.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar categorias:', err);
        setCategories([]);
        setLoading(false);
      }
    };

    fetchCategories();

    const handleCategoryCreated = (data: any) => {
      if (data.storeId === storeId) {
        setCategories(prev => (prev.some(c => c._id === data._id) ? prev : [data, ...prev]));
      }
    };

    const handleCategoryUpdated = (data: any) => {
      if (data.storeId === storeId) {
        setCategories(prev =>
          prev.map(c => (c._id === data._id ? data : c))
        );
      }
    };

    const unsub1 = on('category:created', handleCategoryCreated);
    const unsub2 = on('category:updated', handleCategoryUpdated);

    return () => {
      unsub1(); unsub2();
    };
  }, [storeId, on]);

  return { categories, loading, setCategories };
};

export const useRanking = () => {
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const res = await api.get('/gamification/ranking-mensal');
        setRanking(res.data || []);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar ranking:', err);
        setRanking([]);
        setLoading(false);
      }
    };

    fetchRanking();

    const handleRankingUpdated = (data: any) => {
      setRanking(prev =>
        prev.map(r =>
          r.user_id === data.user_id || r._id === data._id
            ? { ...r, ...data }
            : r
        ).sort((a, b) => (b.deliveries || 0) - (a.deliveries || 0))
      );
    };

    const unsub = on('ranking:updated', handleRankingUpdated);

    return () => { unsub(); };
  }, [on]);

  return { ranking, loading, setRanking };
};

export const useProduct = (productId?: string) => {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket();

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      return;
    }

    const fetchProduct = async () => {
      try {
        const res = await api.get(`/products/${productId}`);
        setProduct(res.data);
        setLoading(false);
      } catch (err) {
        console.error('Erro ao buscar produto:', err);
        setLoading(false);
      }
    };

    fetchProduct();

    const handleProductUpdated = (data: any) => {
      if (data._id === productId) {
        setProduct(data);
      }
    };

    const unsub = on('product:updated', handleProductUpdated);

    return () => { unsub(); };
  }, [productId, on]);

  return { product, loading, setProduct };
};

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
      if (data.userId === ownerId) {
        setWallet((prev: any) => prev ? {
          ...prev,
          balance: data.balance,
          totalIncome: data.totalIncome,
          totalSpent: data.totalSpent,
        } : prev);
      }
    };

    const handleTransferReceived = () => {
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
