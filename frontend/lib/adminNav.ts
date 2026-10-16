/**
 * Menu do painel do admin (DS v2, fase D3a): fonte única das áreas, das abas, da permissão e do filtro de modo.
 * Cada aba é uma página que já existe e declara a MESMA permissão da proteção da página e o mesmo filtro de modo
 * do menu antigo (lib/adminMenu.ts, que sai na P5). lib/__tests__/adminNav.parity.test.ts cobra.
 *
 * Regras (spec D3a 3.5):
 * - esconder, nunca cadeado: a aba some para quem não pode abri-la;
 * - a área aparece se ao menos uma aba dela aparece, e leva à primeira aba visível;
 * - o CEO vê tudo o que o modo permite; `ceoOnly` não é delegável; aba sem permissão e sem `ceoOnly` só o CEO vê;
 * - modo desconhecido (carregando ou erro na leitura) esconde toda aba marcada com modo (fail closed).
 */
import type { IconName } from '../components/Icon';

export type AdminAreaKey =
  | 'numeros' | 'verificacoes' | 'usuarios' | 'lojas' | 'dinheiro' | 'suporte' | 'comunicacao'
  | 'regras' | 'freios' | 'permissoes' | 'tema';

export type AdminGroup = 'Operação' | 'Pessoas' | 'Dinheiro' | 'Comunicação' | 'Configuração';

export interface AdminTab {
  key: string;
  label: string;
  /** URL da página (a mesma de hoje). `?aba=` só quando duas abas moram na mesma página. */
  href: string;
  /**
   * Permissão da página (a mesma do ProtectedRoute dela). Lista = QUALQUER UMA basta: página fundida (D1),
   * cujo ProtectedRoute aceita as permissões das páginas que juntou. Leia sempre por tabPermissions().
   */
  permission?: string | string[];
  /** Só o CEO (não delegável por permissão). */
  ceoOnly?: boolean;
  /** Some no modo 'direto' (custódia/repasse desligados). */
  custodyOnly?: boolean;
  /** Aparece só no modo 'direto'. */
  directOnly?: boolean;
  /** custodyOnly que continua no modo 'direto' enquanto houver repasse/saque da custódia em aberto. */
  whileCustodyOpen?: boolean;
}

export interface AdminArea {
  key: AdminAreaKey;
  group: AdminGroup;
  label: string;
  icon: IconName;
  badge?: 'verifications';
  tabs: AdminTab[];
}

export interface AdminNavContext {
  can: (p: string) => boolean;
  isCeo: boolean;
  /** null enquanto o modo carrega ou quando a leitura falhou. */
  settlementMode: 'custodia' | 'direto' | null;
  /** GET /admin/custody-open (só conta no modo 'direto'). */
  custodyOpen: boolean;
}

export const ADMIN_GROUPS: AdminGroup[] = ['Operação', 'Pessoas', 'Dinheiro', 'Comunicação', 'Configuração'];

export const ADMIN_AREAS: AdminArea[] = [
  {
    key: 'numeros', group: 'Operação', label: 'Números do negócio', icon: 'chart-bar',
    tabs: [
      { key: 'visao-geral', label: 'Visão geral', href: '/admin/dashboard', permission: 'dashboard:view_all' },
      // Transitória: a P5 funde Análises na Visão geral (redirect /admin/analytics → /admin/dashboard).
      { key: 'analises', label: 'Análises', href: '/admin/analytics', permission: 'analytics:view_platform' },
    ],
  },
  {
    key: 'verificacoes', group: 'Pessoas', label: 'Verificações', icon: 'shield', badge: 'verifications',
    tabs: [{ key: 'verificacoes', label: 'Verificações', href: '/admin/verificacoes', permission: 'verification:view_queue' }],
  },
  {
    key: 'usuarios', group: 'Pessoas', label: 'Usuários', icon: 'users',
    tabs: [{ key: 'usuarios', label: 'Usuários', href: '/admin/users', permission: 'user:view_all' }],
  },
  {
    key: 'lojas', group: 'Pessoas', label: 'Lojas', icon: 'store',
    tabs: [
      { key: 'planos', label: 'Planos', href: '/admin/plan-approvals', permission: 'plan:view', custodyOnly: true },
      { key: 'asaas', label: 'Asaas e mensalidades', href: '/admin/lojas-asaas', ceoOnly: true, directOnly: true },
    ],
  },
  {
    key: 'dinheiro', group: 'Dinheiro', label: 'Dinheiro', icon: 'wallet',
    tabs: [
      { key: 'repasses', label: 'Repasses', href: '/admin/payouts', permission: 'payout:view', custodyOnly: true, whileCustodyOpen: true },
      { key: 'saques', label: 'Saques', href: '/admin/withdrawals', permission: 'withdrawal:view', custodyOnly: true, whileCustodyOpen: true },
      { key: 'estornos', label: 'Estornos', href: '/admin/estornos', permission: 'payout:view', directOnly: true },
      { key: 'carteiras', label: 'Carteiras', href: '/admin/wallets', permission: 'wallet:view_all', custodyOnly: true },
      { key: 'caixa', label: 'Caixa', href: '/admin/app-cashbox', permission: 'cashbox:view', custodyOnly: true },
      { key: 'pix', label: 'Pix aos motoboys', href: '/admin/transfers', permission: 'payout:view', directOnly: true },
    ],
  },
  {
    key: 'suporte', group: 'Comunicação', label: 'Suporte', icon: 'headphones',
    tabs: [
      { key: 'atendimento', label: 'Atendimento', href: '/admin/suporte', permission: 'support:attend' },
      // Transitória: a P2 (Suporte) funde como filtro "Conversas entre usuários"; a P5 faz o redirect.
      { key: 'conversas', label: 'Conversas entre usuários', href: '/admin/conversas', permission: 'conversations:view_all' },
    ],
  },
  {
    key: 'comunicacao', group: 'Comunicação', label: 'Avisos e broadcasts', icon: 'megaphone',
    tabs: [
      { key: 'broadcasts', label: 'Broadcasts', href: '/admin/broadcasts', permission: 'broadcast:send' },
      { key: 'avisos', label: 'Avisos da home', href: '/admin/avisos', ceoOnly: true },
      { key: 'cupons', label: 'Cupons', href: '/admin/coupons', ceoOnly: true },
    ],
  },
  {
    key: 'regras', group: 'Configuração', label: 'Regras e taxas', icon: 'percent',
    tabs: [
      { key: 'taxas', label: 'Taxas e tempos', href: '/admin/settings', permission: 'settings:manage' },
      // D1: ranking-config virou a aba Ranking de /admin/settings (redirect na P5).
      { key: 'ranking', label: 'Ranking', href: '/admin/settings?aba=ranking', permission: 'ranking:manage' },
      // D4: a troca de modo sai de Freios; só o CEO (o servidor também confere: CEO_ONLY).
      { key: 'modo', label: 'Modo da plataforma', href: '/admin/settings?aba=modo', ceoOnly: true },
    ],
  },
  {
    key: 'freios', group: 'Configuração', label: 'Freios', icon: 'pause',
    tabs: [{ key: 'freios', label: 'Freios', href: '/admin/freios', permission: 'settings:manage' }],
  },
  {
    key: 'permissoes', group: 'Configuração', label: 'Permissões', icon: 'lock',
    tabs: [{ key: 'permissoes', label: 'Permissões', href: '/admin/permissoes', ceoOnly: true }],
  },
  {
    key: 'tema', group: 'Configuração', label: 'Tema sazonal', icon: 'palette',
    tabs: [{ key: 'tema', label: 'Tema sazonal', href: '/admin/seasonal-theme', permission: 'theme:edit' }],
  },
];

/** Títulos de páginas que existem mas ficam fora do menu (órfãs até o redirect da P5). */
const OFF_MENU_TITLES: Record<string, string> = {
  '/admin/pricing-config': 'Planos de preço',
  '/admin/ranking-config': 'Regras e taxas · Ranking',
};

const pathOf = (href: string) => href.split('?')[0];
const abaOf = (href: string) => new URLSearchParams(href.split('?')[1] ?? '').get('aba');

/** Permissões da aba como lista (vazia = ninguém além do CEO). Usada por P2 e P5; não ler `tab.permission` direto. */
export function tabPermissions(tab: Pick<AdminTab, 'permission'>): string[] {
  const p = tab.permission;
  if (!p) return [];
  return Array.isArray(p) ? [...p] : [p];
}

function roleAllows(tab: AdminTab, ctx: AdminNavContext): boolean {
  if (ctx.isCeo) return true;
  if (tab.ceoOnly) return false;
  return tabPermissions(tab).some((p) => ctx.can(p));
}

function modeAllows(tab: AdminTab, ctx: AdminNavContext): boolean {
  if (tab.custodyOnly) {
    if (ctx.settlementMode === 'custodia') return true;
    return ctx.settlementMode === 'direto' && !!tab.whileCustodyOpen && ctx.custodyOpen;
  }
  if (tab.directOnly) return ctx.settlementMode === 'direto';
  return true;
}

export function isAdminTabVisible(tab: AdminTab, ctx: AdminNavContext): boolean {
  return roleAllows(tab, ctx) && modeAllows(tab, ctx);
}

/** Áreas com ao menos uma aba visível, cada uma só com as abas visíveis (na ordem da tabela). */
export function visibleAdminAreas(ctx: AdminNavContext): AdminArea[] {
  return ADMIN_AREAS
    .map((a) => ({ ...a, tabs: a.tabs.filter((t) => isAdminTabVisible(t, ctx)) }))
    .filter((a) => a.tabs.length > 0);
}

export function adminAreaForPath(pathname: string): AdminAreaKey | null {
  const area = ADMIN_AREAS.find((a) => a.tabs.some((t) => pathOf(t.href) === pathname));
  return area ? area.key : null;
}

/** Destino do item do menu: a primeira aba (passe a área de `visibleAdminAreas` para ser a primeira visível). */
export function adminAreaHref(area: AdminArea): string {
  return area.tabs[0].href;
}

export function activeAdminTabKey(
  area: AdminArea,
  pathname: string,
  query?: Record<string, string | string[] | undefined>,
): string | null {
  const same = area.tabs.filter((t) => pathOf(t.href) === pathname);
  if (same.length === 0) return null;
  const cur = typeof query?.aba === 'string' ? query.aba : null;
  const exact = cur ? same.find((t) => abaOf(t.href) === cur) : undefined;
  if (exact) return exact.key;
  const plain = same.find((t) => abaOf(t.href) === null);
  return plain ? plain.key : null;
}

/** Título do cabeçalho: "Dinheiro · Repasses"; área de uma aba só usa o nome da área. */
export function adminScreenTitle(pathname: string): string {
  if (OFF_MENU_TITLES[pathname]) return OFF_MENU_TITLES[pathname];
  const area = ADMIN_AREAS.find((a) => a.tabs.some((t) => pathOf(t.href) === pathname));
  if (!area) return 'Administração';
  const tab = area.tabs.find((t) => pathOf(t.href) === pathname && abaOf(t.href) === null)
    ?? area.tabs.find((t) => pathOf(t.href) === pathname)!;
  return area.tabs.length > 1 ? `${area.label} · ${tab.label}` : area.label;
}

export function isAdminPanelRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export const ADMIN_ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO',
  marketing: 'Marketing',
  gerente_geral: 'Gerente geral',
  gerente_clientes: 'Gerente de clientes',
  gerente_lojistas: 'Gerente de lojistas',
  gerente_motoboys: 'Gerente de motoboys',
};

export function adminRoleLabel(role?: string): string {
  return (role && ADMIN_ROLE_LABELS[role]) || 'Equipe';
}
