import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useOrder, useDelivery } from '../../hooks/useSync';
import { useSocket } from '../../contexts/SocketContext';
import { CancelOrderModal } from '../../components/order/CancelOrderModal';
import { CancellationStatusDisplay } from '../../components/order/CancellationStatusDisplay';
import PixPaymentModal from '../../components/PixPaymentModal';
import styles from './StoreOrderStatus.module.css';

export default function StoreOrderStatus() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading, setOrder } = useOrder(id);
  const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
  const { on } = useSocket();
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState('');
  const [storeRating, setStoreRating] = useState<number>(0);
  const [storeComment, setStoreComment] = useState('');
  const [storeSubmitted, setStoreSubmitted] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirmingReceived, setConfirmingReceived] = useState(false);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<any>(null);
  const [loadingPix, setLoadingPix] = useState(false);

  // Retomar pagamento PIX de um pedido pendente
  const openPix = async () => {
    if (!id) return;
    setLoadingPix(true);
    try {
      const res = await api.get(`/orders/${id}/pix`);
      if (res.data?.paid) {
        setOrder((prev: any) => ({ ...prev, paymentStatus: 'paid' }));
      } else {
        setPixData({ ...res.data, orderId: id });
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Não foi possível carregar o PIX.');
    } finally {
      setLoadingPix(false);
    }
  };

  // Helper: Refetch delivery data from API
  const refetchDelivery = async (deliveryId: string) => {
    try {
      const res = await api.get(`/deliveries/${deliveryId}`);
      setDelivery(res.data);
      console.log(`✅ [Refetch] Delivery updated:`, res.data);
    } catch (err) {
      console.error(`❌ [Refetch] Failed to fetch delivery ${deliveryId}:`, err);
    }
  };

  // Socket Listeners Setup
  useEffect(() => {
    if (!id || !order) return;

    console.log(`📡 [Store Order] Setting up socket listeners for order: ${id}`);

    // 🎯 Event 1: Loja aceitou pedido
    const handleOrderAccepted = (data: any) => {
      console.log(`📨 [Socket] Received event 'order:accepted_by_store':`, data);

      if (data.orderId !== id) {
        console.log(`⏭️ [Socket] Event is for different order, skipping`);
        return;
      }

      setOrder((prev: any) => ({
        ...prev,
        status: 'pago',
        deliveryId: data.deliveryId || prev.deliveryId
      }));
      console.log(`✅ [Order Updated] Status changed to 'pago'`);

      if (data.deliveryId) {
        refetchDelivery(data.deliveryId);
      } else if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      }
    };

    // 🎯 Event 2: Motoboy foi atribuído
    const handleMotoboyAssigned = (data: any) => {
      console.log(`📨 [Socket] Received event 'motoboy:assigned':`, data);

      if (data.orderId !== id) {
        console.log(`⏭️ [Socket] Event is for different order, skipping`);
        return;
      }

      if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      } else if (data.deliveryId) {
        refetchDelivery(data.deliveryId);
      }
      console.log(` [Delivery Updated] Motoboy assigned`);
    };

    // Event 3: Motoboy retirou o pedido (picked)
    const handleDeliveryPicked = (data: any) => {
      console.log(`📨 [Socket] Received event 'delivery:picked':`, data);

      if (data.orderId !== id) {
        console.log(`⏭️ [Socket] Event is for different order, skipping`);
        return;
      }

      if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      } else if (data.deliveryId) {
        refetchDelivery(data.deliveryId);
      }
      console.log(`✅ [Delivery Updated] Order picked up (PIN should be visible now)`);
    };

    // 🎯 Event 4: Entrega foi completada
    const handleDeliveryCompleted = (data: any) => {
      console.log(`📨 [Socket] Received event 'delivery:completed':`, data);

      if (data.deliveryId !== order?.deliveryId) {
        console.log(`⏭️ [Socket] Event is for different delivery, skipping`);
        return;
      }

      setDelivery((prev: any) => ({ ...prev, status: 'delivered' }));
      console.log(`✅ [Delivery Updated] Delivery completed - status set to 'delivered'`);

      if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      }
    };

    // 🎯 Event 5: Status da entrega mudou (via emitDeliveryStatusChanged)
    const handleDeliveryStatusChanged = (data: any) => {
      console.log(`📨 [Socket] Received event 'delivery:status_changed':`, data);

      if (data._id !== order?.deliveryId && data.deliveryId !== order?.deliveryId) {
        console.log(`⏭️ [Socket] Event is for different delivery, skipping`);
        return;
      }

      console.log(`🎯 [Delivery] Updating delivery status to: ${data.status}`);
      setDelivery((prev: any) => ({ ...prev, status: data.status }));

      if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      }
      console.log(`✅ [Delivery Updated] Status changed to ${data.status}`);
    };

    // 🎯 Event 6: Loja rejeitou o pedido
    const handleOrderRejectedByStore = (data: any) => {
      console.log(`📨 [Socket] Received event 'order:rejected_by_store':`, data);

      if (data.orderId !== id) {
        console.log(`⏭️ [Socket] Event is for different order, skipping`);
        return;
      }

      setOrder((prev: any) => ({
        ...prev,
        status: 'rejeitado'
      }));
      console.log(`❌ [Order Updated] Order rejected by store - reason: ${data.reason}`);
    };

    // ✅ FIX #6: Event 7 - Devolução foi confirmada pela loja
    const handleReturnConfirmed = (data: any) => {
      console.log(`✅ [Socket] Received event 'delivery:return_confirmed':`, data);

      if (data.deliveryId !== order?.deliveryId) {
        console.log(`⏭️ [Socket] Event is for different delivery, skipping`);
        return;
      }

      setDelivery((prev: any) => ({
        ...prev,
        statusDevolucao: 'confirmado'
      }));

      if (order?.deliveryId) {
        refetchDelivery(order.deliveryId);
      }
      console.log(`✅ [Delivery Updated] Return confirmed - devolução foi aceita pela loja`);
    };

    // 📡 Register all socket listeners
    const unsubscribe1 = on('order:accepted_by_store', handleOrderAccepted);
    const unsubscribe2 = on('motoboy:assigned', handleMotoboyAssigned);
    const unsubscribe3 = on('delivery:picked', handleDeliveryPicked);
    const unsubscribe4 = on('delivery:completed', handleDeliveryCompleted);
    const unsubscribe5 = on('delivery:status_changed', handleDeliveryStatusChanged);
    const unsubscribe6 = on('order:rejected_by_store', handleOrderRejectedByStore);
    const unsubscribe7 = on('delivery:return_confirmed', handleReturnConfirmed);
    const unsubscribe8 = on('order:cancelled', (data: any) => {
      if (data.orderId !== id) return;
      setOrder((prev: any) => ({ ...prev, status: 'cancelado' }));
    });

    // [Plan1] Lojista confirmou entrega manualmente
    const unsubscribe9 = on('order:delivered', (data: any) => {
      if (data.orderId !== id) return;
      setOrder((prev: any) => ({ ...prev, status: 'entregue' }));
    });

    console.log(`✅ [Socket] All listeners registered`);

    // 🧹 Cleanup function
    return () => {
      console.log(`🧹 [Socket] Cleaning up listeners for order: ${id}`);
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      unsubscribe5();
      unsubscribe6();
      unsubscribe7();
      unsubscribe8();
      unsubscribe9();
    };
  }, [id, order?.deliveryId, on, setOrder, order]);

  // 🔄 FALLBACK: Auto-polling como backup se socket falhar
  useEffect(() => {
    if (!id || !order?.deliveryId) return;

    console.log(`⏰ [Auto-Polling] Starting auto-refresh every 5 seconds`);

    const pollInterval = setInterval(() => {
      refetchDelivery(order.deliveryId);
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      console.log(`⏰ [Auto-Polling] Stopped`);
    };
  }, [id, order?.deliveryId]);

  const getStatusEmoji = () => {
    if (order.status === 'cancelado') return 'x-circle';
    if (order.status === 'rejeitado') return 'x-circle';

    if (!delivery) {
      if (order.status === 'criado' || order.status === 'pago') return 'clock';
      return 'clock';
    }

    if (delivery.status === 'pending') return 'clock';
    if (delivery.status === 'assigned') return 'truck';
    if (delivery.status === 'picked') return 'package';
    if (delivery.status === 'delivered') return 'check-circle';
    if (delivery.status === 'cancelled') return 'x-circle';
    return 'clock';
  };

  const getStatusColor = () => {
    if (order.status === 'cancelado') return '#ef4444';
    if (order.status === 'rejeitado') return '#ef4444';

    if (!delivery) {
      if (order.status === 'criado' || order.status === 'pago') return '#f59e0b';
      return '#f59e0b';
    }

    if (delivery.status === 'pending') return '#ec4899';
    if (delivery.status === 'assigned') return '#3b82f6';
    if (delivery.status === 'picked') return '#8b5cf6';
    if (delivery.status === 'delivered') return '#10b981';
    if (delivery.status === 'cancelled') return '#ef4444';
    return '#f59e0b';
  };

  const getStatusText = () => {
    if (order.status === 'cancelado') {
      return 'Seu pedido foi cancelado. Reembolso será processado em breve.';
    }
    if (order.status === 'rejeitado') {
      return 'Seu pedido foi rejeitado pela loja';
    }

    if (!delivery) {
      if (order.status === 'criado') return 'Aguardando loja confirmar seu pedido...';
      if (order.status === 'pago') {
        // Plano 1: sem taxa de entrega e sem delivery — loja gerencia a entrega
        if (!order.deliveryFee || order.deliveryFee === 0) return 'Pedido confirmado! A loja está preparando e organizando sua entrega.';
        return 'Procurando motoboy...';
      }
      // [Plan1] Loja confirmou a entrega manualmente
      if (order.status === 'entregue' && (!order.deliveryFee || order.deliveryFee === 0)) {
        return 'Pedido entregue! Obrigado pela compra.';
      }
      return 'Processando seu pedido...';
    }

    if (delivery.status === 'pending') return 'Aguardando um motoboy aceitar a entrega...';
    if (delivery.status === 'assigned') return 'Motoboy a caminho para buscar seu pedido na loja!';
    if (delivery.status === 'picked') return 'Motoboy retirou seu pedido! Em trânsito para seu endereço...';
    if (delivery.status === 'delivered') return 'Seu pedido foi entregue!';
    if (delivery.status === 'cancelled') return 'Entrega foi cancelada';
    return 'Processando...';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroAvaliacao('');
    if (!delivery) return;
    if (rating === 0) {
      setErroAvaliacao('Selecione uma nota');
      return;
    }
    try {
      await api.post(`/deliveries/${delivery._id}/avaliar`, { rating, comment });
      setSubmitted(true);
    } catch (err) {
      setErroAvaliacao('Erro ao enviar avaliação');
    }
  };

  const handleConfirmReceived = async () => {
    if (confirmingReceived) return;
    setConfirmingReceived(true);
    setReceivedError(null);
    try {
      await api.post(`/orders/${id}/deliver`);
      setOrder((prev: any) => ({ ...prev, status: 'entregue' }));
    } catch (err: any) {
      setReceivedError(err?.response?.data?.error || 'Erro ao confirmar recebimento. Tente novamente.');
    } finally {
      setConfirmingReceived(false);
    }
  };

  const handleStoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroAvaliacao('');
    if (!order) return;
    if (storeRating === 0) {
      setErroAvaliacao('Selecione uma nota');
      return;
    }
    try {
      await api.post(`/orders/${order._id}/evaluate-store`, { storeRating, storeComment });
      setStoreSubmitted(true);
    } catch (err) {
      setErroAvaliacao('Erro ao enviar avaliação da loja');
    }
  };

  if (!order) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="detail" />
      </div>
    );
  }

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Status do Pedido</h1>
            <p className={styles.pageOrderId}>ID: {order._id}</p>
          </div>

          {/* Status Card */}
          <div className={styles.statusCard} style={{ borderTopColor: getStatusColor() }}>
            <Icon name={getStatusEmoji()} className={styles.statusIcon} />
            <h2 className={styles.statusText} style={{ color: getStatusColor() }}>{getStatusText()}</h2>
            <p className={styles.statusRaw}>Status: {delivery?.status || order.status}</p>
          </div>

          {/* Retomar pagamento PIX (pedido pendente) */}
          {order.paymentMethod === 'pix' &&
            order.paymentStatus !== 'paid' &&
            order.asaasPaymentId &&
            !['cancelado', 'rejeitado'].includes(order.status) && (
              <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B', borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                <p style={{ margin: '0 0 10px', color: '#F59E0B', fontWeight: 600 }}>
                  <Icon name="alert-triangle" size={16} /> Pagamento pendente
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  Seu pedido só é confirmado após o pagamento PIX.
                </p>
                <button
                  onClick={openPix}
                  disabled={loadingPix}
                  style={{ background: '#6C2BD9', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 20px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {loadingPix ? 'Carregando…' : 'Pagar com PIX'}
                </button>
              </div>
            )}

          {/* PIN Display */}
          {delivery && delivery.pin && (delivery.status === 'assigned' || delivery.status === 'picked') && (
            <div className={styles.pinBox}>
              <p className={styles.pinLabel}>PIN de Entrega</p>
              <div className={styles.pinValue}>{delivery.pin}</div>
              <p className={styles.pinHint}>Compartilhe este PIN com o motoboy</p>
            </div>
          )}

          {/* Order Info Grid */}
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <div className={styles.infoCardLabel}>Loja</div>
              <div className={styles.infoCardValue}>{order.storeName || 'Loja'}</div>
              <div className={styles.infoCardSub}>ID: {order.storeId}</div>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoCardLabel}>Itens</div>
              <div className={styles.infoCardValue}>{order.products?.length || 0}</div>
              <div className={styles.infoCardSub}>
                {order.products?.reduce((sum: number, p: any) => sum + (p.quantity || 1), 0) || 0} unidades
              </div>
            </div>

            <div className={styles.infoCard}>
              <div className={styles.infoCardLabel}>Situação</div>
              <div className={styles.orderStatusBadge}>{order.status}</div>
            </div>
          </div>

          {/* CANCELLATION STATUS */}
          {order.status === 'cancelado' && (
            <div className={styles.cancellationBox}>
              <CancellationStatusDisplay orderId={order._id} />
            </div>
          )}

          {/* [PLANO 1] CONFIRMAR RECEBIMENTO */}
          {!delivery && order.status === 'pago' && (!order.deliveryFee || order.deliveryFee === 0) && (
            <div className={styles.confirmReceivedSection}>
              <p className={styles.confirmReceivedHint}>
                Quando receber seu pedido, clique no botão abaixo para finalizar a compra.
              </p>
              {receivedError && <div className={styles.errorAlert}>{receivedError}</div>}
              <button
                onClick={handleConfirmReceived}
                disabled={confirmingReceived}
                className={styles.btnConfirmReceived}
              >
                {confirmingReceived ? 'Confirmando...' : <><Icon name="check-circle" size={14} /> Recebi meu Produto</>}
              </button>
            </div>
          )}

          {/* CANCEL BUTTON */}
          {['criado', 'pago', 'enviado'].includes(order.status) && (
            <div className={styles.cancelSection}>
              <button onClick={() => setShowCancelModal(true)} className={styles.btnCancel}>
                ✕ Cancelar Pedido
              </button>
            </div>
          )}

          {/* Products List */}
          <div className={styles.productsCard}>
            <div className={styles.productsHeader}>
              <h3 className={styles.productsTitle}><Icon name="clipboard" size={16} /> Itens do Pedido</h3>
            </div>
            <div className={styles.productsList}>
              {order.products && order.products.length > 0 ? (
                order.products.map((p: any, idx: number) => (
                  <div key={idx} className={styles.productItem}>
                    <div>
                      <h4 className={styles.productName}>{p.name}</h4>
                      <p className={styles.productQty}>Quantidade: <b>{p.quantity || 1}x</b></p>
                    </div>
                    {p.price && (
                      <div className={styles.productPrice}>
                        R$ {(p.price * (p.quantity || 1)).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className={styles.emptyProducts}>Nenhum item no pedido</p>
              )}
            </div>
          </div>

          {/* Motoboy Rating */}
          {delivery && delivery.status === 'delivered' && !delivery.rating && !submitted && (
            <div className={styles.ratingCard}>
              <h3 className={styles.ratingTitle}><Icon name="star" /> Avalie o Motoboy</h3>
              <form onSubmit={handleSubmit}>
                <div>
                  <label className={styles.ratingLabel}>Qual foi sua experiência?</label>
                  <div className={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className={`${styles.starBtn} ${rating >= star ? styles.starBtnActive : ''}`}
                        style={{ opacity: rating >= star ? 1 : 0.3 }}
                      >
                        <Icon name="star" size={20} />
                      </button>
                    ))}
                  </div>
                  {rating > 0 && <p className={styles.ratingScore}>Nota: {rating}/5</p>}
                </div>

                {erroAvaliacao && (
                  <div className={styles.errorAlert}><Icon name="x-circle" size={14} /> {erroAvaliacao}</div>
                )}

                <div>
                  <label className={styles.ratingLabel}>Comentário (opcional)</label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Compartilhe sua experiência..."
                    rows={3}
                    className={styles.ratingTextarea}
                  />
                </div>

                <button type="submit" className={styles.btnRatingSubmit}>
                  <Icon name="send" size={14} /> Enviar Avaliação
                </button>
              </form>
            </div>
          )}

          {submitted && (
            <div className={styles.successAlert}>
              <Icon name="check-circle" size={14} /> Obrigado! Sua avaliação do motoboy foi registrada!
            </div>
          )}

          {delivery && delivery.status === 'delivered' && delivery.rating && (
            <div className={styles.existingRating}>
              <h4 className={styles.existingRatingTitle}><Icon name="check-circle" size={14} /> Sua Avaliação do Motoboy</h4>
              <div className={styles.existingRatingRow}>
                <span>{Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} style={{ fontSize: 20 }}>{i < delivery.rating ? <Icon name="star" size={20} /> : '☆'}</span>
                ))}</span>
                <span className={styles.existingRatingScore}>{delivery.rating}/5</span>
              </div>
              {delivery.comment && <p className={styles.existingRatingComment}>"{delivery.comment}"</p>}
            </div>
          )}

          {/* [PLANO 1] Store Rating sem motoboy */}
          {!delivery && order.status === 'entregue' && order && !order.storeRating && !storeSubmitted && (
            <div className={`${styles.ratingCard} ${styles.ratingCardStore}`}>
              <h3 className={styles.ratingTitle}><Icon name="star" /> Avalie a Loja</h3>
              <form onSubmit={handleStoreSubmit}>
                <div>
                  <label className={styles.ratingLabel}>Como foi a experiência com a loja?</label>
                  <div className={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setStoreRating(star)}
                        className={`${styles.starBtn} ${storeRating >= star ? styles.starBtnActive : ''}`}
                        style={{ opacity: storeRating >= star ? 1 : 0.3 }}
                      >
                        <Icon name="star" />
                      </button>
                    ))}
                  </div>
                  {storeRating > 0 && <p className={styles.ratingScore}>Nota: {storeRating}/5</p>}
                </div>
                {erroAvaliacao && <div className={styles.errorAlert}><Icon name="x-circle" size={14} /> {erroAvaliacao}</div>}
                <div>
                  <label className={styles.ratingLabel}>Comentário (opcional)</label>
                  <textarea
                    value={storeComment}
                    onChange={e => setStoreComment(e.target.value)}
                    placeholder="Que tal a qualidade e atendimento?"
                    rows={3}
                    className={styles.ratingTextarea}
                  />
                </div>
                <button type="submit" className={styles.btnRatingSubmit}>
                  <Icon name="send" size={14} /> Enviar Avaliação da Loja
                </button>
              </form>
            </div>
          )}

          {/* Store Rating */}
          {delivery && delivery.status === 'delivered' && order && !order.storeRating && !storeSubmitted && (
            <div className={`${styles.ratingCard} ${styles.ratingCardStore}`}>
              <h3 className={styles.ratingTitle}><Icon name="star" /> Avalie a Loja</h3>
              <form onSubmit={handleStoreSubmit}>
                <div>
                  <label className={styles.ratingLabel}>Como foi a experiência com a loja?</label>
                  <div className={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setStoreRating(star)}
                        className={`${styles.starBtn} ${storeRating >= star ? styles.starBtnActive : ''}`}
                        style={{ opacity: storeRating >= star ? 1 : 0.3 }}
                      >
                        <Icon name="star" />
                      </button>
                    ))}
                  </div>
                  {storeRating > 0 && <p className={styles.ratingScore}>Nota: {storeRating}/5</p>}
                </div>

                {erroAvaliacao && (
                  <div className={styles.errorAlert}><Icon name="x-circle" size={14} /> {erroAvaliacao}</div>
                )}

                <div>
                  <label className={styles.ratingLabel}>Comentário (opcional)</label>
                  <textarea
                    value={storeComment}
                    onChange={e => setStoreComment(e.target.value)}
                    placeholder="Que tal a qualidade e atendimento?"
                    rows={3}
                    className={styles.ratingTextarea}
                  />
                </div>

                <button type="submit" className={styles.btnRatingSubmit}>
                  <Icon name="send" size={14} /> Enviar Avaliação da Loja
                </button>
              </form>
            </div>
          )}

          {storeSubmitted && (
            <div className={styles.successAlert}>
              <Icon name="check-circle" size={14} /> Obrigado! Sua avaliação da loja foi registrada!
            </div>
          )}

          {delivery && delivery.status === 'delivered' && order && order.storeRating && (
            <div className={`${styles.existingRating}`} style={{ borderLeftColor: 'var(--drop-purple-2)' }}>
              <h4 className={styles.existingRatingTitle}><Icon name="check-circle" size={14} /> Sua Avaliação da Loja</h4>
              <div className={styles.existingRatingRow}>
                <span>{Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} style={{ fontSize: 20 }}>{i < order.storeRating ? <Icon name="star" size={20} /> : '☆'}</span>
                ))}</span>
                <span className={styles.existingRatingScore} style={{ color: 'var(--drop-purple-2)' }}>{order.storeRating}/5</span>
              </div>
              {order.storeComment && <p className={styles.existingRatingComment}>"{order.storeComment}"</p>}
            </div>
          )}

          {/* CANCEL ORDER MODAL */}
          <CancelOrderModal
            isOpen={showCancelModal}
            onClose={() => setShowCancelModal(false)}
            orderId={order._id}
            orderStatus={order.status}
            onSuccess={() => {
              setShowCancelModal(false);
              router.replace(router.asPath);
            }}
          />

          {/* Retomar pagamento PIX */}
          {pixData && (
            <PixPaymentModal
              pix={pixData}
              onPaid={() => {
                setPixData(null);
                setOrder((prev: any) => ({ ...prev, paymentStatus: 'paid' }));
              }}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
