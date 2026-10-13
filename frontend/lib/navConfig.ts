import { IconName } from '../components/Icon';
import { visibleAdminMenu } from './adminMenu';
import { SELLER_ROUTES } from './sellerRoutes';

export type Role = 'cliente' | 'lojista' | 'motoboy' | 'ceo';
export type Placement = 'sidebar' | 'bottomNav' | 'drawer' | 'account';
export type BadgeKey = 'storeOrders' | 'deliveries' | 'verifications' | 'notifications';

export interface NavItem {
  label: string;
  icon: IconName;
  route: string;
  placement: Placement[];
  group?: string;
  permission?: string;
  badge?: BadgeKey;
  /** Prefixo(s) p/ estado ativo. Default = route. Aceita vários (ex.: Buscar
   * cobre '/', '/stores' e '/product'). */
  activeMatch?: string | string[];
  /** Casa SÓ exatamente com a rota (sem prefixo). Use na home de área, cuja
   * rota é prefixo de todas as outras (ex.: '/motoboy') — senão ela ficaria
   * ativa em qualquer subtela junto com o item real. */
  exact?: boolean;
  /** Some no modo de liquidação 'direto' (custódia/repasse desligados). */
  custodyOnly?: boolean;
  /** Inverso de custodyOnly: aparece SÓ no modo 'direto' (conta Asaas própria da loja). */
  directOnly?: boolean;
  /** Aparece SÓ no modo 'direto' para quem ainda tem saldo da custódia (P16: o saldo
   * termina no modo em que nasceu). Quem decide é o backend (GET /settings/custody-leftover). */
  custodyLeftoverOnly?: boolean;
  /** Estado ativo só pelo caminho; ignora ?tab= (painel da loja, D1: as URLs antigas chegam
   * redirecionadas carregando a query). */
  pathOnly?: boolean;
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

/** Bottom-nav do cliente quando NÃO logado: só Início, Buscar e Entrar.
 *  As rotas são a fonte da verdade; os ícones (lucide) são atribuídos no
 *  CustomerAppChrome. "Entrar" leva pro login. */
export const GUEST_BOTTOM_NAV: { key: 'inicio' | 'buscar' | 'entrar'; label: string; route: string }[] = [
  { key: 'inicio', label: 'Início', route: '/inicio' },
  { key: 'buscar', label: 'Buscar', route: '/buscar' },
  { key: 'entrar', label: 'Entrar', route: '/login' },
];

// --- Config por role (cliente/lojista/motoboy). CEO deriva do ADMIN_MENU. ---
const NAV: Record<'cliente' | 'lojista' | 'motoboy', NavItem[]> = {
  cliente: [
    { label: 'Início',  icon: 'home',    route: '/inicio',  placement: ['bottomNav'] },
    { label: 'Buscar',  icon: 'search',  route: '/buscar',  placement: ['bottomNav'], activeMatch: ['/', '/buscar', '/stores', '/loja', '/product', '/produto', '/produtos'] },
    { label: 'Pedidos', icon: 'receipt', route: '/pedidos', placement: ['bottomNav'], activeMatch: ['/pedidos', '/pedido'] },
    { label: 'Conta',   icon: 'user',    route: '/conta',   placement: ['bottomNav'], activeMatch: ['/conta', '/minha-conta', '/user-profile', '/editar-conta'] },
    // Carteira saiu das abas (spec §9): vira linha da tela Conta. A regra P16 decide qual aparece.
    { label: 'Carteira', icon: 'wallet', route: '/conta/carteira', placement: ['account'], custodyOnly: true },
    { label: 'Saldo do modo anterior', icon: 'wallet', route: '/conta/carteira', placement: ['account'], custodyLeftoverOnly: true },
  ],

  lojista: [
    // 5 abas (spec D1 §3.1), iguais nos dois modos. O conteúdo de cada modo é decidido dentro da tela.
    { label: 'Agora',    icon: 'home',    route: SELLER_ROUTES.agora,     placement: ['sidebar', 'bottomNav'], exact: true, pathOnly: true },
    { label: 'Pedidos',  icon: 'receipt', route: SELLER_ROUTES.pedidos(), placement: ['sidebar', 'bottomNav'], badge: 'storeOrders', pathOnly: true,
      activeMatch: ['/seller/pedidos', '/seller/pedido', '/seller/order-[id]'] },
    { label: 'Produtos', icon: 'package', route: SELLER_ROUTES.produtos,  placement: ['sidebar', 'bottomNav'], pathOnly: true,
      activeMatch: [SELLER_ROUTES.produtos, SELLER_ROUTES.novoProduto, '/seller/edit-product', SELLER_ROUTES.estoque] },
    { label: 'Dinheiro', icon: 'wallet',  route: SELLER_ROUTES.dinheiro,  placement: ['sidebar', 'bottomNav'], pathOnly: true,
      activeMatch: [SELLER_ROUTES.dinheiro, '/seller/wallet', '/seller/transfer-wallet'] },
    { label: 'Loja',     icon: 'store',   route: SELLER_ROUTES.loja,      placement: ['sidebar', 'bottomNav'], pathOnly: true,
      activeMatch: [
        SELLER_ROUTES.loja, SELLER_ROUTES.desempenho, SELLER_ROUTES.avaliacoes, SELLER_ROUTES.cupons, SELLER_ROUTES.integracoes,
        SELLER_ROUTES.horarios, SELLER_ROUTES.plano, '/seller/select-plan', SELLER_ROUTES.assinatura, '/seller/pagamentos',
        SELLER_ROUTES.contaAsaas, SELLER_ROUTES.notificacoes,
      ] },
    // Subitens da Loja no menu lateral (computador). Cada um leva a uma tela de um modo só, por isso
    // a marca de modo continua aqui (b4.saasBilling, navConfig.saas). As partes P6/P7 acrescentam
    // Avaliações, Horários, Notificações, Plano e Conta Asaas quando as telas existirem.
    { label: 'Desempenho',        icon: 'chart-up',  route: SELLER_ROUTES.desempenho,  placement: ['sidebar'], group: 'Loja', pathOnly: true },
    { label: 'Cupons',            icon: 'megaphone', route: SELLER_ROUTES.cupons,      placement: ['sidebar'], group: 'Loja', pathOnly: true },
    { label: 'Horários',          icon: 'clock',     route: SELLER_ROUTES.horarios,    placement: ['sidebar'], group: 'Loja', pathOnly: true },
    { label: 'Integrações (API)', icon: 'link',      route: SELLER_ROUTES.integracoes, placement: ['sidebar'], group: 'Loja', pathOnly: true },
    { label: 'Notificações',      icon: 'bell',      route: SELLER_ROUTES.notificacoes, placement: ['sidebar'], group: 'Loja', pathOnly: true },
    { label: 'Plano e cobrança',  icon: 'tag',       route: '/seller/select-plan',     placement: ['sidebar'], group: 'Loja', pathOnly: true, custodyOnly: true },
    { label: 'Assinatura',        icon: 'receipt',   route: SELLER_ROUTES.assinatura,  placement: ['sidebar'], group: 'Loja', pathOnly: true, directOnly: true },
    { label: 'Recebimentos',      icon: 'bank',      route: '/seller/pagamentos',      placement: ['sidebar'], group: 'Loja', pathOnly: true, directOnly: true },
    // P16: o saldo da custódia termina no modo em que nasceu. A tela é o card dentro de Dinheiro (P6).
    { label: 'Saldo do modo anterior', icon: 'wallet', route: '/seller/wallet', placement: ['sidebar'], group: 'Dinheiro', pathOnly: true, custodyLeftoverOnly: true },
  ],
  motoboy: [
    { label: 'Visão geral',      icon: 'chart-bar', route: '/motoboy',             placement: ['sidebar', 'bottomNav'], group: 'Visão geral', exact: true },
    { label: 'Entregas',         icon: 'truck',     route: '/motoboy/ongoing',     placement: ['sidebar', 'bottomNav'], group: 'Trabalho', badge: 'deliveries' },
    { label: 'Ganhos e saques',  icon: 'wallet',    route: '/motoboy/wallet',      placement: ['sidebar', 'bottomNav'], group: 'Financeiro', custodyOnly: true },
    { label: 'Repasses recebidos', icon: 'wallet',   route: '/motoboy/wallet',      placement: ['sidebar', 'bottomNav'], group: 'Financeiro', directOnly: true },
    { label: 'Saldo do modo anterior', icon: 'wallet', route: '/motoboy/wallet',  placement: ['sidebar', 'drawer'],   group: 'Financeiro', custodyLeftoverOnly: true },
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
  '/admin/freios': 'Plataforma',
  '/admin/seasonal-theme': 'Plataforma',
  '/admin/permissoes': 'Plataforma',
  '/admin/lojas-asaas': 'Financeiro',
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
  opts?: { settlementMode?: string; custodyLeftover?: boolean; adminCustodyOpen?: boolean },
): NavItem[] {
  const direct = opts?.settlementMode === 'direto';
  const showLeftover = direct && opts?.custodyLeftover === true;
  if (role === 'ceo') {
    // I5: Payouts/Saques seguem no modo direto enquanto houver custódia em aberto.
    const hiddenInDirect = (m: { custodyOnly?: boolean; whileCustodyOpen?: boolean }) =>
      !!m.custodyOnly && !(m.whileCustodyOpen && opts?.adminCustodyOpen === true);
    return visibleAdminMenu(can, isCeo).filter((m) => !(direct && hiddenInDirect(m)) && !(m.directOnly && !direct)).map((m) => ({
      label: m.label,
      icon: m.icon,
      route: m.href,
      placement: ['sidebar', 'drawer'] as Placement[],
      group: ADMIN_GROUP[m.href],
      badge: m.href === '/admin/verificacoes' ? ('verifications' as BadgeKey) : undefined,
    }));
  }
  const items = NAV[role] || [];
  return items.filter((it) =>
    (!it.permission || can(it.permission))
    && !(direct && it.custodyOnly)
    && !(it.directOnly && !direct)
    && !(it.custodyLeftoverOnly && !showLeftover));
}

/** Estado ativo por prefixo de rota e tab na querystring. */
export function isItemActive(
  item: NavItem,
  pathname: string,
  query?: Record<string, string | string[] | undefined>,
): boolean {
  const matches = Array.isArray(item.activeMatch)
    ? item.activeMatch
    : [item.activeMatch || item.route];
  const bases = matches.map((m) => m.split('?')[0]);
  const pathMatches = item.exact
    ? bases.some((base) => pathname === base)
    : bases.some((base) => pathname === base || pathname.startsWith(base + '/'));
  if (!pathMatches) return false;
  // Painel da loja (D1): abas por rota; o ?tab= que sobra dos redirects antigos não conta.
  if (item.pathOnly) return true;
  // Parse tab from the route (where it's defined in config)
  const routeQs = item.route.split('?')[1];
  const itemTab = routeQs ? new URLSearchParams(routeQs).get('tab') : null;
  const curTab = query && typeof query.tab === 'string' ? query.tab : null;
  if (itemTab) return curTab === itemTab;   // item targets a specific tab
  return curTab === null;                    // no-tab item = overview: active only when no tab selected
}

/** Barra de baixo de cada painel: o lojista tem 5 abas fixas e nenhum "Mais" (spec D1 §3.1);
 * motoboy e admin seguem com 4 itens + "Mais" (abre o menu lateral). */
export function bottomNavLayout(role: Role): { max: number; more: boolean } {
  return role === 'lojista' ? { max: 5, more: false } : { max: 4, more: true };
}
