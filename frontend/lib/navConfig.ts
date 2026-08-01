import { IconName } from '../components/Icon';
import { visibleAdminMenu } from './adminMenu';

export type Role = 'cliente' | 'lojista' | 'motoboy' | 'ceo';
export type Placement = 'sidebar' | 'bottomNav' | 'drawer';
export type BadgeKey = 'storeOrders' | 'deliveries' | 'verifications' | 'notifications';

export interface NavItem {
  label: string;
  icon: IconName;
  route: string;
  placement: Placement[];
  group?: string;
  permission?: string;
  badge?: BadgeKey;
  /** Prefixo p/ estado ativo. Default = route. */
  activeMatch?: string;
}

export interface RoleArea {
  role: Role;
  label: string;
  description: string;
  home: string;
  icon: IconName;
}

export const ROLE_HOME: Record<Role, string> = {
  cliente: '/inicio',
  lojista: '/seller/dashboard',
  motoboy: '/motoboy',
  ceo: '/admin/dashboard',
};

export const ROLE_AREAS: RoleArea[] = [
  { role: 'cliente', label: 'Cliente', icon: 'shopping-bag', home: ROLE_HOME.cliente,
    description: 'Compre nas lojas perto de você e acompanhe seus pedidos.' },
  { role: 'lojista', label: 'Lojista', icon: 'store', home: ROLE_HOME.lojista,
    description: 'Gerencie sua loja, pedidos, produtos e financeiro.' },
  { role: 'motoboy', label: 'Motoboy', icon: 'motorcycle', home: ROLE_HOME.motoboy,
    description: 'Aceite entregas e acompanhe seus ganhos.' },
  { role: 'ceo', label: 'Administração', icon: 'shield', home: ROLE_HOME.ceo,
    description: 'Painel administrativo e operação da plataforma.' },
];

// --- Config por role (cliente/lojista/motoboy). CEO deriva do ADMIN_MENU. ---
const NAV: Record<'cliente' | 'lojista' | 'motoboy', NavItem[]> = {
  cliente: [
    { label: 'Início',   icon: 'home',        route: '/inicio',         placement: ['bottomNav'] },
    { label: 'Buscar',   icon: 'search',      route: '/',               placement: ['bottomNav'], activeMatch: '/stores' },
    { label: 'Pedidos',  icon: 'receipt',     route: '/user-dashboard', placement: ['bottomNav'] },
    { label: 'Carteira', icon: 'wallet',      route: '/wallet',         placement: ['bottomNav'] },
    { label: 'Perfil',   icon: 'user',        route: '/minha-conta',    placement: ['bottomNav'] },
  ],
  lojista: [
    { label: 'Visão geral',        icon: 'chart-bar', route: '/seller/dashboard',            placement: ['sidebar', 'bottomNav'], group: 'Visão geral' },
    { label: 'Pedidos',            icon: 'receipt',   route: '/seller/dashboard?tab=orders', placement: ['sidebar', 'bottomNav'], group: 'Operação', badge: 'storeOrders', activeMatch: '/seller/dashboard' },
    { label: 'Produtos e estoque', icon: 'package',   route: '/seller/products',             placement: ['sidebar', 'bottomNav'], group: 'Operação' },
    { label: 'Mensagens',          icon: 'chat',      route: '/seller/dashboard?tab=chat',   placement: ['sidebar', 'drawer'],   group: 'Operação' }, // FOLLOW-UP (Etapa 3): rota real
    { label: 'Marketing',          icon: 'megaphone', route: '/seller/coupons',              placement: ['sidebar', 'drawer'],   group: 'Crescimento' },
    { label: 'Analytics',          icon: 'chart-up',  route: '/seller/analytics',            placement: ['sidebar', 'drawer'],   group: 'Crescimento' },
    { label: 'Financeiro da loja', icon: 'wallet',    route: '/seller/wallet',               placement: ['sidebar', 'bottomNav'], group: 'Financeiro' },
    { label: 'Minha loja',         icon: 'store',     route: '/seller/dashboard?tab=metrics', placement: ['sidebar', 'drawer'],  group: 'Loja', activeMatch: '/seller/dashboard' }, // FOLLOW-UP (Etapa 3)
    { label: 'Plano e cobrança',   icon: 'tag',       route: '/seller/select-plan',          placement: ['sidebar', 'drawer'],   group: 'Loja' },
    { label: 'Configurações',      icon: 'settings',  route: '/seller/dashboard?tab=metrics', placement: ['sidebar', 'drawer'],  group: 'Loja', activeMatch: '/seller/dashboard' }, // FOLLOW-UP (Etapa 3)
  ],
  motoboy: [
    { label: 'Visão geral',      icon: 'chart-bar', route: '/motoboy',             placement: ['sidebar', 'bottomNav'], group: 'Visão geral' },
    { label: 'Entregas',         icon: 'truck',     route: '/motoboy/ongoing',     placement: ['sidebar', 'bottomNav'], group: 'Trabalho', badge: 'deliveries' },
    { label: 'Ganhos e saques',  icon: 'wallet',    route: '/motoboy/wallet',      placement: ['sidebar', 'bottomNav'], group: 'Financeiro' },
    { label: 'Desempenho',       icon: 'trophy',    route: '/motoboy/gamification', placement: ['sidebar', 'bottomNav'], group: 'Desempenho' },
    { label: 'Benefícios',       icon: 'gift',      route: '/motoboy/beneficios',  placement: ['sidebar', 'drawer'],   group: 'Desempenho' },
    { label: 'Perfil e documentos', icon: 'clipboard', route: '/motoboy/profile',  placement: ['sidebar', 'drawer'],   group: 'Conta profissional' },
  ],
};

/** Grupo de sidebar de cada rota do painel admin (brief). */
const ADMIN_GROUP: Record<string, string> = {
  '/admin/dashboard': 'Visão geral',
  '/admin/analytics': 'Visão geral',
  '/admin/users': 'Operação',
  '/admin/verificacoes': 'Operação',
  '/admin/conversas': 'Operação',
  '/admin/suporte': 'Operação',
  '/admin/wallets': 'Financeiro',
  '/admin/withdrawals': 'Financeiro',
  '/admin/payouts': 'Financeiro',
  '/admin/app-cashbox': 'Financeiro',
  '/admin/plan-approvals': 'Financeiro',
  '/admin/broadcasts': 'Crescimento',
  '/admin/ranking-config': 'Crescimento',
  '/admin/coupons': 'Crescimento',
  '/admin/settings': 'Plataforma',
  '/admin/seasonal-theme': 'Plataforma',
  '/admin/permissoes': 'Plataforma',
};

/**
 * Itens de navegação visíveis para uma role, já filtrados por permissão.
 * CEO deriva do ADMIN_MENU (respeitando `visibleAdminMenu`); as demais roles
 * filtram seus itens declarados por `can(permission)`.
 */
export function getNavItems(
  role: Role,
  can: (permission: string) => boolean,
  isCeo: boolean,
): NavItem[] {
  if (role === 'ceo') {
    return visibleAdminMenu(can, isCeo).map((m) => ({
      label: m.label,
      icon: m.icon,
      route: m.href,
      placement: ['sidebar', 'drawer'] as Placement[],
      group: ADMIN_GROUP[m.href],
      badge: m.href === '/admin/verificacoes' ? ('verifications' as BadgeKey) : undefined,
    }));
  }
  const items = NAV[role] || [];
  return items.filter((it) => !it.permission || can(it.permission));
}

/** Estado ativo por prefixo de rota e tab na querystring. */
export function isItemActive(
  item: NavItem,
  pathname: string,
  query?: Record<string, string | string[] | undefined>,
): boolean {
  const base = (item.activeMatch || item.route).split('?')[0];
  const pathMatches = pathname === base || pathname.startsWith(base + '/');
  if (!pathMatches) return false;
  // Parse tab from the route (where it's defined in config)
  const routeQs = item.route.split('?')[1];
  const itemTab = routeQs ? new URLSearchParams(routeQs).get('tab') : null;
  const curTab = query && typeof query.tab === 'string' ? query.tab : null;
  if (itemTab) return curTab === itemTab;   // item targets a specific tab
  return curTab === null;                    // no-tab item = overview: active only when no tab selected
}
