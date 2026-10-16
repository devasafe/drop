import fs from 'fs';
import path from 'path';
import {
  ADMIN_AREAS, visibleAdminAreas, adminAreaForPath, adminAreaHref, activeAdminTabKey,
  adminScreenTitle, adminRoleLabel, isAdminPanelRoute,
  type AdminArea, type AdminNavContext,
} from '../adminNav';

/** Permissões padrão de cada papel: iguais a `rolePermissions` do backend (o 1º describe confere). */
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  marketing: ['notification:create', 'banner:manage', 'theme:edit'],
  gerente_geral: [
    'notification:create', 'notification:approve', 'notification:reject', 'user:view_all', 'store:view_all',
    'wallet:view_all', 'dashboard:view_all', 'verification:view_queue', 'verification:review_clients',
    'verification:review_stores', 'verification:review_motoboys', 'reviews:moderate',
  ],
  gerente_clientes: [
    'notification:create', 'user:view_clients', 'user:edit_clients', 'wallet:view_clients',
    'dashboard:view_client_metrics', 'verification:view_queue', 'verification:review_clients',
  ],
  gerente_lojistas: [
    'notification:create', 'store:view_all', 'store:edit', 'wallet:view_stores', 'dashboard:view_store_metrics',
    'verification:view_queue', 'verification:review_stores', 'reviews:moderate',
  ],
  gerente_motoboys: [
    'notification:create', 'user:view_motoboys', 'user:edit_motoboys', 'wallet:view_motoboys',
    'dashboard:view_motoboy_metrics', 'verification:view_queue', 'verification:review_motoboys',
  ],
};

/** Mesmo `can` do AuthContext: '*' libera tudo (o CEO é tratado à parte, como lá). */
const canFrom = (perms: string[]) => (p: string) => perms.includes('*') || perms.includes(p);
type Mode = AdminNavContext['settlementMode'];
const ctxFor = (role: string, mode: Mode, custodyOpen = false, perms?: string[]): AdminNavContext => ({
  can: role === 'ceo' ? () => true : canFrom(perms ?? DEFAULT_PERMISSIONS[role]),
  isCeo: role === 'ceo',
  settlementMode: mode,
  custodyOpen,
});
const view = (areas: AdminArea[]) => Object.fromEntries(areas.map((a) => [a.key, a.tabs.map((t) => t.key)]));
const menu = (role: string, mode: Mode, custodyOpen = false, perms?: string[]) =>
  view(visibleAdminAreas(ctxFor(role, mode, custodyOpen, perms)));

describe('permissões padrão (fixture = matriz do backend)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'utils', 'walletCalculations.ts'), 'utf8');
  const matrix = src.slice(src.indexOf('export const rolePermissions'));
  const backend = (role: string): string[] => {
    const m = new RegExp(`\\n\\s*${role}: \\[([^\\]]*)\\]`).exec(matrix);
    if (!m) throw new Error(`papel ${role} não achado em rolePermissions`);
    return Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1]);
  };
  it.each(Object.keys(DEFAULT_PERMISSIONS))('%s: igual ao backend', (role) => {
    expect(DEFAULT_PERMISSIONS[role]).toEqual(backend(role));
  });
});

describe('tabela do menu (spec 3.3)', () => {
  it('áreas na ordem do protótipo, com o grupo de cada uma', () => {
    expect(ADMIN_AREAS.map((a) => `${a.group}/${a.key}`)).toEqual([
      'Operação/numeros',
      'Pessoas/verificacoes', 'Pessoas/usuarios', 'Pessoas/lojas',
      'Dinheiro/dinheiro',
      'Comunicação/suporte', 'Comunicação/comunicacao',
      'Configuração/regras', 'Configuração/freios', 'Configuração/permissoes', 'Configuração/tema',
    ]);
  });

  it('só Verificações tem contador', () => {
    expect(ADMIN_AREAS.filter((a) => a.badge).map((a) => [a.key, a.badge])).toEqual([['verificacoes', 'verifications']]);
  });

  it('nenhuma aba de "Precisa de mim", "Pedidos ao vivo" ou "Mapa" (D3b)', () => {
    const labels = ADMIN_AREAS.flatMap((a) => [a.label, ...a.tabs.map((t) => t.label)]);
    for (const x of ['Precisa de mim', 'Pedidos ao vivo', 'Mapa de motoboys']) expect(labels).not.toContain(x);
  });

  it('chaves de aba únicas dentro de cada área', () => {
    for (const a of ADMIN_AREAS) expect(new Set(a.tabs.map((t) => t.key)).size).toBe(a.tabs.length);
  });
});

const CEO_CUSTODIA = {
  numeros: ['visao-geral', 'analises'],
  verificacoes: ['verificacoes'],
  usuarios: ['usuarios'],
  lojas: ['planos'],
  dinheiro: ['repasses', 'saques', 'carteiras', 'caixa'],
  suporte: ['atendimento', 'conversas'],
  comunicacao: ['broadcasts', 'avisos', 'cupons'],
  regras: ['taxas', 'ranking', 'modo'],
  freios: ['freios'],
  permissoes: ['permissoes'],
  tema: ['tema'],
};

describe('menu por papel e por modo (permissões padrão)', () => {
  it('CEO na custódia: tudo, menos as abas do modo direto', () => {
    expect(menu('ceo', 'custodia')).toEqual(CEO_CUSTODIA);
    expect(visibleAdminAreas(ctxFor('ceo', 'custodia')).map((a) => a.key)).toEqual(Object.keys(CEO_CUSTODIA));
  });

  it('CEO na custódia: custódia em aberto não muda nada', () => {
    expect(menu('ceo', 'custodia', true)).toEqual(CEO_CUSTODIA);
  });

  it('CEO no direto: Asaas, Estornos e Pix; sem Planos, Repasses, Saques, Carteiras e Caixa', () => {
    expect(menu('ceo', 'direto')).toEqual({ ...CEO_CUSTODIA, lojas: ['asaas'], dinheiro: ['estornos', 'pix'] });
  });

  it('CEO no direto com custódia em aberto: Repasses e Saques voltam (whileCustodyOpen); Carteiras e Caixa não', () => {
    expect(menu('ceo', 'direto', true)).toEqual({
      ...CEO_CUSTODIA, lojas: ['asaas'], dinheiro: ['repasses', 'saques', 'estornos', 'pix'],
    });
  });

  it('modo desconhecido (carregando ou erro): nenhuma aba de modo aparece, nem com custódia em aberto', () => {
    for (const open of [false, true]) {
      const m = menu('ceo', null, open);
      expect(m.lojas).toBeUndefined();
      expect(m.dinheiro).toBeUndefined();
      expect(m.usuarios).toEqual(['usuarios']);
    }
  });

  it.each(['custodia', 'direto'] as const)('marketing (%s): só Tema sazonal', (mode) => {
    expect(menu('marketing', mode)).toEqual({ tema: ['tema'] });
  });

  it('gerente geral na custódia: Números (sem Análises), Verificações, Usuários e Dinheiro · Carteiras', () => {
    expect(menu('gerente_geral', 'custodia')).toEqual({
      numeros: ['visao-geral'], verificacoes: ['verificacoes'], usuarios: ['usuarios'], dinheiro: ['carteiras'],
    });
  });

  it('gerente geral no direto: Carteiras some, e o Dinheiro inteiro some com ela', () => {
    for (const open of [false, true]) {
      expect(menu('gerente_geral', 'direto', open)).toEqual({
        numeros: ['visao-geral'], verificacoes: ['verificacoes'], usuarios: ['usuarios'],
      });
    }
  });

  it.each([
    ['gerente_clientes', 'custodia'], ['gerente_clientes', 'direto'],
    ['gerente_lojistas', 'custodia'], ['gerente_lojistas', 'direto'],
    ['gerente_motoboys', 'custodia'], ['gerente_motoboys', 'direto'],
  ] as const)('%s (%s): só Verificações', (role, mode) => {
    expect(menu(role, mode)).toEqual({ verificacoes: ['verificacoes'] });
  });

  it('papel sem nenhuma permissão: menu vazio', () => {
    expect(menu('gerente_lojistas', 'custodia', false, [])).toEqual({});
  });
});

describe('menu com permissões customizadas (/admin/permissoes)', () => {
  const extra = [...DEFAULT_PERMISSIONS.gerente_lojistas, 'plan:view', 'payout:view', 'withdrawal:view', 'support:attend'];

  it('custódia: ganha Planos, Repasses, Saques e Atendimento', () => {
    expect(menu('gerente_lojistas', 'custodia', false, extra)).toEqual({
      verificacoes: ['verificacoes'], lojas: ['planos'], dinheiro: ['repasses', 'saques'], suporte: ['atendimento'],
    });
  });

  it('direto: Estornos e Pix (payout:view); Asaas continua só do CEO', () => {
    expect(menu('gerente_lojistas', 'direto', false, extra)).toEqual({
      verificacoes: ['verificacoes'], dinheiro: ['estornos', 'pix'], suporte: ['atendimento'],
    });
  });

  it('direto com custódia em aberto: Repasses e Saques voltam', () => {
    expect(menu('gerente_lojistas', 'direto', true, extra).dinheiro).toEqual(['repasses', 'saques', 'estornos', 'pix']);
  });

  it("'*' libera toda permissão delegável, mas nunca o que é só do CEO", () => {
    const m = menu('marketing', 'custodia', false, ['*']);
    expect(m.permissoes).toBeUndefined();
    expect(m.comunicacao).toEqual(['broadcasts']);
    expect(m.dinheiro).toEqual(['repasses', 'saques', 'carteiras', 'caixa']);
    expect(menu('marketing', 'direto', false, ['*']).lojas).toBeUndefined();
  });

  it('a área aponta para a primeira aba visível ao papel', () => {
    const areas = visibleAdminAreas(ctxFor('gerente_geral', 'custodia'));
    expect(adminAreaHref(areas.find((a) => a.key === 'dinheiro')!)).toBe('/admin/wallets');
    const ceoDireto = visibleAdminAreas(ctxFor('ceo', 'direto'));
    expect(adminAreaHref(ceoDireto.find((a) => a.key === 'dinheiro')!)).toBe('/admin/estornos');
    expect(adminAreaHref(ceoDireto.find((a) => a.key === 'lojas')!)).toBe('/admin/lojas-asaas');
  });

  it('Modo da plataforma: só o CEO, em qualquer modo de liquidação (inclusive desconhecido)', () => {
    expect(menu('ceo', 'custodia').regras).toContain('modo');
    expect(menu('ceo', 'direto').regras).toContain('modo');
    expect(menu('ceo', null).regras).toContain('modo');
    expect(menu('gerente_lojistas', 'custodia', false, ['settings:manage', 'ranking:manage']).regras).toEqual(['taxas', 'ranking']);
    expect(menu('marketing', 'direto', false, ['*']).regras).toEqual(['taxas', 'ranking']);
  });
});

describe('rotas, abas ativas e títulos', () => {
  it('adminAreaForPath: a página pertence à área da aba dela', () => {
    expect(adminAreaForPath('/admin/withdrawals')).toBe('dinheiro');
    expect(adminAreaForPath('/admin/plan-approvals')).toBe('lojas');
    expect(adminAreaForPath('/admin/conversas')).toBe('suporte');
    expect(adminAreaForPath('/admin/ranking-config')).toBe('regras');
    expect(adminAreaForPath('/admin/pricing-config')).toBeNull();
    expect(adminAreaForPath('/seller/dashboard')).toBeNull();
  });

  it('activeAdminTabKey: ?aba= desempata as abas da mesma página; aba desconhecida cai na aba sem ?aba=', () => {
    const area: AdminArea = {
      key: 'regras', group: 'Configuração', label: 'Regras e taxas', icon: 'settings',
      tabs: [
        { key: 'taxas', label: 'Taxas e tempos', href: '/admin/settings' },
        { key: 'ranking', label: 'Ranking', href: '/admin/settings?aba=ranking' },
        { key: 'modo', label: 'Modo da plataforma', href: '/admin/settings?aba=modo' },
      ],
    };
    expect(activeAdminTabKey(area, '/admin/settings', {})).toBe('taxas');
    expect(activeAdminTabKey(area, '/admin/settings', { aba: 'ranking' })).toBe('ranking');
    expect(activeAdminTabKey(area, '/admin/settings', { aba: 'modo' })).toBe('modo');
    expect(activeAdminTabKey(area, '/admin/settings', { aba: 'xyz' })).toBe('taxas');
    expect(activeAdminTabKey(area, '/admin/freios', {})).toBeNull();
  });

  it('adminScreenTitle: "Área · Aba" quando a área tem abas; senão o nome da área', () => {
    expect(adminScreenTitle('/admin/payouts')).toBe('Dinheiro · Repasses');
    expect(adminScreenTitle('/admin/lojas-asaas')).toBe('Lojas · Asaas e mensalidades');
    expect(adminScreenTitle('/admin/freios')).toBe('Freios');
    expect(adminScreenTitle('/admin/verificacoes')).toBe('Verificações');
    expect(adminScreenTitle('/admin/pricing-config')).toBe('Planos de preço');
    expect(adminScreenTitle('/admin/qualquer')).toBe('Administração');
  });

  it('isAdminPanelRoute', () => {
    expect(isAdminPanelRoute('/admin')).toBe(true);
    expect(isAdminPanelRoute('/admin/payouts')).toBe(true);
    expect(isAdminPanelRoute('/administrador')).toBe(false);
    expect(isAdminPanelRoute('/seller/dashboard')).toBe(false);
  });

  it('rótulo do papel (rodapé do menu)', () => {
    expect(adminRoleLabel('ceo')).toBe('CEO');
    expect(adminRoleLabel('marketing')).toBe('Marketing');
    expect(adminRoleLabel('gerente_geral')).toBe('Gerente geral');
    expect(adminRoleLabel('gerente_clientes')).toBe('Gerente de clientes');
    expect(adminRoleLabel('gerente_lojistas')).toBe('Gerente de lojistas');
    expect(adminRoleLabel('gerente_motoboys')).toBe('Gerente de motoboys');
    expect(adminRoleLabel(undefined)).toBe('Equipe');
  });
});
