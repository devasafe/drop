import { adminRoleLabel } from '../../../lib/adminNav';

/**
 * Rótulos do Suporte (D3a, tela 19), num lugar só: usados pelos chamados (TicketsView) e pelas conversas
 * entre usuários (ConversasView).
 */
export const STATUS_LABELS: Record<string, string> = { aberto: 'Aberto', em_atendimento: 'Em atendimento', resolvido: 'Resolvido' };

export const PERSON_ROLE: Record<string, string> = { cliente: 'Cliente', lojista: 'Lojista', motoboy: 'Motoboy' };

/** Papel da pessoa: cliente, lojista e motoboy pelo nome; papel da equipe pelo rótulo do admin; vazio sem papel. */
export const personRole = (r?: string) => (r ? PERSON_ROLE[r] ?? adminRoleLabel(r) : '');
