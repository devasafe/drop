/**
 * "Painel da equipe" (correção V1 da D3a): quem é da equipe (marketing e gerentes) e trocou para outra área
 * (ex.: Cliente) volta ao painel pelo seletor de área (AccountMenu e tela Conta). O CEO segue com "Administração".
 */
import type { IconName } from '../components/Icon';
import { adminHomeHref } from './adminNav';

/** Papéis de equipe, na ordem de preferência quando a conta tem mais de um. */
export const TEAM_ROLES = ['gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'marketing'] as const;

export const TEAM_AREA: { label: string; description: string; icon: IconName } = {
  label: 'Painel da equipe',
  description: 'Painel administrativo da equipe.',
  icon: 'shield',
};

/** O papel de equipe a oferecer, ou null quando a conta não tem nenhum ou já está num papel de equipe. */
export function teamRoleToOffer(roles: string[], activeRole: string): string | null {
  if ((TEAM_ROLES as readonly string[]).includes(activeRole)) return null;
  return TEAM_ROLES.find((r) => roles.includes(r)) ?? null;
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
