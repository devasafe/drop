import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { useOverlay } from '../../contexts/OverlayContext';
import { useBadgeCounts } from '../../hooks/useSync';
import { getNavItems, isItemActive, Role, NavItem } from '../../lib/navConfig';
import Icon from '../Icon';
import styles from './AppSidebar.module.css';

const PANEL_META: Record<string, { title: string; subtitle: string; icon: any }> = {
  lojista: { title: 'DROP SELLER',  subtitle: 'Painel do lojista',  icon: 'store' },
  motoboy: { title: 'DROP MOTOBOY', subtitle: 'Painel do motoboy',  icon: 'motorcycle' },
  ceo:     { title: 'DROP ADMIN',   subtitle: 'Administração',      icon: 'shield' },
};

function groupItems(items: NavItem[]): Array<{ group?: string; items: NavItem[] }> {
  const order: string[] = [];
  const map = new Map<string, NavItem[]>();
  items.forEach((it) => {
    const g = it.group || '';
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(it);
  });
  return order.map((g) => ({ group: g || undefined, items: map.get(g)! }));
}

export default function AppSidebar() {
  const { user, can } = useAuth();
  const router = useRouter();
  const overlay = useOverlay();
  const badges = useBadgeCounts();
  if (!user) return null;

  const role = (user.activeRole || user.role || 'cliente') as Role;
  const meta = PANEL_META[role];
  if (!meta) return null; // cliente não tem sidebar

  const items = getNavItems(role, can, role === 'ceo').filter((i) => i.placement.includes('sidebar'));
  const groups = groupItems(items);
  const open = overlay.isOpen('panelSidebar');
  const badgeCount = (b?: NavItem['badge']) =>
    b === 'storeOrders' ? badges.storeOrders : b === 'deliveries' ? badges.deliveries : b === 'verifications' ? badges.verifications : 0;

  return (
    <>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogoRow}>
            <div className={styles.sidebarLogoIcon}><Icon name={meta.icon} size={16} /></div>
            <span className={styles.sidebarLogo}>{meta.title}</span>
          </div>
          <p className={styles.sidebarSubtitle}>{meta.subtitle}</p>
        </div>

        <nav className={styles.sidebarNav}>
          {groups.map(({ group, items: gItems }) => (
            <div key={group || 'root'}>
              {group && <div className={styles.sidebarNavLabel}>{group}</div>}
              {gItems.map((it) => {
                const active = isItemActive(it, router.pathname, router.query);
                const count = badgeCount(it.badge);
                return (
                  <a
                    key={it.label}
                    href={it.route}
                    aria-current={active ? 'page' : undefined}
                    className={`${styles.sidebarNavItem} ${active ? styles.sidebarNavItemActive : ''}`}
                    onClick={() => overlay.close('panelSidebar')}
                  >
                    <Icon name={it.icon} size={16} />
                    <span>{it.label}</span>
                    {count > 0 && <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: '#6C2BD9', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{count > 99 ? '99+' : count}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className={styles.sidebarOverlay} onClick={() => overlay.close('panelSidebar')} />}
    </>
  );
}
