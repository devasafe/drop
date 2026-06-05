import { useEffect, useState, useContext, useCallback } from 'react';
import api, { setAuthToken } from '../../lib/api';
import Link from 'next/link';
import useRequireAuth from '../../hooks/useRequireAuth';
import AuthContext from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useOngoingDeliveries } from '../../hooks/useSync';
import { useAutoRefetch } from '../../hooks/useAutoRefetch';
import styles from './MotoboyOngoing.module.css';

export default function MotoboyOngoing() {
  useRequireAuth(['motoboy']);
  const { token } = useContext(AuthContext);
  const { deliveries, loading, refetch } = useOngoingDeliveries();

  // 🔄 Auto-refetch quando socket events chegam (incluindo cancelamento)
  useAutoRefetch(
    ['delivery:assigned_to_you', 'delivery:updated', 'delivery:picked', 'delivery:completed', 'delivery:cancelled', 'delivery:return_confirmed'],
    refetch
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned':   return '#fbbf24';
      case 'picked':     return '#60a5fa';
      case 'delivering': return '#8B5CF6';
      default:           return '#9ca3af';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: any = {
      assigned:   (<><Icon name="target" /> Aguardando Retirada</>),
      picked:     (<><Icon name="truck" /> Em Trânsito</>),
      delivering: (<><Icon name="map-pin" /> Próximo da Entrega</>),
    };
    return labels[status] || status;
  };

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.pageTitle}><Icon name="truck" /> Entregas em Andamento</h1>
          <p className={styles.pageSubtitle}>Acompanhe suas entregas ativas</p>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className={styles.loadingScreen}>
            <LoadingSkeleton variant="list" count={3} />
          </div>
        ) : deliveries.length === 0 ? (
          /* Empty State */
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Icon name="shopping-bag" /></div>
            <h2 className={styles.emptyTitle}>Nenhuma Entrega em Andamento</h2>
            <p className={styles.emptyText}>
              Você não tem entregas ativas no momento. Volte ao painel principal para aceitar novas entregas.
            </p>
            <Link href="/motoboy" className={styles.btnBackToDash}>
              ← Voltar ao Painel
            </Link>
          </div>
        ) : (
          /* Deliveries Grid */
          <div className={styles.deliveriesGrid}>
            {deliveries.map((d) => (
              <div
                key={d._id}
                className={styles.deliveryCard}
                onMouseEnter={(e) =>
                  Object.assign(e.currentTarget.style, {
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  })
                }
                onMouseLeave={(e) =>
                  Object.assign(e.currentTarget.style, {
                    transform: 'none',
                    boxShadow: 'none',
                  })
                }
              >
                {/* Status Badge */}
                <div className={styles.statusBadgeRow}>
                  <span
                    className={styles.statusBadge}
                    style={{ background: getStatusColor(d.status) }}
                  >
                    {getStatusLabel(d.status)}
                  </span>
                </div>

                {/* Order Info */}
                <div className={styles.orderInfo}>
                  <div className={styles.orderLabel}>PEDIDO</div>
                  <div className={styles.orderId}>
                    #{(d.orderId || d._id)?.slice(-8) || 'N/A'}
                  </div>
                </div>

                {/* Details Grid */}
                <div className={styles.detailsBox}>
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailLabel}>Taxa</div>
                      <div className={styles.detailValueFee}>
                        R$ {(d.fee || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Distância</div>
                      <div className={styles.detailValueDist}>
                        {(d.distance || 0).toFixed(1)} km
                      </div>
                    </div>
                  </div>
                </div>

                {/* Locations */}
                <div className={styles.locationsBox}>
                  <div className={styles.locationItem}>
                    <div className={styles.locationLabel}><Icon name="store" size={14} /> Retirada</div>
                    <div className={styles.locationValue}>
                      {d.pickupLocation || 'A confirmar'}
                    </div>
                  </div>
                  {d.destination && (
                    <div className={styles.locationItem}>
                      <div className={styles.locationLabel}><Icon name="map-pin" size={14} /> Entrega</div>
                      <div className={styles.locationValue}>{d.destination}</div>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <Link href={`/motoboy/delivery/${d._id}`} className={styles.btnDetails}>
                  Ver Detalhes →
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && deliveries.length > 0 && (
          <div className={styles.summaryBar}>
            <div className={styles.summaryText}>
              <Icon name="chart-bar" size={16} /> Você tem {deliveries.length}{' '}
              {deliveries.length === 1 ? 'entrega' : 'entregas'} em andamento
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
