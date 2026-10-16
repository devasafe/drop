// frontend/components/nav/AccountMenu.tsx
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_AREAS, ROLE_HOME, Role } from '../../lib/navConfig';
import { ROUTES } from '../../lib/routes';
import { MOTOBOY_ROUTES } from '../../lib/motoboyRoutes';
import { imageUrl } from '../../lib/config';
import { teamPanelEntry } from '../../lib/teamPanel';
import { isAdminPanelRoute } from '../../lib/adminNav';
import Icon, { type IconName } from '../Icon';
import styles from './AccountMenu.module.css';

export default function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, switchRole, logout, teamRoles, can } = useAuth();
  const router = useRouter();
  if (!user) return null;

  const activeRole = (user.activeRole || user.role || 'cliente') as Role;
  const roles = (user.roles || (user.role ? [user.role] : [])) as string[];
  const myAreas: { role: string; label: string; description: string; icon: IconName }[] =
    ROLE_AREAS.filter((a) => roles.includes(a.role));
  // Papel de equipe é acréscimo: um item leva direto ao painel, sem trocar de área.
  const teamPanel = activeRole === 'ceo' ? null : teamPanelEntry(teamRoles, can);
  const inAdmin = isAdminPanelRoute(router?.pathname ?? '');

  const go = (href: string) => { onNavigate?.(); router.push(href); };

  const selectArea = async (role: Role) => {
    if (role === activeRole) return;
    try {
      await switchRole(role);
    } catch {
      return; // troca falhou: não navega (backend é a fonte de verdade)
    }
    onNavigate?.();
    router.push(ROLE_HOME[role]);
  };

  const activeArea = myAreas.find((a) => a.role === activeRole);
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <div className={styles.menu} role="menu" aria-label="Conta">
      <div className={styles.dropHead}>
        <div className={styles.dropAvatar}>
          {user.photo ? (
            <img src={imageUrl(user.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
          ) : (
            initial
          )}
        </div>
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
                onClick={() => selectArea(a.role as Role)}
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

      {(teamPanel || (inAdmin && activeRole !== 'ceo')) && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Equipe</div>
          {teamPanel && !inAdmin && (
            <button type="button" className={styles.areaCard} onClick={() => go(teamPanel.href)}>
              <span className={styles.areaIcon}><Icon name="shield" size={16} /></span>
              <span className={styles.areaText}>
                <span className={styles.areaLabel}>Painel da equipe</span>
                <span className={styles.areaDesc}>{teamPanel.roles}</span>
              </span>
            </button>
          )}
          {inAdmin && activeRole !== 'ceo' && (
            <button type="button" className={styles.item} onClick={() => go(ROLE_HOME.cliente)}>
              <span className={styles.itemIcon}><Icon name="shopping-bag" size={14} /></span> Voltar ao app
            </button>
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Conta</div>
        <button type="button" className={styles.item} onClick={() => go(activeRole === 'motoboy' ? MOTOBOY_ROUTES.perfil : activeRole === 'cliente' ? ROUTES.conta : '/user-profile')}>
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
