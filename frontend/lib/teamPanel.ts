/**
 * "Painel da equipe" (16/10): papel de equipe (marketing e gerentes) não é uma área para a qual se troca —
 * é um acréscimo à conta. A pessoa continua cliente e o painel admin mostra o que os papéis de equipe dela
 * liberam (o servidor devolve a união em /role-permissions/me). O CEO segue com "Administração" (ROLE_AREAS).
 */
import { adminHomeHref, adminRoleLabel, canOpenAdminPanel } from './adminNav';

export interface TeamPanelEntry {
  /** Nomes dos papéis de equipe, ex.: "Marketing · Gerente de motoboys". */
  roles: string;
  /** Primeira página do painel que a conta abre. */
  href: string;
}

/** Entrada do painel da equipe: só com papel de equipe e ao menos uma aba visível; senão null. */
export function teamPanelEntry(teamRoles: string[] | undefined, can: ((p: string) => boolean) | undefined): TeamPanelEntry | null {
  if (!teamRoles || teamRoles.length === 0 || !can) return null;
  if (!canOpenAdminPanel(can, false)) return null;
  const href = adminHomeHref(can, false);
  if (!href) return null;
  return { roles: teamRoles.map(adminRoleLabel).join(' · '), href };
}
