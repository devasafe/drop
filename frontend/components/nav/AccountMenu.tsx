// frontend/components/nav/AccountMenu.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_AREAS, ROLE_HOME, Role } from '../../lib/navConfig';
import Icon from '../Icon';
import styles from './AccountMenu.module.css';

export default function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, switchRole, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const activeRole = (user.activeRole || user.role || 'cliente') as Role;
  const roles = (user.roles || (user.role ? [user.role] : [])) as string[];
  const myAreas = ROLE_AREAS.filter((a) => roles.includes(a.role));

  const go = (href: string) => { onNavigate?.(); router.push(href); };

  const selectArea = async (role: Role) => {
    if (role === activeRole) return;
    try { await switchRole(role); } catch { /* backend valida */ }
    onNavigate?.();
    router.push(ROLE_HOME[role]);
  };

  const activeArea = ROLE_AREAS.find((a) => a.role === activeRole);
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <div className={styles.menu} role="menu" aria-label="Conta">
      <div className={styles.dropHead}>
        <div className={styles.dropAvatar}>{initial}</div>
        <div>
          <div className={styles.dropName}>{user.name}</div>
          {activeArea && (
            <span className={styles.rolePill}><Icon name={activeArea.icon} size={12} /> {activeArea.label}</span>
          )}
          <div className={styles.email}>{user.email}</div>
        </div>
      </div>

      {myAreas.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Suas áreas</div>
          {myAreas.map((a) => {
            const isActive = a.role === activeRole;
            return (
              <button
                key={a.role}
                type="button"
                className={styles.areaCard}
                data-active={isActive}
                onClick={() => selectArea(a.role)}
              >
                <span className={styles.areaIcon}><Icon name={a.icon} size={16} /></span>
                <span className={styles.areaText}>
                  <span className={styles.areaLabel}>{a.label}</span>
                  <span className={styles.areaDesc}>{a.description}</span>
                </span>
                {isActive && <span className={styles.activeTag}>ATUAL</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Conta</div>
        <button type="button" className={styles.item} onClick={() => go(activeRole === 'motoboy' ? '/motoboy/profile' : '/user-profile')}>
          <span className={styles.itemIcon}><Icon name="user" size={14} /></span> Conta e segurança
        </button>
        <button type="button" className={styles.item} onClick={() => go('/notifications')}>
          <span className={styles.itemIcon}><Icon name="bell" size={14} /></span> Preferências e notificações
        </button>
        <button type="button" className={styles.item} onClick={() => go('/suporte')}>
          <span className={styles.itemIcon}><Icon name="headphones" size={14} /></span> Ajuda e suporte
        </button>
      </div>

      <div className={styles.dropFoot}>
        <button type="button" onClick={() => { onNavigate?.(); logout(); }} className={styles.logoutBtn}>
          Sair
        </button>
      </div>
    </div>
  );
}
