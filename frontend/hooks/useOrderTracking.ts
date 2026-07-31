import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useOrder, useDelivery } from './useSync';
import { useSocket } from '../contexts/SocketContext';
import type { OrderTrackerStep } from '../components/drop/OrderTracker';
import type { PixInfo } from '../types/checkout';

export type StatusTone = 'info' | 'success' | 'danger' | 'pending';

type ActionResult = { ok: boolean; error?: string };

const AUTO_POLL_INTERVAL_MS = 5000;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return fallback;
}

// Ordem cronológica; cada step "done" conforme order.status / delivery.status.
// Portado de `pages/store-order/[id].tsx` (getStatusIcon/getStatusText).
function deriveSteps(order: any, delivery: any): OrderTrackerStep[] {
  const os = order?.status;
  const ds = delivery?.status;
  const paid = os !== 'criado';
  const accepted = os === 'pago' || os === 'enviado' || os === 'entregue' || !!delivery;
  return [
    { label: 'Criado', done: !!os },
    { label: 'Pago', done: paid },
    { label: 'Aceito', done: accepted },
    { label: 'A caminho', done: ds === 'picked' || ds === 'delivered' || os === 'entregue' },
    { label: 'Entregue', done: ds === 'delivered' || os === 'entregue' },
  ];
}

// Portado de `getStatusColor` — hex fixos trocados pelo union `StatusTone`
// pra quem consome decidir a cor conforme o tema do design system.
function deriveStatusTone(order: any, delivery: any): StatusTone {
  const os = order?.status;
  const ds = delivery?.status;

  if (os === 'cancelado' || os === 'rejeitado') return 'danger';
  if (!delivery) return 'pending';
  if (ds === 'pending') return 'pending';
  if (ds === 'assigned' || ds === 'picked') return 'info';
  if (ds === 'delivered') return 'success';
  if (ds === 'cancelled') return 'danger';
  return 'pending';
}

// Portado de `getStatusText`.
function deriveStatusLabel(order: any, delivery: any): string {
  const os = order?.status;
  const ds = delivery?.status;

  if (os === 'cancelado') return 'Seu pedido foi cancelado. Reembolso será processado em breve.';
  if (os === 'rejeitado') return 'Seu pedido foi rejeitado pela loja';

  if (!delivery) {
    if (os === 'criado') return 'Aguardando loja confirmar seu pedido...';
    if (os === 'pago') {
      // Plano 1: sem taxa de entrega e sem delivery — loja gerencia a entrega.
      if (!order.deliveryFee || order.deliveryFee === 0) return 'Pedido confirmado! A loja está preparando e organizando sua entrega.';
      return 'Procurando motoboy...';
    }
    // [Plan1] Loja confirmou a entrega manualmente.
    if (os === 'entregue' && (!order.deliveryFee || order.deliveryFee === 0)) {
      return 'Pedido entregue! Obrigado pela compra.';
    }
    return 'Processando seu pedido...';
  }

  if (ds === 'pending') return 'Aguardando um motoboy aceitar a entrega...';
  if (ds === 'assigned') return 'Motoboy a caminho para buscar seu pedido na loja!';
  if (ds === 'picked') return 'Motoboy retirou seu pedido! Em trânsito para seu endereço...';
  if (ds === 'delivered') return 'Seu pedido foi entregue!';
  if (ds === 'cancelled') return 'Entrega foi cancelada';
  return 'Processando...';
}

/**
 * Hook central da tela de acompanhamento de pedido: compõe `useOrder`/
 * `useDelivery`, os listeners de socket que mantêm os dois em sincronia em
 * tempo real, a derivação de steps/progresso/tom de status e as ações
 * (confirmar recebimento, avaliar motoboy/loja, retomar PIX pendente).
 * Portado de `pages/store-order/[id].tsx`.
 */
export function useOrderTracking(orderId?: string) {
  const { order, loading: orderLoading, setOrder } = useOrder(orderId);
  const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
  const { on } = useSocket();
  const [pixData, setPixData] = useState<PixInfo | null>(null);
  const [motoboyPos, setMotoboyPos] = useState<{ lat: number; lng: number } | null>(null);

  const refetchDelivery = useCallback(async (deliveryId: string) => {
    try {
      const res = await api.get(`/deliveries/${deliveryId}`);
      setDelivery(res.data);
    } catch (err) {
      console.error(`Falha ao rebuscar entrega ${deliveryId}:`, err);
    }
  }, [setDelivery]);

  // Socket listeners: mantém order/delivery sincronizados em tempo real.
  // Cada `on(...)` devolve um unsubscribe, chamado no cleanup.
  useEffect(() => {
    if (!orderId) return;
    const currentDeliveryId = order?.deliveryId;

    const handleOrderAccepted = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrder((prev: any) => (prev ? { ...prev, status: 'pago', deliveryId: data.deliveryId || prev.deliveryId } : prev));
      const dId = data.deliveryId || currentDeliveryId;
      if (dId) refetchDelivery(dId);
    };

    const handleMotoboyAssigned = (data: any) => {
      if (data.orderId !== orderId) return;
      const dId = currentDeliveryId || data.deliveryId;
      if (dId) refetchDelivery(dId);
    };

    const handleDeliveryPicked = (data: any) => {
      if (data.orderId !== orderId) return;
      const dId = currentDeliveryId || data.deliveryId;
      if (dId) refetchDelivery(dId);
    };

    const handleDeliveryCompleted = (data: any) => {
      if (data.deliveryId !== currentDeliveryId) return;
      setDelivery((prev: any) => (prev ? { ...prev, status: 'delivered' } : prev));
      if (currentDeliveryId) refetchDelivery(currentDeliveryId);
    };

    const handleDeliveryStatusChanged = (data: any) => {
      if (data._id !== currentDeliveryId && data.deliveryId !== currentDeliveryId) return;
      setDelivery((prev: any) => (prev ? { ...prev, status: data.status } : prev));
      if (currentDeliveryId) refetchDelivery(currentDeliveryId);
    };

    const handleOrderRejected = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrder((prev: any) => (prev ? { ...prev, status: 'rejeitado' } : prev));
    };

    const handleReturnConfirmed = (data: any) => {
      if (data.deliveryId !== currentDeliveryId) return;
      setDelivery((prev: any) => (prev ? { ...prev, statusDevolucao: 'confirmado' } : prev));
      if (currentDeliveryId) refetchDelivery(currentDeliveryId);
    };

    const handleOrderCancelled = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrder((prev: any) => (prev ? { ...prev, status: 'cancelado' } : prev));
    };

    // [Plan1] Lojista confirmou entrega manualmente.
    const handleOrderDelivered = (data: any) => {
      if (data.orderId !== orderId) return;
      setOrder((prev: any) => (prev ? { ...prev, status: 'entregue' } : prev));
    };

    // Posição do motoboy em tempo real. Relay do backend (`notifier.ts`) usa
    // `_id` (não `deliveryId`) e aninha as coordenadas em `location`.
    const handleLocationUpdated = (data: any) => {
      if (data._id !== currentDeliveryId) return;
      const { latitude, longitude } = data.location || {};
      if (latitude == null || longitude == null) return;
      setMotoboyPos({ lat: latitude, lng: longitude });
    };

    const unsubscribers = [
      on('order:accepted_by_store', handleOrderAccepted),
      on('motoboy:assigned', handleMotoboyAssigned),
      on('delivery:picked', handleDeliveryPicked),
      on('delivery:completed', handleDeliveryCompleted),
      on('delivery:status_changed', handleDeliveryStatusChanged),
      on('order:rejected_by_store', handleOrderRejected),
      on('delivery:return_confirmed', handleReturnConfirmed),
      on('order:cancelled', handleOrderCancelled),
      on('order:delivered', handleOrderDelivered),
      on('delivery:location_updated', handleLocationUpdated),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [orderId, order?.deliveryId, on, setOrder, setDelivery, refetchDelivery]);

  // Fallback: auto-polling da entrega a cada 5s, caso o socket falhe.
  useEffect(() => {
    if (!orderId || !order?.deliveryId) return;
    const pollInterval = setInterval(() => {
      refetchDelivery(order.deliveryId);
    }, AUTO_POLL_INTERVAL_MS);
    return () => clearInterval(pollInterval);
  }, [orderId, order?.deliveryId, refetchDelivery]);

  // PIX pendente: SOB DEMANDA, só ao chamar `openPix()` (ex.: clique em
  // "Pagar com PIX"). Não busca automaticamente no mount — o original
  // (`openPix` em store-order/[id].tsx:34-49) só populava `pixData` quando o
  // cliente pedia explicitamente, e como a página renderiza
  // `{pixData && <PixPaymentSheet/>}`, popular sozinho faria o sheet abrir
  // por conta própria. O polling de confirmação fica no PixPaymentSheet.
  const openPix = useCallback(async (): Promise<ActionResult> => {
    if (!orderId) return { ok: false, error: 'Pedido inválido' };
    try {
      const res = await api.get(`/orders/${orderId}/pix`);
      if (res.data?.paid) {
        setOrder((prev: any) => (prev ? { ...prev, paymentStatus: 'paid' } : prev));
      } else {
        setPixData({ ...res.data, orderId });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Não foi possível carregar o PIX.') };
    }
  }, [orderId, setOrder]);

  const closePix = useCallback(() => setPixData(null), []);

  const refetch = useCallback(() => {
    if (!orderId) return;
    api.get(`/orders/${orderId}`).then((res) => setOrder(res.data)).catch((err) => {
      console.error('Falha ao rebuscar pedido:', err);
    });
    if (order?.deliveryId) refetchDelivery(order.deliveryId);
  }, [orderId, order?.deliveryId, setOrder, refetchDelivery]);

  const confirmReceived = useCallback(async (): Promise<ActionResult> => {
    if (!orderId) return { ok: false, error: 'Pedido inválido' };
    try {
      await api.post(`/orders/${orderId}/deliver`);
      setOrder((prev: any) => (prev ? { ...prev, status: 'entregue' } : prev));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Erro ao confirmar recebimento. Tente novamente.') };
    }
  }, [orderId, setOrder]);

  const submitMotoboyRating = useCallback(async (rating: number, comment: string): Promise<ActionResult> => {
    if (!delivery?._id) return { ok: false, error: 'Entrega não encontrada' };
    if (rating === 0) return { ok: false, error: 'Selecione uma nota' };
    try {
      await api.post(`/deliveries/${delivery._id}/avaliar`, { rating, comment });
      setDelivery((prev: any) => (prev ? { ...prev, rating, comment } : prev));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Erro ao enviar avaliação') };
    }
  }, [delivery?._id, setDelivery]);

  const submitStoreRating = useCallback(async (rating: number, comment: string): Promise<ActionResult> => {
    if (!order?._id) return { ok: false, error: 'Pedido não encontrado' };
    if (rating === 0) return { ok: false, error: 'Selecione uma nota' };
    try {
      await api.post(`/orders/${order._id}/evaluate-store`, { storeRating: rating, storeComment: comment });
      setOrder((prev: any) => (prev ? { ...prev, storeRating: rating, storeComment: comment } : prev));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err, 'Erro ao enviar avaliação da loja') };
    }
  }, [order?._id, setOrder]);

  const steps = deriveSteps(order, delivery);
  const progress = steps.length > 0 ? steps.filter((s) => s.done).length / steps.length : 0;
  const showMap = !!delivery && (delivery.status === 'assigned' || delivery.status === 'picked');
  const showPin = !!delivery?.pin && (delivery.status === 'assigned' || delivery.status === 'picked');
  const canConfirmReceived = !delivery && order?.status === 'pago' && (!order?.deliveryFee || order.deliveryFee === 0);

  return {
    order,
    delivery,
    loading: orderLoading || deliveryLoading,
    steps,
    progress,
    statusLabel: deriveStatusLabel(order, delivery),
    statusTone: deriveStatusTone(order, delivery),
    showMap,
    showPin,
    motoboyPos,
    canConfirmReceived,
    confirmReceived,
    submitMotoboyRating,
    submitStoreRating,
    pixData,
    openPix,
    closePix,
    refetch,
  };
}
