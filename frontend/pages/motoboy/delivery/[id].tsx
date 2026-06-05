import MotoboyRouteMap from '../../../components/MotoboyRouteMap';
import ContactInfo from '../../../components/delivery/ContactInfo';
import * as logger from '../../../lib/logger';

import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import api from '../../../lib/api';
import useRequireAuth from '../../../hooks/useRequireAuth';
import AuthContext from '../../../contexts/AuthContext';
import ProtectedRoute from '../../../components/ProtectedRoute';
import Icon from '../../../components/Icon';
import { useDelivery } from '../../../hooks/useSync';
import { RejectDeliveryModal } from '../../../components/delivery/RejectDeliveryModal';
import { useSocket } from '../../../contexts/SocketContext';
import styles from './MotoboyDelivery.module.css';

export default function MotoboyDeliveryDetail() {
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [cancelledNotification, setCancelledNotification] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  // ✅ NOVO: Monitorar localização em tempo real com alta precisão
  useEffect(() => {
    if (!window.navigator.geolocation) {
      logger.warn('Geolocation não suportado');
      return;
    }

  logger.log('[Localização] Iniciando monitoramento em tempo real...');

    // watchPosition atualiza continuamente a localização
    const watchId = window.navigator.geolocation.watchPosition(
      (pos) => {
        const newLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const accuracy = pos.coords.accuracy; // Precisão em metros

        setCurrentLocation(newLocation);
        setLocationAccuracy(accuracy);

  logger.log('[Localização] Atualizado:', {
          lat: newLocation.lat.toFixed(6),
          lng: newLocation.lng.toFixed(6),
          accuracy: accuracy.toFixed(1) + 'm',
          timestamp: new Date().toLocaleTimeString('pt-BR')
        });
      },
      (err) => {
    logger.error('[Localização] Erro:', err.message, { code: err.code });
        setCurrentLocation(null);
      },
      {
        enableHighAccuracy: true,      // GPS de alta precisão
        timeout: 20000,                // Timeout de 20s (aumentado)
        maximumAge: 0,                 // Sem cache (sempre busca nova)
      }
    );

  logger.log('[Localização] Watch ID:', watchId);

    // Limpar watch ao desmontar
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
  const { token, user } = useContext(AuthContext);
  const { on } = useSocket();

  // ✅ COMENTADO: Conversas agora são gerenciadas pelo ChatWidgetWithTabs global
  // Quando usuario clica em "Abrir Chat", evento openChat é disparado
  // e o widget global cria a conversa automaticamente

  const updateStatus = async (status: string) => {
    try {
      await api.put(`/deliveries/${id}/status`, { status });
      setMsg('Status atualizado!');
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Erro ao atualizar status');
    }
  };

  const [loadingFinalizar, setLoadingFinalizar] = useState(false);
  const finalizarEntrega = async () => {
    setLoadingFinalizar(true);
    try {
      await api.post(`/deliveries/${id}/finalizar`, { pin: pinInput });
      setMsg('Entrega finalizada com sucesso!');
      // Redirecionar para o painel do motoboy após 1 segundo
      setTimeout(() => {
        router.push('/motoboy');
      }, 1000);
    } catch (err: any) {
      setMsg(err?.response?.data?.error || 'Erro ao finalizar entrega');
    }
    setLoadingFinalizar(false);
  };

  // ✅ NOVO: Listener para cancelamento de entrega em tempo real
  useEffect(() => {
    if (!id) return;

    const unsubscribe = on('delivery:cancelled', (data: any) => {
      logger.log('🚨 [Motoboy] Entrega cancelada:', data);
      if (data.deliveryId === id || data.deliveryId === id?.toString()) {
        // Salvar razão e mostrar modal
        setCancellationReason(data.reason || 'Sem motivo informado');
        setCancelledNotification(true);
      }
    });

    return () => unsubscribe();
  }, [id, on]);

  // ✅ FIX #6: Listener para confirmação de devolução
  useEffect(() => {
    if (!id) return;

    const unsubscribe = on('delivery:return_confirmed', (data: any) => {
      logger.log('✅ [Motoboy] Devolução confirmada pela loja:', data);
      if (data.deliveryId === id || data.deliveryId === id?.toString()) {
        setMsg('Devolução foi confirmada pela loja! A entrega foi cancelada com sucesso.');
        // Redirecionar para o painel do motoboy após 3 segundos
        setTimeout(() => {
          router.push('/motoboy');
        }, 3000);
      }
    });

    return () => unsubscribe();
  }, [id, on]);

  if (!delivery) return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingText}>Carregando detalhes da entrega...</div>
    </div>
  );

  const order = delivery.order || {};
  const store = delivery.storeObj || {};
  const customer = delivery.customerObj || {};

  // ✅ NOVO: Usar dados do Delivery (que são cópia do Order)
  // Isso garante que usamos os dados originais do pedido, não a versão atual do cliente
  const pickupAddress = delivery.storeAddress || `${store.name || ''} - ${store.address || ''}`;
  const deliveryAddress = delivery.customerAddress || (
    customer.mainAddress ?
    `${customer.mainAddress.label || ''} - ${customer.mainAddress.street}, ${customer.mainAddress.number}, ${customer.mainAddress.neighborhood}, ${customer.mainAddress.city} - ${customer.mainAddress.state}`
    : '-'
  );

  const storeLat = delivery.storeLatitude !== undefined ? parseFloat(String(delivery.storeLatitude)) : (store.latitude ? parseFloat(String(store.latitude)) : null);
  const storeLng = delivery.storeLongitude !== undefined ? parseFloat(String(delivery.storeLongitude)) : (store.longitude ? parseFloat(String(store.longitude)) : null);
  const customerLat = delivery.customerLatitude !== undefined ? parseFloat(String(delivery.customerLatitude)) : (customer.mainAddress?.latitude ? parseFloat(String(customer.mainAddress.latitude)) : null);
  const customerLng = delivery.customerLongitude !== undefined ? parseFloat(String(delivery.customerLongitude)) : (customer.mainAddress?.longitude ? parseFloat(String(customer.mainAddress.longitude)) : null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return '#fbbf24';
      case 'picked': return '#60a5fa';
      case 'delivered': return '#34d399';
      case 'cancelled': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: any = {
      assigned: 'Aguardando Retirada',
      picked: 'Em Trânsito',
      delivered: '✓ Entregue',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
  };

  const accuracyClass = locationAccuracy
    ? locationAccuracy < 20 ? styles.accuracyGood
    : locationAccuracy < 50 ? styles.accuracyMed
    : styles.accuracyBad
    : styles.accuracyGood;

  const accuracyTextColor = locationAccuracy
    ? locationAccuracy < 20 ? 'var(--drop-success)'
    : locationAccuracy < 50 ? 'var(--drop-warning)'
    : 'var(--drop-danger)'
    : 'var(--drop-success)';

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>
            Detalhes da Entrega
          </h1>
          <div className={styles.orderRef}>
            Pedido: <strong>#{(order._id || delivery.orderId)?.slice(-8) || 'N/A'}</strong>
          </div>
          <div
            className={styles.statusBadge}
            style={{ background: getStatusColor(delivery.status) }}
          >
            {getStatusLabel(delivery.status)}
          </div>
        </div>

        {/* Main Info Grid */}
        <div className={styles.infoGrid}>
          {/* Taxa */}
          <div className={styles.cardNoMargin}>
            <div className={styles.cardMetaLabel}>TAXA DE ENTREGA</div>
            <div className={styles.cardFee}>
              R$ {delivery.fee?.toFixed(2) || order.deliveryFee?.toFixed(2) || '0,00'}
            </div>
          </div>
          {/* Status */}
          <div className={styles.cardNoMargin}>
            <div className={styles.cardMetaLabel}>CÓDIGO DO PEDIDO</div>
            <div className={styles.cardCode}>
              {(order._id || delivery.orderId)?.slice(-8) || 'N/A'}
            </div>
          </div>
          {/* Distância */}
          <div className={styles.cardNoMargin}>
            <div className={styles.cardMetaLabel}>DISTÂNCIA</div>
            <div className={styles.cardDistance}>
              {(delivery.distance || 0).toFixed(1)} km
            </div>
          </div>
        </div>

        {/* Pickup Section */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <Icon name="map-pin" /> Retirada na Loja
          </h2>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Local:</div>
            <div className={styles.infoValue}>{pickupAddress}</div>
          </div>
          <ContactInfo
            name={store.name || 'Loja'}
            email={store.email}
            phone={store.telefone}
            onChatClick={() => {
              // Dispara evento global para abrir o ChatWidget com tabs
              // Para LOJA: usamos store._id (mesmo padrão do stores/[id].tsx)
              const storeId = store._id || delivery.storeId;
              const storeName = store.name || 'Loja';

              const eventDetail = {
                storeId: storeId,
                storeName: storeName,
                role: 'lojista',
                type: 'store' // Identificador para saber que é com loja
              };
              logger.log('🎯 [ContactInfo-Loja] Abrindo chat com loja:', eventDetail);

              if (!storeId) {
                logger.error('❌ [ContactInfo-Loja] Erro: storeId não encontrado!');
                return;
              }

              window.dispatchEvent(new CustomEvent('openChat', {
                detail: eventDetail
              }));
            }}
          />
        </div>

        {/* Delivery Section */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <Icon name="truck" size={16} /> Entrega no Cliente
          </h2>
          <div className={styles.infoRow}>
            <div className={styles.infoLabel}>Local:</div>
            <div className={styles.infoValue}>{deliveryAddress}</div>
          </div>
          <ContactInfo
            name={customer.name || 'Cliente'}
            email={customer.email}
            phone={customer.telefone}
            onChatClick={() => {
              // Dispara evento global para abrir o ChatWidget com tabs
              // Para CLIENTE: usamos customer._id (mesmo padrão de user ids)
              const customerId = customer._id || delivery.customerId;
              const customerName = customer.name || 'Cliente';

              const eventDetail = {
                participantId: customerId,
                participantName: customerName,
                role: 'cliente',
                type: 'customer' // Identificador para saber que é com cliente
              };
              logger.log('🎯 [ContactInfo-Cliente] Abrindo chat com cliente:', eventDetail);

              if (!customerId) {
                logger.error('❌ [ContactInfo-Cliente] Erro: customerId não encontrado!');
                return;
              }

              window.dispatchEvent(new CustomEvent('openChat', {
                detail: eventDetail
              }));
            }}
          />
        </div>

        {/* Map Section */}
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>
            <Icon name="map-pin" size={16} /> Rota de Entrega
          </h2>

          {/* Legenda dos Pontos */}
          <div className={styles.mapLegend}>
            <div className={styles.mapLegendGrid}>
              <div className={styles.mapLegendItem}>
                <div className={styles.mapDot} style={{ background: '#ef4444' }}></div>
                <span><strong>A:</strong> Você agora</span>
              </div>
              <div className={styles.mapLegendItem}>
                <div className={styles.mapDot} style={{ background: '#f59e0b' }}></div>
                <span><strong>B:</strong> Loja</span>
              </div>
              <div className={styles.mapLegendItem}>
                <div className={styles.mapDot} style={{ background: '#10b981' }}></div>
                <span><strong>C:</strong> Cliente</span>
              </div>
            </div>
          </div>

          {/* Indicador de Precisão */}
          {currentLocation && locationAccuracy && (
            <div className={accuracyClass}>
              <div
                className={styles.accuracyTitle}
                style={{ color: accuracyTextColor }}
              >
                <Icon name="map-pin" /> Precisão: {locationAccuracy.toFixed(1)}m
              </div>
              <div
                className={styles.accuracyNote}
                style={{ color: accuracyTextColor }}
              >
                {locationAccuracy < 20 && (<><Icon name="check" /> Excelente precisão</>)}
                {locationAccuracy >= 20 && locationAccuracy < 50 && <><Icon name="alert-triangle" size={14} /> Precisão moderada - procure sair de ambientes fechados</>}
                {locationAccuracy >= 50 && (<><Icon name="x-circle" /> Precisão fraca - abra o aplicativo em local aberto com céu visível</>)}
              </div>
            </div>
          )}

          {/* Mapa com 3 Pontos */}
          {currentLocation && storeLat !== null && storeLng !== null && customerLat !== null && customerLng !== null ? (
            <>
              <MotoboyRouteMap
                pointA={{
                  lat: currentLocation.lat,
                  lng: currentLocation.lng,
                  label: 'Você (A)',
                  color: '#ef4444', // Vermelho
                }}
                pointB={{
                  lat: storeLat,
                  lng: storeLng,
                  label: 'Loja (B)',
                  color: '#f59e0b', // Laranja
                }}
                pointC={{
                  lat: customerLat,
                  lng: customerLng,
                  label: 'Cliente (C)',
                  color: '#10b981', // Verde
                }}
                height={400}
              />
              <div className={styles.routeHint}>
                <div>
                  <strong><Icon name="map-pin" size={14} /> Rota:</strong> Você (A) → Loja (B) → Cliente (C)
                </div>
                {delivery.status === 'assigned' && (
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>
                    Dirija-se à <strong>Loja (B)</strong> primeiro para retirar o item
                  </div>
                )}
                {delivery.status === 'picked' && (
                  <div style={{ fontSize: '12px', marginTop: '6px' }}>
                    Dirija-se ao <strong>Cliente (C)</strong> para entregar o item
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={styles.mapEmpty}>
              {!currentLocation && 'Não foi possível obter sua localização atual (A).'}
              {currentLocation && (storeLat === null || storeLng === null) && 'Não foi possível obter coordenadas da loja (B).'}
              {currentLocation && storeLat !== null && storeLng !== null && (customerLat === null || customerLng === null) && 'Não foi possível obter coordenadas do cliente (C).'}
            </div>
          )}
        </div>

        {/* PIN Section */}
        {delivery.status === 'assigned' && (
          <div className={styles.pinSection}>
            <h2 className={styles.pinTitle}>
              <Icon name="lock" size={16} /> Retirar Produto na Loja
            </h2>
            <div className={styles.pinNote}>
              Informe este PIN à loja para autorizar a retirada do produto:
            </div>
            <div className={styles.pinDisplay}>
              {delivery.pinRetirada}
            </div>
            <div className={styles.pinSubNote}>
              Este PIN é obrigatório para retirada
            </div>
          </div>
        )}

        {/* Finalization Section */}
        {delivery.status === 'picked' && (
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>
              ✓ Finalizar Entrega
            </h2>
            <div className={styles.finalizationNote}>
              Informe o PIN fornecido pelo cliente para finalizar a entrega:
            </div>
            <input
              type="text"
              value={pinInput}
              onChange={e => setPinInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="Digite o PIN do cliente"
              className={styles.pinInput}
            />
            <button
              onClick={finalizarEntrega}
              disabled={loadingFinalizar}
              className={styles.btnFinalize}
              style={{ opacity: loadingFinalizar ? 0.7 : 1, cursor: loadingFinalizar ? 'not-allowed' : 'pointer' }}
            >
              {loadingFinalizar ? 'Finalizando...' : '✓ Finalizar Entrega'}
            </button>
          </div>
        )}

        {/* REJECTION SECTION */}
        {['assigned', 'picked'].includes(delivery.status) && (
          <div className={styles.card}>
            <h2 className={styles.sectionTitleDanger}>
              <Icon name="alert-triangle" size={16} /> Rejeitar Entrega
            </h2>
            <div className={styles.rejectionNote}>
              Se você não conseguir fazer esta entrega, pode rejeitá-la e ela será reatribuída ou cancelada.
            </div>
            <button
              onClick={() => setShowRejectModal(true)}
              className={styles.btnReject}
            >
              ✕ Rejeitar Entrega
            </button>
          </div>
        )}

        {/* Rating Section */}
        {delivery.status === 'delivered' && delivery.rating && (
          <div className={styles.ratingCard}>
            <h3 className={styles.ratingTitle}>
              <Icon name="star" /> Avaliação do Cliente
            </h3>
            <div className={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map(star => (
                <span key={star}>{delivery.rating >= star ? '★' : '☆'}</span>
              ))}
            </div>
            {delivery.comment && (
              <div className={styles.ratingComment}>
                "{delivery.comment}"
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {msg && (
          <div className={styles.msgSuccess}>
            {msg}
          </div>
        )}

        {/* ✅ NOVO: CANCELLATION MODAL */}
        {cancelledNotification && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalBox}>
              {/* Icon */}
              <span className={styles.modalIcon}>
                <Icon name="x-circle" />
              </span>

              {/* Title */}
              <h2 className={styles.modalTitle}>
                Entrega Cancelada
              </h2>

              {/* Reason */}
              <p className={styles.modalText}>
                Motivo: <strong>{cancellationReason}</strong>
              </p>

              {/* Button */}
              <button
                onClick={() => {
                  setCancelledNotification(false);
                  router.push('/motoboy');
                }}
                className={styles.btnModalDanger}
              >
                Voltar ao Painel
              </button>
            </div>
          </div>
        )}

        {/* REJECT DELIVERY MODAL */}
        <RejectDeliveryModal
          isOpen={showRejectModal}
          onClose={() => setShowRejectModal(false)}
          deliveryId={delivery._id}
          deliveryStatus={delivery.status}
          onSuccess={() => {
            setShowRejectModal(false);
            router.replace(router.asPath);
          }}
        />
      </div>
    </ProtectedRoute>
  );
}
