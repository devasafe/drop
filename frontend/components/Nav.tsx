import Link from 'next/link';
import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications, useBadgeCounts } from '../hooks/useSync';
import { useOverlay } from '../contexts/OverlayContext';
import AccountMenu from './nav/AccountMenu';
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
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Fecha o popover do avatar ao clicar fora.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) overlay.close('account');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overlay]);

  // Esc fecha overlays no desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') overlay.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  const accountOpen = overlay.isOpen('account');

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

              {/* Avatar → AccountMenu */}
              <div className={styles.menuWrap} ref={menuRef}>
                <button
                  className={`${styles.trigger} ${accountOpen ? styles.triggerOpen : ''}`}
                  onClick={() => overlay.toggle('account')}
                  aria-label="Abrir menu da conta"
                  aria-expanded={accountOpen}
                >
                  <span className={styles.avatar}>{user.name.charAt(0).toUpperCase()}</span>
                  <span className={styles.triggerName}>{user.name.split(' ')[0]}</span>
                  <svg className={`${styles.chevron} ${accountOpen ? styles.chevronOpen : ''}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {accountOpen && (
                  <div className={styles.dropdown}>
                    <AccountMenu onNavigate={() => overlay.close('account')} />
                  </div>
                )}
              </div>
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
