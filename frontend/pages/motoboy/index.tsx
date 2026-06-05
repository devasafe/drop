import { useContext } from 'react';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import Link from 'next/link';
import AuthContext from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useDeliveries } from '../../hooks/useSync';
import styles from './MotoboyIndex.module.css';

export default function MotoboyPage() {
  useRequireAuth(['motoboy']);
  const { token } = useContext(AuthContext);
  const { deliveries, loading, setDeliveries } = useDeliveries();

  const claim = async (id: string) => {
    try {
      const res = await api.post(`/deliveries/${id}/claim`);
      window.location.href = `/motoboy/delivery/${res.data._id}`;
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Falha ao reclamar');
    }
  };

  const navLinks = [
    { href: '/motoboy/ongoing',      label: 'Em Andamento' },
    { href: '/motoboy/history',      label: 'Histórico' },
    { href: '/motoboy/gamification', label: 'Gamificação' },
    { href: '/motoboy/ranking',      label: 'Ranking' },
    { href: '/motoboy/beneficios',    label: 'Benefícios' },
    { href: '/motoboy/profile',      label: 'Perfil' },
  ];

  const stats = [
    { label: 'Entregas Disponíveis', value: loading ? '...' : String(deliveries.length), valueClass: styles.statValuePurple, cardClass: styles.statCardPurple },
    { label: 'Ganho Hoje',           value: 'R$ 0',                                      valueClass: styles.statValueGreen,  cardClass: styles.statCardGreen  },
    { label: 'Nível / Reputação',    value: '—',                                          valueClass: styles.statValueOrange, cardClass: styles.statCardOrange },
  ];

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.pageTitle}>Painel do Motoboy</h1>
            <p className={styles.pageSubtitle}>
              Gerencie suas entregas, acompanhe ganhos e suba no ranking
            </p>
          </div>

          {/* Nav */}
          <nav className={styles.nav}>
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className={styles.navLink}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Stats */}
          <div className={styles.statsGrid}>
            {stats.map((stat) => (
              <div key={stat.label} className={`${styles.statCard} ${stat.cardClass}`}>
                <div className={`${styles.statValue} ${stat.valueClass}`}>
                  {stat.value}
                </div>
                <div className={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Deliveries */}
          <div className={styles.deliveriesSection}>
            <h2 className={styles.sectionTitle}>Entregas Disponíveis</h2>

            {loading ? (
              <LoadingSkeleton variant="list" count={4} />
            ) : deliveries.length === 0 ? (
              <div className={styles.emptyState}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(74,222,128,0.4)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.emptyIcon}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className={styles.emptyTitle}>Nenhuma entrega disponível</p>
                <p className={styles.emptyText}>
                  Volte mais tarde para ver novas oportunidades
                </p>
              </div>
            ) : (
              <div className={styles.deliveriesGrid}>
                {deliveries.map((d: any, idx: number) => (
                  <div
                    key={d._id}
                    className={styles.deliveryCard}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className={styles.cardHeader}>
                      <div className={styles.orderId}>
                        PEDIDO #{d.orderId?.slice(-6) || d._id?.slice(-6)}
                      </div>
                      <div className={styles.deliveryValue}>
                        R$ {((d.fee || 0) * 0.8).toFixed(2)}
                      </div>
                      <div className={styles.feeNote}>
                        Taxa: R$ {(d.fee || 0).toFixed(2)} · você recebe 80%
                      </div>
                    </div>

                    <div className={styles.cardDetails}>
                      <div className={styles.cardDetailRow}>
                        Distância:{' '}
                        <strong className={styles.cardDetailValue}>
                          {(d.distance || 0).toFixed(1)} km
                        </strong>
                      </div>
                      <div className={styles.cardDetailRow}>
                        Origem:{' '}
                        <strong className={styles.cardDetailValue}>
                          {d.pickupLocation || 'A confirmar'}
                        </strong>
                      </div>
                      {d.destination && (
                        <div className={styles.cardDetailRow}>
                          Destino:{' '}
                          <strong className={styles.cardDetailValue}>
                            {d.destination}
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        onClick={() => claim(d._id)}
                        className={styles.btnAccept}
                      >
                        Aceitar
                      </button>
                      <button
                        onClick={() =>
                          setDeliveries(
                            deliveries.filter((del: any) => del._id !== d._id)
                          )
                        }
                        className={styles.btnReject}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
