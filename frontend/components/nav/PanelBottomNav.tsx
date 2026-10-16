import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { useBadgeCounts } from '../../hooks/useSync';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useCustodyLeftover } from '../../hooks/useCustodyLeftover';
import { getNavItems, isItemActive, bottomNavLayout, Role, NavItem } from '../../lib/navConfig';
import Icon from '../Icon';
import styles from './PanelBottomNav.module.css';

export default function PanelBottomNav() {
  const { user, can } = useAuth();
  const router = useRouter();
  const badges = useBadgeCounts();
  const { settlementMode } = useSaasConfig();
  const custodyLeftover = useCustodyLeftover();
  if (!user) return null;

  const role = (user.activeRole || user.role || 'cliente') as Role;
  if (role === 'cliente') return null; // cliente usa CustomerAppChrome

  const all = getNavItems(role, can, false, { settlementMode, custodyLeftover });
  const layout = bottomNavLayout(role);
  const bottom = all.filter((i) => i.placement.includes('bottomNav')).slice(0, layout.max);
  // admin: não monta no painel (AdminShell, D3a); o ramo do CEO em getNavItems é vazio. Por isso o
  // `more` do layout (só o ceo tem) nunca chega a desenhar um botão "Mais" aqui.
  if (bottom.length === 0) return null;
  const count = (b?: NavItem['badge']) =>
    b === 'storeOrders' ? badges.storeOrders : b === 'deliveries' ? badges.deliveries : b === 'verifications' ? badges.verifications : 0;

  return (
    <nav
      className={`${styles.bar}${role === 'lojista' ? ` ${styles.seller}` : ''}${role === 'motoboy' ? ` ${styles.motoboy}` : ''}`}
      aria-label="Navegação do painel"
    >
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
    </nav>
  );
}
