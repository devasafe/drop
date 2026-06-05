import { useEffect, useState } from 'react';
import api from '../../lib/api';
import Link from 'next/link';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useDeliveryHistory } from '../../hooks/useSync';
import styles from './MotoboyHistory.module.css';

export default function MotoboyHistory() {
  useRequireAuth(['motoboy']);
  const { deliveries, loading } = useDeliveryHistory();
  const [filter, setFilter] = useState('all');

  const filteredDeliveries = deliveries.filter((d) => {
    if (filter === 'all') return true;
    return d.status === filter;
  });

  const totalDeliveries = deliveries.length;
  const totalEarnings = deliveries.reduce((sum, d) => sum + (d.fee || 0), 0);
  const avgRating =
    deliveries.length > 0
      ? (
          deliveries.reduce((sum, d) => sum + (d.rating || 0), 0) /
          deliveries.filter((d) => d.rating).length
        ).toFixed(1)
      : 'N/A';

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>Histórico de Entregas <Icon name="clipboard" size={20} /></h1>
          <p className={styles.pageSubtitle}>
            Acompanhe todas as suas entregas concluídas
          </p>
        </div>

        {/* Stats Grid */}
        {!loading && deliveries.length > 0 && (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={`${styles.statValue} ${styles.statValuePurple}`}>
                {totalDeliveries}
              </div>
              <div className={styles.statLabel}>Total de Entregas</div>
            </div>
            <div className={styles.statCard}>
              <div className={`${styles.statValue} ${styles.statValueGreen}`}>
                R$ {totalEarnings.toFixed(2)}
              </div>
              <div className={styles.statLabel}>Ganhos Totais</div>
            </div>
            <div className={styles.statCard}>
              <div className={`${styles.statValue} ${styles.statValueYellow}`}>
                {avgRating}
              </div>
              <div className={styles.statLabel}>Avaliação Média</div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className={styles.loadingScreen}>
            <LoadingSkeleton variant="list" count={5} />
          </div>
        ) : deliveries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Icon name="mail" size={40} /></div>
            <h2 className={styles.emptyTitle}>Nenhuma Entrega no Histórico</h2>
            <p className={styles.emptyText}>
              Você ainda não finalizou nenhuma entrega. Volte ao painel para aceitar entregas!
            </p>
            <Link href="/motoboy" className={styles.btnBackToDash}>
              ← Voltar ao Painel
            </Link>
          </div>
        ) : (
          <>
            {/* Filter Buttons */}
            <div className={styles.filterBar}>
              <button
                className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : styles.filterBtnInactive}`}
                onClick={() => setFilter('all')}
              >
                Todas ({deliveries.length})
              </button>
              <button
                className={`${styles.filterBtn} ${filter === 'delivered' ? styles.filterBtnActive : styles.filterBtnInactive}`}
                onClick={() => setFilter('delivered')}
              >
                Entregues ({deliveries.filter((d) => d.status === 'delivered').length})
              </button>
              <button
                className={`${styles.filterBtn} ${filter === 'cancelled' ? styles.filterBtnActive : styles.filterBtnInactive}`}
                onClick={() => setFilter('cancelled')}
              >
                Canceladas ({deliveries.filter((d) => d.status === 'cancelled').length})
              </button>
            </div>

            {/* Deliveries List */}
            <div className={styles.deliveriesList}>
              {filteredDeliveries.length === 0 ? (
                <div className={styles.emptyFilter}>
                  Nenhuma entrega com o filtro selecionado
                </div>
              ) : (
                filteredDeliveries.map((d) => (
                  <div
                    key={d._id}
                    className={styles.deliveryCard}
                    onMouseEnter={(e) =>
                      Object.assign(e.currentTarget.style, {
                        transform: 'translateY(-2px)',
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
                    <div className={styles.cardTopRow}>
                      <div className={styles.cardField}>
                        <div className={styles.fieldLabel}>PEDIDO</div>
                        <div className={styles.fieldOrderId}>
                          #{(d.orderId || d._id)?.slice(-8) || 'N/A'}
                        </div>
                      </div>
                      <div className={styles.cardField}>
                        <div className={styles.fieldLabel}>TAXA</div>
                        <div className={styles.fieldFee}>
                          R$ {(d.fee || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className={styles.cardField}>
                        <div className={styles.fieldLabel}>DATA</div>
                        <div className={styles.fieldDate}>
                          {new Date(d.updatedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>

                    <div className={styles.cardMidRow}>
                      <div className={styles.cardField}>
                        <div className={styles.fieldLabel}>STATUS</div>
                        <div
                          className={
                            d.status === 'delivered'
                              ? styles.badgeDelivered
                              : styles.badgeCancelled
                          }
                        >
                          {d.status === 'delivered' ? '✓ Entregue' : '✕ Cancelada'}
                        </div>
                      </div>
                      {d.rating && (
                        <div className={styles.cardField}>
                          <div className={styles.fieldLabel}>AVALIAÇÃO</div>
                          <div className={styles.ratingStars}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span key={star}>
                                {d.rating >= star ? '★' : '☆'}
                              </span>
                            ))}
                            <span className={styles.ratingCount}>({d.rating})</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardActions}>
                      <Link
                        href={`/motoboy/delivery/${d._id}`}
                        className={styles.btnDetails}
                      >
                        Ver Detalhes →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </ProtectedRoute>
  );
}
