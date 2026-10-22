/**
 * Catálogo das permissões (22/10): a fonte única do que cada caixinha de /admin/permissoes libera.
 *  - `opens`: abre um item do menu do admin (`area` e, quando a área tem várias abas, `tab`, as chaves de
 *    frontend/lib/adminNav.ts). `audience` diz o público quando a tela é filtrada por ele;
 *  - `action`: ação dentro de uma tela; sozinha não aparece no painel e precisa de uma das chaves de `requires`;
 *  - `app`: uso próprio do cliente, da loja ou do motoboy, fora do painel.
 * O frontend recebe isso em GET /role-permissions (`allPermissions`, sem as chaves `app`), com `description` (o "?" da
 * tela) e o grupo do menu em `category`.
 *
 * Caixinha sem tela sai da lista (RETIRED_PERMISSIONS): não é apagada das linhas do banco, para não quebrar
 * nada, e a validação do PUT a aceita sem erro.
 */

export type PermissionKind = 'opens' | 'action' | 'app';

export interface PermissionDef {
  key: string;
  label: string;
  /** Grupo da tela Permissões, na ordem do menu do admin (Parte 2): "Operação ao vivo", "Usuários"… */
  category: string;
  /** Subgrupo dentro de Dinheiro: Visão geral, Repasses, Saques, Caixa, Carteiras. */
  subgroup?: string;
  kind: PermissionKind;
  /** Item do menu do admin (chave de ADMIN_AREAS no frontend). */
  area?: string;
  /** Aba da área, quando a área tem mais de uma. */
  tab?: string;
  /** Público da tela, quando ela é filtrada por público ("motoboys"). */
  audience?: string;
  /** Ação: qualquer uma destas abre a tela onde a ação mora. */
  requires?: string[];
  /** O "?" da tela: o que a caixinha abre ou permite, e o que não permite, em português simples. */
  description?: string;
}

const opens = (key: string, label: string, category: string, area: string, description: string, extra: Partial<PermissionDef> = {}): PermissionDef =>
  ({ key, label, category, kind: 'opens', area, description, ...extra });
const action = (key: string, label: string, category: string, area: string, requires: string[], description: string, extra: Partial<PermissionDef> = {}): PermissionDef =>
  ({ key, label, category, kind: 'action', area, requires, description, ...extra });
const app = (key: string, label: string): PermissionDef => ({ key, label, category: 'Uso no app', kind: 'app' });

const USER_VIEW = ['user:view_all', 'user:view_clients', 'user:view_motoboys'];
const WALLET_VIEW = ['wallet:view_all', 'wallet:view_clients', 'wallet:view_stores', 'wallet:view_motoboys'];

/** Grupos da tela Permissões, na ordem do menu do admin. */
export const PERMISSION_GROUPS = [
  'Operação ao vivo', 'Verificações', 'Usuários', 'Lojas e planos', 'Dinheiro',
  'Suporte e conversas', 'Avisos e notificações', 'Regras e taxas', 'Tema sazonal',
];
const OPS = 'Operação ao vivo';
const VERIF = 'Verificações';
const USERS = 'Usuários';
const STORES = 'Lojas e planos';
const MONEY = 'Dinheiro';
const SUPPORT = 'Suporte e conversas';
const NOTICES = 'Avisos e notificações';
const RULES = 'Regras e taxas';
const THEME = 'Tema sazonal';

// Todas as permissões oferecidas no painel, agrupadas pelo menu.
export const ALL_PERMISSIONS: PermissionDef[] = [
  // Operação ao vivo (D3b-1): padrão só CEO (via '*'); concedíveis em Permissões. Fora de CEO_ONLY_PERMISSIONS.
  opens('operation:view', 'Ver a operação ao vivo (fila, pedidos e mapa)', OPS, 'operacao',
    'Abre Precisa de mim, Pedidos ao vivo e Mapa ao vivo. Só olha: cancelar ou trocar o motoboy são caixinhas à parte.'),
  action('order:admin_cancel', 'Cancelar pedido com estorno, escolhendo a culpa', OPS, 'operacao', ['operation:view'],
    'Cancela um pedido pelo painel, com estorno ao cliente, e escolhe de quem foi a culpa. Precisa de Ver a operação ao vivo.'),
  action('order:reassign', 'Reatribuir o motoboy de um pedido antes da retirada', OPS, 'operacao', ['operation:view'],
    'Troca o motoboy de um pedido que ainda não foi retirado na loja. Precisa de Ver a operação ao vivo.'),
  opens('dashboard:view_all', 'Ver dashboard completo', OPS, 'numeros',
    'Abre Números do negócio: vendas, pedidos e crescimento da plataforma inteira. Só leitura.'),
  opens('analytics:view_platform', 'Ver analytics da plataforma', OPS, 'numeros',
    'Abre Números do negócio com as análises da plataforma. Só leitura.'),
  // Verificações (KYC): cada review_* abre a tela só com a fila do seu tipo.
  opens('verification:view_queue', 'Ver fila de verificações', VERIF, 'verificacoes',
    'Abre Verificações e mostra quantos documentos esperam. Aprovar ou recusar depende das caixinhas Verificar.'),
  opens('verification:review_clients', 'Verificar documentos de clientes', VERIF, 'verificacoes',
    'Abre Verificações só com a fila de clientes. Aprova ou recusa o documento do cliente.', { audience: 'clientes' }),
  opens('verification:review_stores', 'Verificar lojas (CNPJ/endereço/facial)', VERIF, 'verificacoes',
    'Abre Verificações só com a fila de lojas. Aprova ou recusa CNPJ, endereço e foto do dono.', { audience: 'lojas' }),
  opens('verification:review_motoboys', 'Verificar motoboys (CNH/placa)', VERIF, 'verificacoes',
    'Abre Verificações só com a fila de motoboys. Aprova ou recusa CNH e placa.', { audience: 'motoboys' }),
  // Usuários
  opens('user:view_all', 'Ver todos os usuários', USERS, 'usuarios',
    'Abre Usuários com todas as abas, inclusive a equipe. Vê a ficha, mas não bloqueia nem muda papel.'),
  opens('user:view_clients', 'Ver clientes', USERS, 'usuarios',
    'Abre Usuários só com a aba Clientes. Vê a ficha, mas não edita.', { audience: 'clientes' }),
  action('user:edit_clients', 'Bloquear, desbloquear e desconectar clientes', USERS, 'usuarios', ['user:view_clients', 'user:view_all'],
    'Na ficha de um cliente: bloquear, desbloquear e desconectar. Não vale para a equipe. Precisa de Ver clientes.', { audience: 'clientes' }),
  opens('user:view_motoboys', 'Ver motoboys', USERS, 'usuarios',
    'Abre Usuários só com a aba Motoboys. Vê a ficha, mas não edita.', { audience: 'motoboys' }),
  action('user:edit_motoboys', 'Bloquear, desbloquear e desconectar motoboys', USERS, 'usuarios', ['user:view_motoboys', 'user:view_all'],
    'Na ficha de um motoboy: bloquear, desbloquear e desconectar. Não vale para a equipe. Precisa de Ver motoboys.', { audience: 'motoboys' }),
  action('user:manage_roles', 'Alterar cargo de usuários', USERS, 'usuarios', USER_VIEW,
    'Na ficha: muda os papéis da pessoa (cliente, lojista, motoboy). Papel de equipe só o CEO dá.'),
  action('user:block', 'Bloquear/desbloquear/desconectar usuários', USERS, 'usuarios', USER_VIEW,
    'Na ficha de qualquer pessoa de fora da equipe: bloquear, desbloquear e desconectar.'),
  // D3b-2a: padrão só CEO (via '*'); concedível em Permissões, como order:admin_cancel. Fora de CEO_ONLY_PERMISSIONS.
  action('user:debt_forgive', 'Perdoar dívida de cliente (multa de cancelamento)', USERS, 'usuarios', USER_VIEW,
    'Na ficha: perdoa a multa de cancelamento que o cliente deve. Ninguém perdoa a própria dívida.'),
  // Lojas e planos
  opens('store:view_all', 'Ver todas as lojas', STORES, 'lojas',
    'Abre Lojas: a lista e a ficha de cada loja. Só olha.', { tab: 'lojas' }),
  action('store:edit', 'Pausar e liberar lojas', STORES, 'lojas', ['store:view_all'],
    'Na ficha da loja: pausa ou libera as vendas, com motivo. Precisa de Ver todas as lojas.'),
  opens('plan:view', 'Ver assinaturas e mudanças de plano', STORES, 'lojas',
    'Abre Lojas · Planos com os pedidos de mudança de plano. Aprovar é outra caixinha.', { tab: 'planos' }),
  action('plan:approve', 'Aprovar/rejeitar mudança de plano', STORES, 'lojas', ['plan:view'],
    'Aprova ou recusa o pedido de troca de plano da loja. Precisa de Ver assinaturas e mudanças de plano.'),
  action('plan:manage', 'Alterar plano de loja / planos de preço', STORES, 'lojas', ['store:view_all'],
    'Na ficha da loja: estende o teste e cancela a mensalidade. Precisa de Ver todas as lojas.'),
  // Rodada final: volta à tela (a rota DELETE /admin/ratings/:orderId/reply exige a chave).
  action('reviews:moderate', 'Apagar resposta de loja em avaliação', STORES, 'lojas', ['store:view_all'],
    'Apaga a resposta que a loja deu a uma avaliação de cliente. A nota e o comentário do cliente ficam. Precisa de Ver todas as lojas.'),
  // Dinheiro · Visão geral (D3b-3): padrão só CEO (via '*'); concedível em Permissões.
  opens('money:overview', 'Ver a visão geral do dinheiro e o histórico de ações', MONEY, 'dinheiro',
    'Abre Dinheiro · Visão geral e Histórico: quanto entrou, quanto saiu e quem fez cada ação. Só leitura.',
    { tab: 'visao-geral', subgroup: 'Visão geral' }),
  // Dinheiro · Repasses
  opens('payout:view', 'Ver repasses e obrigações', MONEY, 'dinheiro',
    'Abre Dinheiro · Repasses (e, no modo direto, Estornos e Pix aos motoboys). Só olha.', { tab: 'repasses', subgroup: 'Repasses' }),
  action('payout:release', 'Liberar repasse', MONEY, 'dinheiro', ['payout:view'],
    'Libera o repasse para a loja ou o motoboy receber. Precisa de Ver repasses.', { subgroup: 'Repasses' }),
  action('payout:block', 'Bloquear/desbloquear repasse', MONEY, 'dinheiro', ['payout:view'],
    'Segura ou solta um repasse. Precisa de Ver repasses.', { subgroup: 'Repasses' }),
  action('payout:mark_paid', 'Marcar repasse como pago', MONEY, 'dinheiro', ['payout:view'],
    'Marca como pago um repasse feito por fora. Precisa de Ver repasses.', { subgroup: 'Repasses' }),
  action('payout:config', 'Configurar aprovação automática de repasses', MONEY, 'dinheiro', ['payout:view'],
    'Liga ou desliga a liberação automática de repasses. Precisa de Ver repasses.', { subgroup: 'Repasses' }),
  // Dinheiro · Saques
  opens('withdrawal:view', 'Ver saques de lojas/motoboys', MONEY, 'dinheiro',
    'Abre Dinheiro · Saques com os pedidos de saque de lojas e motoboys. Só olha.', { tab: 'saques', subgroup: 'Saques' }),
  action('withdrawal:approve', 'Aprovar/rejeitar saques de lojas/motoboys', MONEY, 'dinheiro', ['withdrawal:view'],
    'Aprova ou recusa um pedido de saque. Precisa de Ver saques.', { subgroup: 'Saques' }),
  action('withdrawal:config', 'Configurar aprovação automática de saques', MONEY, 'dinheiro', ['withdrawal:view'],
    'Liga ou desliga a aprovação automática de saques. Precisa de Ver saques.', { subgroup: 'Saques' }),
  // Dinheiro · Caixa do app
  opens('cashbox:view', 'Ver caixa do app e extrato', MONEY, 'dinheiro',
    'Abre Dinheiro · Caixa: saldo e extrato do caixa da DROP. Só olha.', { tab: 'caixa', subgroup: 'Caixa' }),
  action('cashbox:deposit', 'Registrar depósito no caixa', MONEY, 'dinheiro', ['cashbox:view'],
    'Registra um depósito feito no caixa. Precisa de Ver caixa do app.', { subgroup: 'Caixa' }),
  action('cashbox:withdraw', 'Solicitar saque do caixa', MONEY, 'dinheiro', ['cashbox:view'],
    'Pede um saque do caixa, que outra pessoa aprova. Precisa de Ver caixa do app.', { subgroup: 'Caixa' }),
  action('cashbox:approve_withdrawal', 'Aprovar/rejeitar saque do caixa', MONEY, 'dinheiro', ['cashbox:view'],
    'Aprova ou recusa o saque pedido do caixa. Precisa de Ver caixa do app.', { subgroup: 'Caixa' }),
  // Dinheiro · Carteiras
  opens('wallet:view_all', 'Ver todas as carteiras', MONEY, 'dinheiro',
    'Abre Dinheiro · Carteiras com todas as carteiras. O extrato de um cliente pede a aprovação dele.',
    { tab: 'carteiras', subgroup: 'Carteiras' }),
  opens('wallet:view_clients', 'Ver carteiras de clientes', MONEY, 'dinheiro',
    'Abre Dinheiro · Carteiras só com carteiras de clientes. O extrato pede a aprovação do cliente.',
    { tab: 'carteiras', audience: 'clientes', subgroup: 'Carteiras' }),
  opens('wallet:view_stores', 'Ver carteiras de lojas', MONEY, 'dinheiro',
    'Abre Dinheiro · Carteiras só com carteiras de lojas. Não mexe no saldo.',
    { tab: 'carteiras', audience: 'lojas', subgroup: 'Carteiras' }),
  opens('wallet:view_motoboys', 'Ver carteiras de motoboys', MONEY, 'dinheiro',
    'Abre Dinheiro · Carteiras só com carteiras de motoboys. Não mexe no saldo.',
    { tab: 'carteiras', audience: 'motoboys', subgroup: 'Carteiras' }),
  action('wallet:credit', 'Creditar carteira (somente CEO, não delegável)', MONEY, 'dinheiro', ['wallet:view_all'],
    'Ajusta o saldo de uma carteira. Só o CEO; não dá para delegar.', { subgroup: 'Carteiras' }),
  action('wallet:request_access', 'Solicitar acesso a carteiras de clientes', MONEY, 'dinheiro', WALLET_VIEW,
    'Pede ao cliente para ver o extrato da carteira dele. Precisa de uma das caixinhas Ver carteiras.', { subgroup: 'Carteiras' }),
  // Suporte e conversas
  opens('support:attend', 'Atender tickets de suporte', SUPPORT, 'suporte',
    'Abre Suporte para responder os chamados de clientes, lojas e motoboys.'),
  opens('conversations:view_all', 'Ver todas as conversas', SUPPORT, 'suporte',
    'Abre Suporte com as conversas entre usuários (cliente, loja e motoboy). Só leitura.'),
  // Avisos e notificações
  opens('broadcast:send', 'Enviar broadcast', NOTICES, 'comunicacao',
    'Abre Avisos e broadcasts · Broadcasts para mandar notificação a um grupo. Para quem, se escolhe em "Pode enviar avisos para".',
    { tab: 'broadcasts' }),
  opens('banner:manage', 'Gerenciar banners', NOTICES, 'comunicacao',
    'Abre Avisos da home: publica, pausa e reordena os banners do carrossel da home.', { tab: 'avisos' }),
  // Regras e taxas
  opens('settings:manage', 'Editar configurações da plataforma', RULES, 'regras',
    'Abre Regras e taxas (taxas e tempos) e Freios. Muda regras que valem para todo mundo.', { tab: 'taxas' }),
  opens('ranking:manage', 'Configurar prêmios de ranking', RULES, 'regras',
    'Abre Regras e taxas · Ranking para definir os prêmios do ranking.', { tab: 'ranking' }),
  // Tema sazonal
  opens('theme:edit', 'Editar temas sazonais', THEME, 'tema',
    'Abre Tema sazonal para trocar as cores e a arte do app em datas especiais.'),
  // Uso no app (cliente, loja e motoboy), fora do painel. Não vai para a tela (Parte 2): esses papéis são fixos.
  app('store:view_own', 'Ver própria loja'),
  app('store:edit_own', 'Editar própria loja'),
  app('product:create_own', 'Criar produto'),
  app('product:edit_own', 'Editar produto'),
  app('product:delete_own', 'Excluir produto'),
  app('order:create', 'Criar pedido'),
  app('order:view_own', 'Ver próprios pedidos'),
  app('order:cancel_own', 'Cancelar próprio pedido'),
  app('wallet:view_own', 'Ver própria carteira'),
  app('delivery:view_own', 'Ver próprias entregas'),
  app('delivery:accept', 'Aceitar entrega'),
  app('delivery:complete', 'Completar entrega'),
  app('gamification:redeem_benefit', 'Resgatar benefício'),
  app('address:manage_own', 'Gerenciar endereços'),
];

/** O catálogo da tela Permissões: sem as chaves de uso no app (esses papéis não aparecem lá). */
export const PANEL_PERMISSIONS: PermissionDef[] = ALL_PERMISSIONS.filter((p) => p.kind !== 'app');

/** O "?" do cabeçalho de cada papel na tela Permissões. */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  ceo: 'CEO: tem todas as permissões, inclusive as que não se delegam. Não aparece com caixinhas.',
  marketing: 'Marketing: cuida da comunicação com o público: banners da home, broadcasts e tema sazonal.',
  gerente_geral: 'Gerente geral: acompanha toda a operação: pessoas, lojas, carteiras, números e verificações.',
  gerente_clientes: 'Gerente de clientes: cuida dos clientes: cadastro, verificação de documento, ficha e carteira.',
  gerente_lojistas: 'Gerente de lojistas: cuida das lojas: cadastro, verificação de CNPJ e endereço, ficha, planos e carteira.',
  gerente_motoboys: 'Gerente de motoboys: cuida dos entregadores: cadastro, verificação, ficha e repasses.',
};

/**
 * Caixinhas sem tela no painel: saem da lista. O PUT aceita sem erro, mas grava a linha SEM elas, e a leitura das
 * permissões da equipe também as descarta: uma chave que não aparece não pode continuar valendo escondida.
 * Consequência: gateway:manage e order:manage_payment ficam só com o CEO (via '*').
 *  - métricas por público: "Números do negócio" é um bloco único (dashboard:view_all);
 *  - notification:*: não há rota de criar, aprovar ou rejeitar notificação (o envio é o broadcast);
 *  - coupon:create_global: a tela e a rota de cupons são do CEO por papel, não por permissão;
 *  - gateway:manage e order:manage_payment: só rotas, sem tela; wallet:transfer: nenhuma rota usa.
 */
export const RETIRED_PERMISSIONS: string[] = [
  'dashboard:view_client_metrics', 'dashboard:view_store_metrics', 'dashboard:view_motoboy_metrics',
  'notification:create', 'notification:approve', 'notification:reject',
  'coupon:create_global',
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
  // Editar um público só vale com a chave de ver o mesmo público (como o `requires` do catálogo).
  const sees = (a: Audience) => family !== 'userEdit' || allowedAudiences(perms, 'user').audiences.includes(a);
  return { all: false, audiences: AUDIENCES.filter((a) => !!f.by[a] && perms.includes(f.by[a] as string) && sees(a)) };
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
