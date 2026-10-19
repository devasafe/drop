// frontend/components/panel/AreasSection.tsx (bloco de painel compartilhado: loja e motoboy)
import { useRouter } from 'next/router';
import Icon from '../Icon';
import { NavRow } from './NavRow';
import blocks from './PanelBlocks.module.css';
import { useAuth } from '../../contexts/AuthContext';
import { ROLE_AREAS, ROLE_HOME } from '../../lib/navConfig';
import { teamPanelEntry } from '../../lib/teamPanel';

/**
 * Áreas para as quais a conta pode trocar, fora a ativa. Cliente é sempre uma delas: todo mundo pode
 * comprar, e o servidor acrescenta 'cliente' a lojista e motoboy na troca (contas antigas não o têm em roles).
 */
export function otherAreasOf(user: { activeRole?: string; role?: string; roles?: string[] } | null | undefined) {
  const active = user?.activeRole || user?.role || 'cliente';
  const roles = new Set<string>([...(user?.roles || []), ...(user?.role ? [user.role] : []), 'cliente']);
  return ROLE_AREAS.filter((a) => roles.has(a.role) && a.role !== active);
}

/**
 * "Painel da equipe" + "Suas áreas" das abas de conta do painel (Loja e Perfil do motoboy).
 * No celular essas telas não têm o AccountMenu: sem isto a pessoa fica presa na área.
 * A troca é decidida pelo servidor; se ele recusar, não navega.
 */
export function AreasSection() {
  const router = useRouter();
  const { user, switchRole, teamRoles, can } = useAuth() || ({} as any);
  const activeRole = user?.activeRole || user?.role;
  const areas = otherAreasOf(user);
  const teamPanel = activeRole === 'ceo' ? null : teamPanelEntry(teamRoles, can);

  const goToArea = async (role: string) => {
    try { await switchRole(role); } catch { return; }
    router.push(ROLE_HOME[role as keyof typeof ROLE_HOME]);
  };

  return (
    <>
      {teamPanel && (
        <section aria-label="Equipe" className={blocks.stack}>
          <h2 className={blocks.cap}>Equipe</h2>
          <ul className={blocks.list}>
            <NavRow icon={<Icon name="shield" size={20} />} label="Painel da equipe" sub={teamPanel.roles} onClick={() => router.push(teamPanel.href)} />
          </ul>
        </section>
      )}
      {areas.length > 0 && (
        <section aria-label="Suas áreas" className={blocks.stack}>
          <h2 className={blocks.cap}>Suas áreas</h2>
          <ul className={blocks.list}>
            {areas.map((a) => (
              <NavRow key={a.role} icon={<Icon name={a.icon} size={20} />} label={a.label} sub={a.description} onClick={() => goToArea(a.role)} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default AreasSection;
