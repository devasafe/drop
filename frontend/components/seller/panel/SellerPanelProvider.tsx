// frontend/components/seller/panel/SellerPanelProvider.tsx
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../lib/api';
import AuthContext from '../../../contexts/AuthContext';
import { connectSocket } from '../../../lib/socket';
import { useSocketListener } from '../../../hooks/useAutoRefetch';
import { ReturnRequest, mergeReturns, pendingReturnsFromOrders, sameId, upsertReturn } from './sellerPanelState';

export type { ReturnRequest } from './sellerPanelState';

export interface SellerPanelValue {
  /** true só dentro do SellerPanelProvider: quem lê a loja daqui não refaz o GET /stores/dashboard (V12). */
  inPanel: boolean;
  store: any | null;
  /** Catálogo do dono, da mesma leitura de /stores/dashboard. */
  products: any[];
  orders: any[];
  history: any[];
  categories: string[];
  returnRequests: ReturnRequest[];
  loading: boolean;
  error: string | null;
  /** Pedidos que chegaram pelo socket desde a última limpeza (para destacar o card). */
  newOrderIds: string[];
  newOrderCount: number;
  refresh: () => Promise<void>;
  clearNewOrders: () => void;
  dismissReturn: (deliveryId: string) => void;
  /** Atualização otimista depois de uma ação que o servidor já confirmou (ex.: aceite). */
  patchOrder: (orderId: string, patch: Record<string, unknown>) => void;
  removeOrder: (orderId: string) => void;
}

const SellerPanelContext = createContext<SellerPanelValue | null>(null);

function SellerPanelRoot({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = (useContext(AuthContext) || {}) as any;
  const userKey: string | null = user ? String(user._id || user.id || 'me') : null;
  // V12: com a sessão ainda carregando, o painel fica "carregando" (quem lê dele espera, sem GET próprio).
  const sessionPending = !userKey && authLoading === true;

  const [store, setStore] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userKey || sessionPending);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const ordersRef = useRef<any[]>([]);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  const load = useCallback(async (): Promise<any[]> => {
    try {
      const r = await api.get('/stores/dashboard');
      const d = r?.data || {};
      const loaded: any[] = d.orders || [];
      if (!mounted.current) return loaded;
      setStore(d.store || null);
      setProducts(Array.isArray(d.products) ? d.products : []);
      setOrders(loaded);
      setHistory(d.history || []);
      setCategories(d.categories || []);
      setReturnRequests((prev) => mergeReturns(prev, pendingReturnsFromOrders(loaded), loaded));
      setError(null);
      return loaded;
    } catch (e: any) {
      if (mounted.current) {
        if (e?.response?.status === 404) {
          // lojista ainda sem loja (ex.: em /seller/create-store): não é erro
          setStore(null);
          setProducts([]);
          setError(null);
        } else {
          setError('Não foi possível carregar o painel. Tente de novo.');
        }
      }
      return [];
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => { await load(); }, [load]);

  useEffect(() => {
    if (!userKey) { setLoading(sessionPending); return; }
    setLoading(true);
    load();
  }, [userKey, sessionPending, load]);

  // Sala da loja: entra ao saber o id e de novo a cada reconexão.
  const storeId: string | null = store?._id ? String(store._id) : null;
  useEffect(() => {
    if (!userKey || !storeId) return;
    const socket = connectSocket();
    if (!socket.connected) socket.connect();
    const doJoin = () => socket.emit('join', { room: `store:${storeId}`, storeId });
    doJoin();
    socket.on('connect', doJoin);
    return () => { socket.off('connect', doJoin); };
  }, [userKey, storeId]);

  // Pedido novo: recarrega e marca o id (um por pedido). O som e o pop-up ficam no RealtimeNotifier.
  const onNewOrder = useCallback(async (data: any) => {
    const id = data?.orderId !== undefined && data?.orderId !== null ? String(data.orderId) : null;
    const loaded = await load();
    const newest = id || (loaded[0]?._id !== undefined ? String(loaded[0]._id) : null);
    if (newest && mounted.current) setNewOrderIds((prev) => (prev.includes(newest) ? prev : [...prev, newest]));
  }, [load]);

  const onRefreshEvent = useCallback(() => { load(); }, [load]);

  const onAccepted = useCallback((data: any) => {
    if (!data?.orderId) return;
    setOrders((prev) => prev.map((o) => (sameId(o._id, data.orderId) ? { ...o, status: data.status || 'aguardando_motoboy' } : o)));
  }, []);

  const onCancelled = useCallback((data: any) => {
    const orderId = data?.orderId;
    if (!orderId) return;
    const cancelled = ordersRef.current.find((o) => sameId(o._id, orderId));
    if (cancelled) {
      setHistory((h) => (h.some((o) => sameId(o._id, cancelled._id)) ? h : [{ ...cancelled, status: 'cancelado' }, ...h]));
    }
    setOrders((prev) => prev.filter((o) => !sameId(o._id, orderId)));
    setReturnRequests((prev) => prev.filter((r) => !sameId(r.orderId, orderId)));
  }, []);

  const onReturnRequested = useCallback((data: any) => {
    if (!data?.deliveryId || !data?.orderId) return;
    setReturnRequests((prev) => upsertReturn(prev, { ...data, deliveryId: String(data.deliveryId), orderId: String(data.orderId) }));
  }, []);

  // Mesmos eventos que o store-dashboard escutava (menos order:created, que chega junto com new_order).
  useSocketListener('new_order', onNewOrder);
  useSocketListener('motoboy:assigned_to_order', onRefreshEvent);
  useSocketListener('order_update', onRefreshEvent);
  useSocketListener('order:updated', onRefreshEvent);
  useSocketListener('order:status_changed', onRefreshEvent);
  useSocketListener('order:picked_up', onRefreshEvent);
  useSocketListener('order:rejected_by_store', onRefreshEvent);
  useSocketListener('delivery:completed', onRefreshEvent);
  useSocketListener('delivery:cancelled', onRefreshEvent);
  useSocketListener('delivery:assigned', onRefreshEvent);
  useSocketListener('order:accepted_confirmation', onAccepted);
  useSocketListener('order:cancelled', onCancelled);
  useSocketListener('delivery:return_requested', onReturnRequested);

  const clearNewOrders = useCallback(() => setNewOrderIds([]), []);
  const dismissReturn = useCallback((deliveryId: string) => {
    setReturnRequests((prev) => prev.filter((r) => r.deliveryId !== String(deliveryId)));
  }, []);
  const patchOrder = useCallback((orderId: string, patch: Record<string, unknown>) => {
    setOrders((prev) => prev.map((o) => (sameId(o._id, orderId) ? { ...o, ...patch } : o)));
  }, []);
  const removeOrder = useCallback((orderId: string) => {
    setOrders((prev) => prev.filter((o) => !sameId(o._id, orderId)));
  }, []);

  const value = useMemo<SellerPanelValue>(() => ({
    inPanel: true, store, products, orders, history, categories, returnRequests, loading, error,
    newOrderIds, newOrderCount: newOrderIds.length,
    refresh, clearNewOrders, dismissReturn, patchOrder, removeOrder,
  }), [store, products, orders, history, categories, returnRequests, loading, error, newOrderIds, refresh, clearNewOrders, dismissReturn, patchOrder, removeOrder]);

  return <SellerPanelContext.Provider value={value}>{children}</SellerPanelContext.Provider>;
}

/**
 * Painel da loja (D1): loja, pedidos, devoluções e socket da sala `store:<id>`, montado uma vez
 * para todo /seller/*. Dentro de outro SellerPanelProvider só repassa os filhos (não duplica carga nem socket).
 */
export function SellerPanelProvider({ children }: { children: ReactNode }) {
  const parent = useContext(SellerPanelContext);
  if (parent) return <>{children}</>;
  return <SellerPanelRoot>{children}</SellerPanelRoot>;
}

const EMPTY_PANEL: SellerPanelValue = {
  inPanel: false,
  store: null,
  products: [],
  orders: [],
  history: [],
  categories: [],
  returnRequests: [],
  loading: false,
  error: null,
  newOrderIds: [],
  newOrderCount: 0,
  refresh: async () => {},
  clearNewOrders: () => {},
  dismissReturn: () => {},
  patchOrder: () => {},
  removeOrder: () => {},
};

/** Fora do provider devolve um estado vazio (não lança), para telas que também rodam fora do painel. */
export function useSellerPanel(): SellerPanelValue {
  return useContext(SellerPanelContext) || EMPTY_PANEL;
}

/** Para o chrome e testes: null fora do painel da loja. */
export function useSellerPanelOptional(): SellerPanelValue | null {
  return useContext(SellerPanelContext);
}
