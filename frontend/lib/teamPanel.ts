/**
 * Papéis de equipe como áreas (correções V1/V2 da D3a): cada papel de equipe que a conta tem (marketing e gerentes)
 * é uma área própria no seletor de área (AccountMenu e tela Conta), ao lado de Cliente/Lojista/Motoboy/Administração.
 * O CEO segue com "Administração" (ROLE_AREAS).
 */
import type { IconName } from '../components/Icon';
import { adminHomeHref, adminRoleLabel } from './adminNav';

export interface TeamArea {
  role: string;
  label: string;
  description: string;
  icon: IconName;
}

const TEAM_DESCRIPTIONS: Record<string, string> = {
  marketing: 'Avisos, broadcasts e tema do app.',
  gerente_geral: 'Operação e equipe no painel administrativo.',
  gerente_clientes: 'Clientes, verificações e suporte.',
  gerente_lojistas: 'Lojas, planos e repasses.',
  gerente_motoboys: 'Motoboys, verificações e Pix.',
};

/** Áreas de equipe na ordem do seletor; o rótulo é o mesmo do painel (adminRoleLabel). */
export const TEAM_AREAS: TeamArea[] = Object.entries(TEAM_DESCRIPTIONS).map(([role, description]) => ({
  role, label: adminRoleLabel(role), description, icon: 'shield',
}));

/** As áreas de equipe que a conta tem em `roles`. */
export function teamAreasOf(roles: string[]): TeamArea[] {
  return TEAM_AREAS.filter((a) => roles.includes(a.role));
}

/**
 * Troca para o papel de equipe e devolve a primeira página do painel que ele abre.
 * Lança se o servidor recusar a troca (quem chama não navega). As permissões do novo papel só existem depois
 * da troca: lemos /role-permissions/me aqui (o cookie já é o do novo papel) em vez de esperar o AuthContext.
 * Devolve null se a leitura falhar ou se o papel não abre nenhuma página: quem chama não navega.
 */
export async function enterTeamPanel(teamRole: string, switchRole: (role: string) => Promise<unknown>): Promise<string | null> {
  await switchRole(teamRole);
  try {
    // Import sob demanda: o menu da conta não carrega o cliente da API só por existir.
    const { default: api } = await import('./api');
    const res = await api.get('/role-permissions/me');
    const perms: string[] = res.data?.permissions || [];
    return adminHomeHref((p) => perms.includes('*') || perms.includes(p), false);
  } catch {
    return null;
  }
}
