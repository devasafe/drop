import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useNotifications, useBadgeCounts } from '../hooks/useSync';
import { useSaasConfig } from '../hooks/useSaasConfig';
import { useCustodyLeftover } from '../hooks/useCustodyLeftover';
import AccountMenuButton from './nav/AccountMenuButton';
import { getNavItems, ROLE_HOME, Role, GUEST_BOTTOM_NAV, isItemActive } from '../lib/navConfig';
import { adminHomeHref } from '../lib/adminNav';
import { ROUTES } from '../lib/routes';
import Icon from './Icon';
import { Logo } from './drop/Logo';
import { themeForPath } from '../lib/routeTheme';
import styles from './Nav.module.css';

export default function Nav() {
  const { user, can } = useAuth() || {};
  const router = useRouter();
  const { cart } = useCart();
  const { unreadCount: unread } = useNotifications();
  const badges = useBadgeCounts();
  const { settlementMode } = useSaasConfig();
  const custodyLeftover = useCustodyLeftover();

  const cartCount = (cart || []).reduce((sum: number, c: any) => sum + (c.quantity || 0), 0);

  const activeRole = (user?.activeRole || user?.role || 'cliente') as Role;
  // Admin (CEO e equipe): a primeira página do painel que o papel abre (lib/adminNav, D3a).
  const adminHome = can ? adminHomeHref(can, activeRole === 'ceo') : null;
  // A logo leva cada role à SUA Home (lojista/motoboy → painel; cliente → /inicio; equipe do admin → painel).
  const homeHref = ROLE_HOME[activeRole] ?? adminHome ?? ROLE_HOME.cliente;

  // Miolo da navbar (desktop): os destinos principais do cliente — que no mobile
  // vivem na bottom bar. Só aparece pra cliente logado ou deslogado (lojista/
  // motoboy navegam pela AppSidebar; o admin, pelo AdminShell). Some no mobile (a bottom bar cobre).
  const showCustomerLinks = !user || activeRole === 'cliente';
  const clienteNavItems = getNavItems('cliente', () => true, false, { settlementMode, custodyLeftover }).filter((i) => i.placement.includes('bottomNav'));

  return (
    <>
    <header className={styles.header}>
      <nav className={styles.nav}>

        {/* Logo */}
        {/* No tema claro (ex.: painel da loja no computador) a arte para fundo escuro some no
            branco: usa a marca do DS, que segue os tokens do tema. */}
        {themeForPath(router.pathname) !== 'dark' ? (
          <Link href={homeHref} className={styles.logo} aria-label="DROP">
            <Logo size="sm" />
          </Link>
        ) : (
          <Link href={homeHref} className={styles.logo}>
            <img src="/images/logog_png.png" alt="DROP" />
          </Link>
        )}

        {/* Miolo: navegação principal do cliente (desktop). No mobile some — a
            bottom bar cobre esses destinos. */}
        {showCustomerLinks && (
          <div className={styles.center}>
            {user
              ? clienteNavItems.map((item) => {
                  const active = isItemActive(item, router.pathname, router.query as any);
                  return (
                    <Link
                      key={item.route}
                      href={item.route}
                      className={[styles.navLink, active && styles.navLinkActive].filter(Boolean).join(' ')}
                    >
                      {item.label}
                    </Link>
                  );
                })
              : GUEST_BOTTOM_NAV.filter((g) => g.key !== 'entrar').map((g) => {
                  const active = router.pathname === g.route;
                  return (
                    <Link
                      key={g.route}
                      href={g.route}
                      className={[styles.navLink, active && styles.navLinkActive].filter(Boolean).join(' ')}
                    >
                      {g.label}
                    </Link>
                  );
                })}
          </div>
        )}

        {/* Right Section */}
        <div className={styles.right}>
          {/* Carrinho — contexto de compra (cliente/deslogado). Badge com a
              quantidade; leva ao checkout (mesmo destino do StickyCart). */}
          {showCustomerLinks && (
            <Link href={ROUTES.sacola} className={styles.iconBtn} title="Carrinho" aria-label="Carrinho">
              <Icon name="shopping-cart" size={17} />
              {cartCount > 0 && <span className={styles.badge}>{cartCount > 9 ? '9+' : cartCount}</span>}
            </Link>
          )}
          {user ? (
            <>
              {/* Fora do painel, o CEO e a equipe voltam ao admin por aqui (o menu do admin mora no AdminShell, D3a). */}
              {adminHome && (
                <Link href={adminHome} className={styles.iconBtn} title="Painel do admin" aria-label="Abrir o painel do admin">
                  <Icon name="shield" size={17} />
                  {badges.verifications > 0 && (
                    <span className={styles.badge}>{badges.verifications > 9 ? '9+' : badges.verifications}</span>
                  )}
                </Link>
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
