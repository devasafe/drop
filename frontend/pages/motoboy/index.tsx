import { useContext, useState } from 'react';
import { useRouter } from 'next/router';
import api from '../../lib/api';
import useRequireAuth from '../../hooks/useRequireAuth';
import AuthContext from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import Icon, { IconName } from '../../components/Icon';
import { useDeliveries } from '../../hooks/useSync';
import dash from '../StoreDashboard.module.css';
import styles from './MotoboyIndex.module.css';

const NAV_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/motoboy',              label: 'Entregas',      icon: 'package' },
  { href: '/motoboy/ongoing',      label: 'Em Andamento',  icon: 'truck' },
  { href: '/motoboy/history',      label: 'Histórico',     icon: 'clipboard' },
  { href: '/motoboy/wallet',       label: 'Minha Carteira', icon: 'wallet' },
  { href: '/motoboy/gamification', label: 'Gamificação',   icon: 'star' },
  { href: '/motoboy/ranking',      label: 'Ranking',       icon: 'award' },
  { href: '/motoboy/beneficios',   label: 'Benefícios',    icon: 'gift' },
  { href: '/motoboy/profile',      label: 'Perfil',        icon: 'user' },
];

const ACCOUNT_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/editar-conta', label: 'Editar meus dados', icon: 'settings' },
  { href: '/suporte',      label: 'Suporte',           icon: 'headphones' },
];

export default function MotoboyPage() {
  useRequireAuth(['motoboy']);
  const { token, user } = useContext(AuthContext);
  const router = useRouter();
  const { deliveries, loading, setDeliveries } = useDeliveries();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const go = (href: string) => { setSidebarOpen(false); router.push(href); };

  const claim = async (id: string) => {
    try {
      const res = await api.post(`/deliveries/${id}/claim`);
      window.location.href = `/motoboy/delivery/${res.data._id}`;
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Falha ao reclamar');
    }
  };

  const stats = [
    { label: 'Entregas Disponíveis', value: loading ? '...' : String(deliveries.length), valueClass: styles.statValuePurple, cardClass: styles.statCardPurple },
    { label: 'Ganho Hoje',           value: 'R$ 0',                                      valueClass: styles.statValueGreen,  cardClass: styles.statCardGreen  },
    { label: 'Nível / Reputação',    value: '—',                                          valueClass: styles.statValueOrange, cardClass: styles.statCardOrange },
  ];

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={dash.dashLayout}>

        {/* ═══ SIDEBAR ═══ */}
        <aside className={`${dash.sidebar} ${sidebarOpen ? dash.sidebarOpen : ''}`}>
          <div className={dash.sidebarHeader}>
            <div className={dash.sidebarLogoRow}>
              <div className={dash.sidebarLogoIcon}><Icon name="motorcycle" size={16} /></div>
              <span className={dash.sidebarLogo}>DROP MOTOBOY</span>
            </div>
            <p className={dash.sidebarSubtitle}>Partner Dashboard</p>
          </div>

          {user && (
            <div className={dash.sidebarStoreInfo}>
              <div className={dash.sidebarStoreName}>{user.name}</div>
            </div>
          )}

          <nav className={dash.sidebarNav}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.href}
                onClick={() => go(item.href)}
                className={`${dash.sidebarNavItem} ${router.pathname === item.href ? dash.sidebarNavItemActive : ''}`}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}

            <div className={dash.sidebarNavLabel}>Conta</div>
            {ACCOUNT_ITEMS.map(item => (
              <button key={item.href} onClick={() => go(item.href)} className={dash.sidebarNavItem}>
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className={dash.sidebarActions}>
            <button
              onClick={() => go('/verificacao-motoboy')}
              className={`${dash.btnStoreAction} ${dash.btnStoreActionPrimary}`}
            >
              <Icon name="shield" size={14} /> Verificação
            </button>
            <button
              onClick={() => go('/motoboy/transfer-wallet')}
              className={`${dash.btnStoreAction} ${dash.btnStoreActionWarning}`}
            >
              <Icon name="wallet" size={14} /> Transferir Saldo
            </button>
            <button
              onClick={() => go('/motoboy/request-withdrawal')}
              className={`${dash.btnStoreAction} ${dash.btnStoreActionSuccess}`}
            >
              <Icon name="send" size={14} /> Solicitar Saque
            </button>
          </div>
        </aside>

        {sidebarOpen && <div className={dash.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

        {/* ═══ MAIN CONTENT ═══ */}
        <main className={dash.mainContent}>
          {/* Top Bar */}
          <div className={dash.topBar}>
            <button className={dash.hamburgerBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="menu" size={20} />
            </button>
            <div className={dash.topBarTitle}>
              <h1 className={dash.pageTitle}>Painel do Motoboy</h1>
            </div>
            <div className={dash.topBarActions}>
              <div className={dash.topBarProfile}>
                <div className={dash.profileAvatar}>{user?.name?.charAt(0)?.toUpperCase() || 'M'}</div>
                <span className={dash.profileName}>{user?.name || 'Motoboy'}</span>
              </div>
            </div>
          </div>

          <div className={dash.tabContent}>
            {/* Stats */}
            <div className={styles.statsGrid}>
              {stats.map((stat) => (
                <div key={stat.label} className={`${styles.statCard} ${stat.cardClass}`}>
                  <div className={`${styles.statValue} ${stat.valueClass}`}>{stat.value}</div>
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
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(74,222,128,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <p className={styles.emptyTitle}>Nenhuma entrega disponível</p>
                  <p className={styles.emptyText}>Volte mais tarde para ver novas oportunidades</p>
                </div>
              ) : (
                <div className={styles.deliveriesGrid}>
                  {deliveries.map((d: any, idx: number) => (
                    <div key={d._id} className={styles.deliveryCard} style={{ animationDelay: `${idx * 0.05}s` }}>
                      <div className={styles.cardHeader}>
                        <div className={styles.orderId}>PEDIDO #{d.orderId?.slice(-6) || d._id?.slice(-6)}</div>
                        <div className={styles.deliveryValue}>R$ {((d.fee || 0) * 0.8).toFixed(2)}</div>
                        <div className={styles.feeNote}>Taxa: R$ {(d.fee || 0).toFixed(2)} · você recebe 80%</div>
                      </div>

                      <div className={styles.cardDetails}>
                        <div className={styles.cardDetailRow}>
                          Distância: <strong className={styles.cardDetailValue}>{(d.distance || 0).toFixed(1)} km</strong>
                        </div>
                        <div className={styles.cardDetailRow}>
                          Origem: <strong className={styles.cardDetailValue}>{d.pickupLocation || 'A confirmar'}</strong>
                        </div>
                        {d.destination && (
                          <div className={styles.cardDetailRow}>
                            Destino: <strong className={styles.cardDetailValue}>{d.destination}</strong>
                          </div>
                        )}
                      </div>

                      <div className={styles.cardActions}>
                        <button onClick={() => claim(d._id)} className={styles.btnAccept}>Aceitar</button>
                        <button
                          onClick={() => setDeliveries(deliveries.filter((del: any) => del._id !== d._id))}
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
        </main>
      </div>
    </ProtectedRoute>
  );
}
