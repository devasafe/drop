import { IconName } from '../components/Icon';

/**
 * Fonte única dos itens do painel admin. Cada item declara a permissão que o
 * backend exige para a sua rota — assim a navegação reflete exatamente o que o
 * usuário pode fazer (configurável em /admin/permissoes).
 *
 * - `permission`: permissão necessária (CEO sempre vê, pois tem acesso total).
 * - `ceoOnly`: itens que não são delegáveis por permissão (ex: editar permissões).
 */
export interface AdminMenuItem {
  href: string;
  label: string;
  icon: IconName;
  permission?: string;
  ceoOnly?: boolean;
  /** Some no modo de liquidação 'direto' (custódia/repasse desligados). */
  custodyOnly?: boolean;
  /** Inverso de custodyOnly: aparece SÓ no modo 'direto' (conta Asaas própria da loja). */
  directOnly?: boolean;
}

export const ADMIN_MENU: AdminMenuItem[] = [
  { href: '/admin/dashboard',      label: 'Dashboard',    icon: 'chart-bar',    permission: 'dashboard:view_all' },
  { href: '/admin/verificacoes',   label: 'Verificações', icon: 'shield',       permission: 'verification:view_queue' },
  { href: '/admin/analytics',      label: 'Analytics',    icon: 'chart-up',     permission: 'analytics:view_platform' },
  { href: '/admin/users',          label: 'Usuários',     icon: 'users',        permission: 'user:view_all' },
  { href: '/admin/wallets',        label: 'Carteiras',    icon: 'wallet',       permission: 'wallet:view_all', custodyOnly: true },
  { href: '/admin/withdrawals',    label: 'Saques',       icon: 'send',         permission: 'withdrawal:view', custodyOnly: true },
  { href: '/admin/payouts',        label: 'Payouts',      icon: 'clipboard',    permission: 'payout:view', custodyOnly: true },
  { href: '/admin/app-cashbox',    label: 'Caixa',        icon: 'bank',         permission: 'cashbox:view', custodyOnly: true },
  { href: '/admin/plan-approvals', label: 'Planos',       icon: 'check-circle', permission: 'plan:view', custodyOnly: true },
  { href: '/admin/estornos',      label: 'Estornos',     icon: 'send',         permission: 'payout:view', directOnly: true },
  { href: '/admin/conversas',      label: 'Conversas',    icon: 'chat',         permission: 'conversations:view_all' },
  { href: '/admin/broadcasts',     label: 'Anúncios',     icon: 'megaphone',    permission: 'broadcast:send' },
  { href: '/admin/avisos',         label: 'Avisos (home)', icon: 'star',        ceoOnly: true },
  { href: '/admin/suporte',        label: 'Suporte',      icon: 'headphones',   permission: 'support:attend' },
  { href: '/admin/ranking-config', label: 'Ranking',      icon: 'trophy',       permission: 'ranking:manage' },
  { href: '/admin/settings',       label: 'Config.',      icon: 'settings',     permission: 'settings:manage' },
  { href: '/admin/freios',         label: 'Freios',       icon: 'pause',        permission: 'settings:manage' },
  { href: '/admin/seasonal-theme', label: 'Tema',         icon: 'palette',      permission: 'theme:edit' },
  // Não delegáveis por permissão (apenas CEO):
  { href: '/admin/coupons',        label: 'Cupons',       icon: 'tag',          ceoOnly: true },
  { href: '/admin/permissoes',     label: 'Permissões',   icon: 'lock',         ceoOnly: true },
  { href: '/admin/lojas-asaas',    label: 'Contas Asaas', icon: 'bank',         ceoOnly: true, directOnly: true },
];

/** Itens visíveis para um usuário, dadas suas permissões. */
export function visibleAdminMenu(
  can: (perm: string) => boolean,
  isCeo: boolean
): AdminMenuItem[] {
  return ADMIN_MENU.filter((item) => {
    if (isCeo) return true;
    if (item.ceoOnly) return false;
    return item.permission ? can(item.permission) : false;
  });
}
