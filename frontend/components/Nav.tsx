import Link from 'next/link';
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications, useBadgeCounts } from '../hooks/useSync';
import { useOverlay } from '../contexts/OverlayContext';
import AccountMenuButton from './nav/AccountMenuButton';
import { getNavItems, ROLE_HOME, Role } from '../lib/navConfig';
import Icon from './Icon';
import styles from './Nav.module.css';

// Badge numérico reutilizável (chip roxo). Não renderiza nada se count <= 0.
function CountPill({ count, style }: { count: number; style?: React.CSSProperties }) {
  if (!count || count <= 0) return null;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 18, padding: '0 5px', marginLeft: 6,
        borderRadius: 9, background: '#6C2BD9', color: '#fff',
        fontSize: 11, fontWeight: 700, lineHeight: 1,
        boxShadow: '0 0 8px rgba(108,43,217,0.5)', ...style,
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Nav() {
  const { user, can } = useAuth() || {};
  const overlay = useOverlay();
  const { unreadCount: unread } = useNotifications();
  const badges = useBadgeCounts();

  const activeRole = (user?.activeRole || user?.role || 'cliente') as Role;
  const isAdmin = can ? getNavItems('ceo', can, false).length > 0 : false;
  const isPanel = activeRole === 'lojista' || activeRole === 'motoboy' || isAdmin;
  // A logo leva cada role à SUA Home (lojista/motoboy → painel; cliente → /inicio;
  // admin/ceo e admins delegados → painel admin).
  const homeHref = ROLE_HOME[activeRole] ?? (isAdmin ? ROLE_HOME.ceo : ROLE_HOME.cliente);

  // Total de pendências relevantes p/ o badge do botão de menu do painel.
  const menuTotal =
    (isAdmin ? badges.verifications : 0) +
    (activeRole === 'lojista' ? badges.storeOrders : 0) +
    (activeRole === 'motoboy' ? badges.deliveries : 0);

  return (
    <>
    <header className={styles.header}>
      <nav className={styles.nav}>

        {/* Logo */}
        <Link href={homeHref} className={styles.logo}>
          <img src="/images/logog_png.png" alt="DROP" />
        </Link>

        {/* Right Section */}
        <div className={styles.right}>
          {user ? (
            <>
              {/* Botão de menu do painel (abre a AppSidebar como drawer no mobile) */}
              {isPanel && (
                <button
                  className={styles.hamburger}
                  onClick={() => overlay.toggle('panelSidebar')}
                  aria-label="Abrir menu do painel"
                >
                  <Icon name="menu" size={20} />
                  <CountPill count={menuTotal} />
                </button>
              )}

              {/* Notificações */}
              <Link href="/notifications" className={styles.iconBtn} title="Notificações">
                <Icon name="bell" size={17} />
                {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
              </Link>

              {/* Avatar → AccountMenu (componente reutilizável) */}
              <AccountMenuButton />
            </>
          ) : (
            <>
              <Link href="/login" className={styles.loginLink}>Entrar</Link>
              <Link href="/register" className={styles.registerBtn}>Cadastrar</Link>
            </>
          )}
        </div>
      </nav>

    </header>
    </>
  );
}
