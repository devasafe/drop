import MotoboyRouteMap from '../../../components/MotoboyRouteMap';
import ContactInfo from '../../../components/delivery/ContactInfo';
import * as logger from '../../../lib/logger';

import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import useRequireAuth from '../../../hooks/useRequireAuth';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Icon from '../../../components/Icon';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatBRL } from '../../../components/ui/PriceTag';
import { useDelivery } from '../../../hooks/useSync';
import { RejectDeliveryModal } from '../../../components/delivery/RejectDeliveryModal';
import { useSocket } from '../../../contexts/SocketContext';
import styles from './MotoboyDelivery.module.css';

const STATUS_VIEW: Record<string, { label: string; cls: string }> = {
  assigned: { label: 'Aguardando retirada', cls: 'stWaiting' },
  picked: { label: 'Em trânsito', cls: 'stTransit' },
  delivered: { label: 'Entregue', cls: 'stDone' },
  cancelled: { label: 'Cancelada', cls: 'stCancel' },
};

export default function MotoboyDeliveryDetail() {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [cancelledNotification, setCancelledNotification] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // Monitorar localização em tempo real com alta precisão
  useEffect(() => {
    if (!window.navigator.geolocation) {
      logger.warn('Geolocation não suportado');
      return;
    }

    logger.log('[Localização] Iniciando monitoramento em tempo real...');

    const watchId = window.navigator.geolocation.watchPosition(
      (pos) => {
        const newLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = pos.coords.accuracy;

        setCurrentLocation(newLocation);
        setLocationAccuracy(accuracy);

        logger.log('[Localização] Atualizado:', {
          lat: newLocation.lat.toFixed(6),
          lng: newLocation.lng.toFixed(6),
          accuracy: accuracy.toFixed(1) + 'm',
          timestamp: new Date().toLocaleTimeString('pt-BR'),
        });
      },
      (err) => {
        logger.error('[Localização] Erro:', err.message, { code: err.code });
        setCurrentLocation(null);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );

    logger.log('[Localização] Watch ID:', watchId);

    return () => {
      logger.log('[Localização] Parando monitoramento');
      window.navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useRequireAuth(['motoboy']);
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { delivery, loading } = useDelivery(id);
  const [msg, setMsg] = useState('');
  const [pinInput, setPinInput] = useState('');
  const { on } = useSocket();

  const [loadingFinalizar, setLoadingFinalizar] = useState(false);
  const finalizarEntrega = async () => {
    setLoadingFinalizar(true);
    try {
      await api.post(`/deliveries/${id}/finalizar`, { pin: pinInput });
      setMsg('Entrega finalizada com sucesso!');
      setTimeout(() => {
        router.push('/motoboy');
      }, 1000);
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Erro ao finalizar entrega');
    }
    setLoadingFinalizar(false);
  };

  // Listener para cancelamento de entrega em tempo real
  useEffect(() => {
    if (!id) return;
    const unsubscribe = on('delivery:cancelled', (data: any) => {
      logger.log('🚨 [Motoboy] Entrega cancelada:', data);
      if (data.deliveryId === id || data.deliveryId === id?.toString()) {
        setCancellationReason(data.reason || 'Sem motivo informado');
        setCancelledNotification(true);
      }
    });
    return () => unsubscribe();
  }, [id, on]);

  // Listener para confirmação de devolução
  useEffect(() => {
    if (!id) return;
    const unsubscribe = on('delivery:return_confirmed', (data: any) => {
      logger.log('✅ [Motoboy] Devolução confirmada pela loja:', data);
      if (data.deliveryId === id || data.deliveryId === id?.toString()) {
        setMsg('Devolução foi confirmada pela loja! A entrega foi cancelada com sucesso.');
        setTimeout(() => {
          router.push('/motoboy');
        }, 3000);
      }
    });
    return () => unsubscribe();
  }, [id, on]);

  if (!delivery) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Skeleton height={120} radius="var(--r-lg)" />
          <Skeleton height={200} radius="var(--r-lg)" />
          <Skeleton height={160} radius="var(--r-lg)" />
        </div>
      </div>
    );
  }

  const order = delivery.order || {};
  const store = delivery.storeObj || {};
  const customer = delivery.customerObj || {};

  const pickupAddress = delivery.storeAddress || `${store.name || ''} - ${store.address || ''}`;
  const deliveryAddress = delivery.customerAddress || (
    customer.mainAddress
      ? `${customer.mainAddress.label || ''} - ${customer.mainAddress.street}, ${customer.mainAddress.number}, ${customer.mainAddress.neighborhood}, ${customer.mainAddress.city} - ${customer.mainAddress.state}`
      : '-'
  );

  const storeLat = delivery.storeLatitude !== undefined ? parseFloat(String(delivery.storeLatitude)) : (store.latitude ? parseFloat(String(store.latitude)) : null);
  const storeLng = delivery.storeLongitude !== undefined ? parseFloat(String(delivery.storeLongitude)) : (store.longitude ? parseFloat(String(store.longitude)) : null);
  const customerLat = delivery.customerLatitude !== undefined ? parseFloat(String(delivery.customerLatitude)) : (customer.mainAddress?.latitude ? parseFloat(String(customer.mainAddress.latitude)) : null);
  const customerLng = delivery.customerLongitude !== undefined ? parseFloat(String(delivery.customerLongitude)) : (customer.mainAddress?.longitude ? parseFloat(String(customer.mainAddress.longitude)) : null);

  const st = STATUS_VIEW[delivery.status] || { label: delivery.status, cls: 'stTransit' };
  const code = (order._id || delivery.orderId)?.slice(-8) || 'N/A';

  const fmtDateTime = (d?: string) =>
    d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  const orderDate = fmtDateTime(order.createdAt || delivery.createdAt);
  const statusDateLabel = delivery.status === 'delivered' ? 'Entregue em' : delivery.status === 'cancelled' ? 'Cancelada em' : 'Atualizada em';
  const statusDate = fmtDateTime(delivery.cancelledAt || delivery.updatedAt);

  const accuracyClass = locationAccuracy
    ? locationAccuracy < 20 ? styles.accGood : locationAccuracy < 50 ? styles.accMed : styles.accBad
    : styles.accGood;

  const openChatWith = (kind: 'store' | 'customer') => {
    if (kind === 'store') {
      const storeId = store._id || delivery.storeId;
      if (!storeId) { logger.error('❌ storeId não encontrado'); return; }
      window.dispatchEvent(new CustomEvent('openChat', {
        detail: { storeId, storeName: store.name || 'Loja', role: 'lojista', type: 'store' },
      }));
    } else {
      const customerId = customer._id || delivery.customerId;
      if (!customerId) { logger.error('❌ customerId não encontrado'); return; }
      window.dispatchEvent(new CustomEvent('openChat', {
        detail: { participantId: customerId, participantName: customer.name || 'Cliente', role: 'cliente', type: 'customer' },
      }));
    }
  };

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header */}
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Detalhes da entrega</h1>
              <div className={styles.ref}>Pedido #{code}</div>
            </div>
            <span className={`${styles.pill} ${styles[st.cls]}`}>{st.label}</span>
          </header>

          {/* KPIs */}
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <div className={styles.kpiValue}>{formatBRL(delivery.fee || order.deliveryFee || 0)}</div>
              <div className={styles.kpiLabel}>Taxa</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiValue}>{(delivery.distance || 0).toFixed(1)} km</div>
              <div className={styles.kpiLabel}>Distância</div>
            </div>
            <div className={styles.kpi}>
              <div className={styles.kpiValue}>{formatBRL((delivery.fee || 0) * 0.8)}</div>
              <div className={styles.kpiLabel}>Você recebe</div>
            </div>
          </div>

          {/* Datas (info que não repete nos KPIs/seções) */}
          {(orderDate || statusDate) && (
            <div className={styles.dates}>
              {orderDate && <span>Feito em {orderDate}</span>}
              {statusDate && <span>{statusDateLabel} {statusDate}</span>}
            </div>
          )}

          {/* Retirada na loja */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Icon name="map-pin" size={16} /> Retirada na loja</h2>
            <div className={styles.addr}>{pickupAddress}</div>
            <ContactInfo name={store.name || 'Loja'} email={store.email} phone={store.telefone} onChatClick={() => openChatWith('store')} />
          </section>

          {/* Entrega no cliente */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Icon name="truck" size={16} /> Entrega no cliente</h2>
            <div className={styles.addr}>{deliveryAddress}</div>
            <ContactInfo name={customer.name || 'Cliente'} email={customer.email} phone={customer.telefone} onChatClick={() => openChatWith('customer')} />
          </section>

          {/* Rota — só faz sentido em entrega ativa */}
          {['assigned', 'picked'].includes(delivery.status) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}><Icon name="map-pin" size={16} /> Rota de entrega</h2>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={`${styles.dot} ${styles.dotA}`} /> Você</span>
              <span className={styles.legendItem}><span className={`${styles.dot} ${styles.dotB}`} /> Loja</span>
              <span className={styles.legendItem}><span className={`${styles.dot} ${styles.dotC}`} /> Cliente</span>
            </div>

            {currentLocation && locationAccuracy && (
              <div className={`${styles.accuracy} ${accuracyClass}`}>
                <Icon name="map-pin" size={14} /> Precisão: {locationAccuracy.toFixed(1)}m
                {locationAccuracy >= 50 && ' — abra em local aberto para melhorar o GPS'}
              </div>
            )}

            {currentLocation && storeLat !== null && storeLng !== null && customerLat !== null && customerLng !== null ? (
              <>
                <MotoboyRouteMap
                  pointA={{ lat: currentLocation.lat, lng: currentLocation.lng, label: 'Você (A)', color: '#ff5a5f' }}
                  pointB={{ lat: storeLat, lng: storeLng, label: 'Loja (B)', color: '#ffb020' }}
                  pointC={{ lat: customerLat, lng: customerLng, label: 'Cliente (C)', color: '#3ddc84' }}
                  height={360}
                />
                <div className={styles.routeHint}>
                  {delivery.status === 'assigned' && 'Vá até a Loja (B) para retirar o pedido.'}
                  {delivery.status === 'picked' && 'Vá até o Cliente (C) para entregar o pedido.'}
                </div>
              </>
            ) : (
              <div className={styles.mapEmpty}>
                {!currentLocation && 'Não foi possível obter sua localização (A).'}
                {currentLocation && (storeLat === null || storeLng === null) && 'Sem coordenadas da loja (B).'}
                {currentLocation && storeLat !== null && storeLng !== null && (customerLat === null || customerLng === null) && 'Sem coordenadas do cliente (C).'}
              </div>
            )}
          </section>
          )}

          {/* PIN de retirada */}
          {delivery.status === 'assigned' && (
            <div className={styles.pinCard}>
              <h2 className={styles.sectionTitle}><Icon name="lock" size={16} /> Retirar na loja</h2>
              <p className={styles.hint}>Informe este PIN à loja para autorizar a retirada:</p>
              <div className={styles.pinDisplay}>{delivery.pinRetirada}</div>
            </div>
          )}

          {/* Finalizar entrega */}
          {delivery.status === 'picked' && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><Icon name="check" size={16} /> Finalizar entrega</h2>
              <p className={styles.hint}>⚠️ Peça o código de 6 dígitos ao cliente e digite aqui. Só entregue o produto depois de finalizar.</p>
              <Input
                value={pinInput}
                onChange={(v) => setPinInput(String(v).toUpperCase())}
                maxLength={6}
                placeholder="PIN do cliente"
              />
              <Button onClick={finalizarEntrega} disabled={loadingFinalizar || pinInput.trim().length < 5}>
                {loadingFinalizar ? 'Finalizando…' : 'Finalizar entrega'}
              </Button>
            </section>
          )}

          {/* Rejeitar */}
          {['assigned', 'picked'].includes(delivery.status) && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><Icon name="alert-triangle" size={16} /> Rejeitar entrega</h2>
              <p className={styles.hint}>Se não conseguir fazer esta entrega, pode rejeitá-la — ela será reatribuída ou cancelada.</p>
              <Button variant="ghost" onClick={() => setShowRejectModal(true)}>Rejeitar entrega</Button>
            </section>
          )}

          {/* Avaliação */}
          {delivery.status === 'delivered' && delivery.rating && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><Icon name="star" size={16} /> Avaliação do cliente</h2>
              <div className={styles.stars} aria-label={`Avaliação ${delivery.rating} de 5`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= delivery.rating ? styles.on : styles.off} aria-hidden="true">★</span>
                ))}
              </div>
              {delivery.comment && <p className={styles.comment}>“{delivery.comment}”</p>}
            </section>
          )}

          {msg && <div className={styles.msg}>{msg}</div>}
        </div>

        {/* Modal de cancelamento */}
        {cancelledNotification && (
          <div className={styles.overlay}>
            <div className={styles.modal}>
              <span className={styles.modalIcon}><Icon name="x-circle" size={32} /></span>
              <h2 className={styles.modalTitle}>Entrega cancelada</h2>
              <p className={styles.modalText}>Motivo: <strong>{cancellationReason}</strong></p>
              <Button onClick={() => { setCancelledNotification(false); router.push('/motoboy'); }}>Voltar ao painel</Button>
            </div>
          </div>
        )}

        <RejectDeliveryModal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          deliveryId={delivery._id}
          deliveryStatus={delivery.status}
          onSuccess={() => { setShowRejectModal(false); router.replace(router.asPath); }}
        />
      </div>
    </ProtectedRoute>
  );
}
