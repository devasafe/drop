/**
 * Catálogo das permissões (22/10): a fonte única do que cada caixinha de /admin/permissoes libera.
 *  - `opens`: abre um item do menu do admin (`area` e, quando a área tem várias abas, `tab`, as chaves de
 *    frontend/lib/adminNav.ts). `audience` diz o público quando a tela é filtrada por ele;
 *  - `action`: ação dentro de uma tela; sozinha não aparece no painel e precisa de uma das chaves de `requires`;
 *  - `app`: uso próprio do cliente, da loja ou do motoboy, fora do painel.
 * O frontend recebe isso em GET /role-permissions (`allPermissions`).
 *
 * Caixinha sem tela sai da lista (RETIRED_PERMISSIONS): não é apagada das linhas do banco, para não quebrar
 * nada, e a validação do PUT a aceita sem erro.
 */

export type PermissionKind = 'opens' | 'action' | 'app';

export interface PermissionDef {
  key: string;
  label: string;
  category: string;
  kind: PermissionKind;
  /** Item do menu do admin (chave de ADMIN_AREAS no frontend). */
  area?: string;
  /** Aba da área, quando a área tem mais de uma. */
  tab?: string;
  /** Público da tela, quando ela é filtrada por público ("motoboys"). */
  audience?: string;
  /** Ação: qualquer uma destas abre a tela onde a ação mora. */
  requires?: string[];
}

const opens = (key: string, label: string, category: string, area: string, extra: Partial<PermissionDef> = {}): PermissionDef =>
  ({ key, label, category, kind: 'opens', area, ...extra });
const action = (key: string, label: string, category: string, area: string, requires: string[], extra: Partial<PermissionDef> = {}): PermissionDef =>
  ({ key, label, category, kind: 'action', area, requires, ...extra });
const app = (key: string, label: string, category: string): PermissionDef => ({ key, label, category, kind: 'app' });

const USER_VIEW = ['user:view_all', 'user:view_clients', 'user:view_motoboys'];
const WALLET_VIEW = ['wallet:view_all', 'wallet:view_clients', 'wallet:view_stores', 'wallet:view_motoboys'];
const APP = 'Uso no app';

// Todas as permissões oferecidas no painel
export const ALL_PERMISSIONS: PermissionDef[] = [
  // Notificações
  opens('broadcast:send', 'Enviar broadcast', 'Notificações', 'comunicacao', { tab: 'broadcasts' }),
  // Usuários
  opens('user:view_all', 'Ver todos os usuários', 'Usuários', 'usuarios'),
  opens('user:view_clients', 'Ver clientes', 'Usuários', 'usuarios', { audience: 'clientes' }),
  action('user:edit_clients', 'Bloquear, desbloquear e desconectar clientes', 'Usuários', 'usuarios', ['user:view_clients', 'user:view_all'], { audience: 'clientes' }),
  opens('user:view_motoboys', 'Ver motoboys', 'Usuários', 'usuarios', { audience: 'motoboys' }),
  action('user:edit_motoboys', 'Bloquear, desbloquear e desconectar motoboys', 'Usuários', 'usuarios', ['user:view_motoboys', 'user:view_all'], { audience: 'motoboys' }),
  // Usuários (administração)
  action('user:manage_roles', 'Alterar cargo de usuários', 'Usuários', 'usuarios', USER_VIEW),
  action('user:block', 'Bloquear/desbloquear/desconectar usuários', 'Usuários', 'usuarios', USER_VIEW),
  // D3b-2a: padrão só CEO (via '*'); concedível em Permissões, como order:admin_cancel. Fora de CEO_ONLY_PERMISSIONS.
  action('user:debt_forgive', 'Perdoar dívida de cliente (multa de cancelamento)', 'Usuários', 'usuarios', USER_VIEW),
  // Lojas
  opens('store:view_all', 'Ver todas as lojas', 'Lojas', 'lojas', { tab: 'lojas' }),
  action('store:edit', 'Pausar e liberar lojas', 'Lojas', 'lojas', ['store:view_all']),
  // Planos e assinaturas
  opens('plan:view', 'Ver assinaturas e mudanças de plano', 'Planos', 'lojas', { tab: 'planos' }),
  action('plan:approve', 'Aprovar/rejeitar mudança de plano', 'Planos', 'lojas', ['plan:view']),
  action('plan:manage', 'Alterar plano de loja / planos de preço', 'Planos', 'lojas', ['store:view_all']),
  // Carteira
  opens('wallet:view_all', 'Ver todas as carteiras', 'Carteira', 'dinheiro', { tab: 'carteiras' }),
  opens('wallet:view_clients', 'Ver carteiras de clientes', 'Carteira', 'dinheiro', { tab: 'carteiras', audience: 'clientes' }),
  opens('wallet:view_stores', 'Ver carteiras de lojas', 'Carteira', 'dinheiro', { tab: 'carteiras', audience: 'lojas' }),
  opens('wallet:view_motoboys', 'Ver carteiras de motoboys', 'Carteira', 'dinheiro', { tab: 'carteiras', audience: 'motoboys' }),
  action('wallet:credit', 'Creditar carteira (somente CEO, não delegável)', 'Carteira', 'dinheiro', ['wallet:view_all']),
  action('wallet:request_access', 'Solicitar acesso a carteiras de clientes', 'Carteira', 'dinheiro', WALLET_VIEW),
  // Números do negócio
  opens('dashboard:view_all', 'Ver dashboard completo', 'Dashboard', 'numeros'),
  opens('analytics:view_platform', 'Ver analytics da plataforma', 'Analytics', 'numeros'),
  // Marketing
  opens('banner:manage', 'Gerenciar banners', 'Marketing', 'comunicacao', { tab: 'avisos' }),
  opens('theme:edit', 'Editar temas sazonais', 'Marketing', 'tema'),
  // Suporte e conversas
  opens('support:attend', 'Atender tickets de suporte', 'Suporte', 'suporte'),
  opens('conversations:view_all', 'Ver todas as conversas', 'Conversas', 'suporte'),
  // Verificação (KYC): cada review_* abre a tela só com a fila do seu tipo.
  opens('verification:view_queue', 'Ver fila de verificações', 'Verificação (KYC)', 'verificacoes'),
  opens('verification:review_clients', 'Verificar documentos de clientes', 'Verificação (KYC)', 'verificacoes', { audience: 'clientes' }),
  opens('verification:review_stores', 'Verificar lojas (CNPJ/endereço/facial)', 'Verificação (KYC)', 'verificacoes', { audience: 'lojas' }),
  opens('verification:review_motoboys', 'Verificar motoboys (CNH/placa)', 'Verificação (KYC)', 'verificacoes', { audience: 'motoboys' }),
  // Financeiro — Repasses (payouts)
  opens('payout:view', 'Ver repasses e obrigações', 'Financeiro — Repasses', 'dinheiro', { tab: 'repasses' }),
  action('payout:release', 'Liberar repasse', 'Financeiro — Repasses', 'dinheiro', ['payout:view']),
  action('payout:block', 'Bloquear/desbloquear repasse', 'Financeiro — Repasses', 'dinheiro', ['payout:view']),
  action('payout:mark_paid', 'Marcar repasse como pago', 'Financeiro — Repasses', 'dinheiro', ['payout:view']),
  action('payout:config', 'Configurar aprovação automática de repasses', 'Financeiro — Repasses', 'dinheiro', ['payout:view']),
  // Financeiro — Caixa do app
  opens('cashbox:view', 'Ver caixa do app e extrato', 'Financeiro — Caixa do app', 'dinheiro', { tab: 'caixa' }),
  action('cashbox:deposit', 'Registrar depósito no caixa', 'Financeiro — Caixa do app', 'dinheiro', ['cashbox:view']),
  action('cashbox:withdraw', 'Solicitar saque do caixa', 'Financeiro — Caixa do app', 'dinheiro', ['cashbox:view']),
  action('cashbox:approve_withdrawal', 'Aprovar/rejeitar saque do caixa', 'Financeiro — Caixa do app', 'dinheiro', ['cashbox:view']),
  // Financeiro — Saques de recebedores
  opens('withdrawal:view', 'Ver saques de lojas/motoboys', 'Financeiro — Saques', 'dinheiro', { tab: 'saques' }),
  action('withdrawal:approve', 'Aprovar/rejeitar saques de lojas/motoboys', 'Financeiro — Saques', 'dinheiro', ['withdrawal:view']),
  action('withdrawal:config', 'Configurar aprovação automática de saques', 'Financeiro — Saques', 'dinheiro', ['withdrawal:view']),
  // Financeiro — Visão geral (D3b-3): padrão só CEO (via '*'); concedível em Permissões.
  opens('money:overview', 'Ver a visão geral do dinheiro e o histórico de ações', 'Financeiro — Visão geral', 'dinheiro', { tab: 'visao-geral' }),
  // Configurações da plataforma
  opens('settings:manage', 'Editar configurações da plataforma', 'Configurações', 'regras', { tab: 'taxas' }),
  opens('ranking:manage', 'Configurar prêmios de ranking', 'Configurações', 'regras', { tab: 'ranking' }),
  // Operação (D3b-1): padrão só CEO (via '*'); concedíveis em Permissões. Fora de CEO_ONLY_PERMISSIONS.
  opens('operation:view', 'Ver a operação ao vivo (fila, pedidos e mapa)', 'Operação', 'operacao'),
  action('order:admin_cancel', 'Cancelar pedido com estorno, escolhendo a culpa', 'Operação', 'operacao', ['operation:view']),
  action('order:reassign', 'Reatribuir o motoboy de um pedido antes da retirada', 'Operação', 'operacao', ['operation:view']),
  // Uso no app (cliente, loja e motoboy), fora do painel
  app('store:view_own', 'Ver própria loja', APP),
  app('store:edit_own', 'Editar própria loja', APP),
  app('product:create_own', 'Criar produto', APP),
  app('product:edit_own', 'Editar produto', APP),
  app('product:delete_own', 'Excluir produto', APP),
  app('order:create', 'Criar pedido', APP),
  app('order:view_own', 'Ver próprios pedidos', APP),
  app('order:cancel_own', 'Cancelar próprio pedido', APP),
  app('wallet:view_own', 'Ver própria carteira', APP),
  app('delivery:view_own', 'Ver próprias entregas', APP),
  app('delivery:accept', 'Aceitar entrega', APP),
  app('delivery:complete', 'Completar entrega', APP),
  app('gamification:redeem_benefit', 'Resgatar benefício', APP),
  app('address:manage_own', 'Gerenciar endereços', APP),
];

/**
 * Caixinhas sem tela no painel: saem da lista, mas continuam válidas no PUT e nas linhas do banco.
 *  - métricas por público: "Números do negócio" é um bloco único (dashboard:view_all);
 *  - notification:*: não há rota de criar, aprovar ou rejeitar notificação (o envio é o broadcast);
 *  - coupon:create_global: a tela e a rota de cupons são do CEO por papel, não por permissão;
 *  - reviews:moderate: a rota de moderação existe, mas não há tela no admin;
 *  - gateway:manage e order:manage_payment: só rotas, sem tela; wallet:transfer: nenhuma rota usa.
 */
export const RETIRED_PERMISSIONS: string[] = [
  'dashboard:view_client_metrics', 'dashboard:view_store_metrics', 'dashboard:view_motoboy_metrics',
  'notification:create', 'notification:approve', 'notification:reject',
  'coupon:create_global', 'reviews:moderate',
  'gateway:manage', 'order:manage_payment', 'wallet:transfer',
];

// ─── Público ───────────────────────────────────────────────────────────────

export type Audience = 'cliente' | 'lojista' | 'motoboy' | 'equipe';
export const AUDIENCES: Audience[] = ['cliente', 'lojista', 'motoboy', 'equipe'];

/** Família de chaves por público: ver pessoas, ver carteiras, agir sobre pessoas. */
export type AudienceFamily = 'user' | 'wallet' | 'userEdit';

const FAMILY: Record<AudienceFamily, { all: string; by: Partial<Record<Audience, string>> }> = {
  user: { all: 'user:view_all', by: { cliente: 'user:view_clients', motoboy: 'user:view_motoboys' } },
  wallet: { all: 'wallet:view_all', by: { cliente: 'wallet:view_clients', lojista: 'wallet:view_stores', motoboy: 'wallet:view_motoboys' } },
  userEdit: { all: 'user:block', by: { cliente: 'user:edit_clients', motoboy: 'user:edit_motoboys' } },
};

export interface AudienceAccess {
  /** A chave "de tudo" (ou '*'): o comportamento de antes, sem filtro. */
  all: boolean;
  audiences: Audience[];
}

/** Públicos que as permissões liberam numa família. `all` mantém o comportamento de antes. */
export function allowedAudiences(perms: string[], family: AudienceFamily): AudienceAccess {
  const f = FAMILY[family];
  if (perms.includes('*') || perms.includes(f.all)) return { all: true, audiences: [...AUDIENCES] };
  return { all: false, audiences: AUDIENCES.filter((a) => !!f.by[a] && perms.includes(f.by[a] as string)) };
}

/** As chaves de uma família (para a guarda "qualquer uma"). */
export const familyKeys = (family: AudienceFamily): string[] => {
  const f = FAMILY[family];
  return [f.all, ...Object.values(f.by) as string[]];
};

const STAFF = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];

/**
 * Públicos de uma conta pelos papéis dela, como as abas de Usuários: cliente é quem não tem nenhum
 * outro papel; lojista, motoboy e equipe se somam.
 */
export function userAudiences(roles: string[]): Audience[] {
  const out: Audience[] = [];
  const isStaff = roles.some((r) => STAFF.includes(r));
  const isStore = roles.includes('lojista');
  const isCourier = roles.includes('motoboy');
  if (!isStaff && !isStore && !isCourier) out.push('cliente');
  if (isStore) out.push('lojista');
  if (isCourier) out.push('motoboy');
  if (isStaff) out.push('equipe');
  return out;
}

/**
 * A conta está ao alcance? Com a chave "de tudo", sim. Por público: precisa ter um público liberado
 * e não ser da equipe (conta da equipe só com a chave "de tudo").
 */
export function canReachUser(access: AudienceAccess, roles: string[]): boolean {
  if (access.all) return true;
  const target = userAudiences(roles);
  if (target.includes('equipe')) return false;
  return target.some((a) => access.audiences.includes(a));
}

/** Tipo de carteira → público. `user` é a carteira pessoal (de cliente). */
export const WALLET_OWNER_AUDIENCE: Record<string, Audience> = { user: 'cliente', store: 'lojista', motoboy: 'motoboy' };

export const AUDIENCE_FORBIDDEN = 'AUDIENCE_FORBIDDEN';
