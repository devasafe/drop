import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { useOverlay } from '../../contexts/OverlayContext';
import { useBadgeCounts } from '../../hooks/useSync';
import { getNavItems, isItemActive, Role, NavItem } from '../../lib/navConfig';
import Icon from '../Icon';
import styles from './PanelBottomNav.module.css';

export default function PanelBottomNav() {
  const { user, can } = useAuth();
  const router = useRouter();
  const overlay = useOverlay();
  const badges = useBadgeCounts();
  if (!user) return null;

  const role = (user.activeRole || user.role || 'cliente') as Role;
  if (role === 'cliente') return null; // cliente usa CustomerAppChrome

  const all = getNavItems(role, can, role === 'ceo');
  const bottom = all.filter((i) => i.placement.includes('bottomNav')).slice(0, 4);
  if (bottom.length === 0) return null; // admin/ceo: sem bottom-nav dedicada → usa o drawer da sidebar (via hambúrguer)
  // "Mais" abre a sidebar lateral completa (o mesmo menu do antigo hambúrguer do topo).
  const menuOpen = overlay.isOpen('panelSidebar');
  const count = (b?: NavItem['badge']) =>
    b === 'storeOrders' ? badges.storeOrders : b === 'deliveries' ? badges.deliveries : b === 'verifications' ? badges.verifications : 0;

  return (
    <nav className={styles.bar} aria-label="Navegação do painel">
      {bottom.map((it) => {
        const active = isItemActive(it, router.pathname, router.query);
        const c = count(it.badge);
        return (
          <button key={it.label} type="button" className={`${styles.item} ${active ? styles.on : ''}`}
            aria-current={active ? 'page' : undefined} onClick={() => router.push(it.route)}>
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
            {c > 0 && <span className={styles.pill}>{c > 99 ? '99+' : c}</span>}
          </button>
        );
      })}
      <button type="button" className={`${styles.item} ${menuOpen ? styles.on : ''}`}
        aria-current={menuOpen ? 'page' : undefined} onClick={() => overlay.toggle('panelSidebar')}>
        <Icon name="menu" size={20} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
