/**
 * D3b-3 · P4.4 — menu do admin com money:overview: "Visão geral" é a primeira aba de Dinheiro e "Histórico" a
 * última, as duas sem filtro de modo; o item Dinheiro abre a primeira aba visível ao papel.
 */
import {
  ADMIN_AREAS, activeAdminTabKey, adminAreaForPath, adminAreaHref, adminHomeHref, adminScreenTitle, tabPermissions,
  visibleAdminAreas, type AdminNavContext,
} from '../lib/adminNav';

const ctx = (perms: string[], mode: AdminNavContext['settlementMode'], isCeo = false, custodyOpen = false): AdminNavContext => ({
  can: (p) => isCeo || perms.includes('*') || perms.includes(p), isCeo, settlementMode: mode, custodyOpen,
});
const dinheiroTabs = (c: AdminNavContext) => visibleAdminAreas(c).find((a) => a.key === 'dinheiro')?.tabs.map((t) => t.key);
const dinheiroHref = (c: AdminNavContext) => {
  const area = visibleAdminAreas(c).find((a) => a.key === 'dinheiro');
  return area ? adminAreaHref(area) : null;
};
const GERENTE_GERAL = ['user:view_all', 'store:view_all', 'wallet:view_all', 'dashboard:view_all', 'verification:view_queue'];

describe('tabela', () => {
  const area = ADMIN_AREAS.find((a) => a.key === 'dinheiro')!;

  it('Visão geral primeiro, Histórico por último, as abas de operação no meio na ordem de antes', () => {
    expect(area.tabs.map((t) => t.key)).toEqual(['visao-geral', 'repasses', 'saques', 'estornos', 'carteiras', 'caixa', 'pix', 'historico']);
  });

  it('as duas abas novas: money:overview, sem filtro de modo, sem ceoOnly', () => {
    for (const key of ['visao-geral', 'historico']) {
      const t = area.tabs.find((x) => x.key === key)!;
      expect(tabPermissions(t)).toEqual(['money:overview']);
      expect(t.custodyOnly).toBeFalsy();
      expect(t.directOnly).toBeFalsy();
      expect(t.ceoOnly).toBeFalsy();
    }
    expect(area.tabs[0]).toMatchObject({ label: 'Visão geral', href: '/admin/dinheiro' });
    expect(area.tabs[area.tabs.length - 1]).toMatchObject({ label: 'Histórico', href: '/admin/dinheiro/historico' });
  });
});

describe('por papel e por modo', () => {
  it('CEO: Visão geral e Histórico nos dois modos e com o modo desconhecido', () => {
    expect(dinheiroTabs(ctx([], 'custodia', true))).toEqual(['visao-geral', 'repasses', 'saques', 'carteiras', 'caixa', 'historico']);
    expect(dinheiroTabs(ctx([], 'direto', true))).toEqual(['visao-geral', 'estornos', 'pix', 'historico']);
    expect(dinheiroTabs(ctx([], 'direto', true, true))).toEqual(['visao-geral', 'repasses', 'saques', 'estornos', 'pix', 'historico']);
    expect(dinheiroTabs(ctx([], null, true))).toEqual(['visao-geral', 'historico']);
  });

  it('CEO: o item Dinheiro abre a Visão geral em qualquer modo', () => {
    for (const mode of ['custodia', 'direto', null] as const) expect(dinheiroHref(ctx([], mode, true))).toBe('/admin/dinheiro');
  });

  it('gerente geral (padrão, sem money:overview): nada muda — Carteiras na custódia, Dinheiro some no direto', () => {
    expect(dinheiroTabs(ctx(GERENTE_GERAL, 'custodia'))).toEqual(['carteiras']);
    expect(dinheiroHref(ctx(GERENTE_GERAL, 'custodia'))).toBe('/admin/wallets');
    expect(dinheiroTabs(ctx(GERENTE_GERAL, 'direto'))).toBeUndefined();
  });

  it('money:overview concedida em Permissões: as duas abas aparecem e o item abre a Visão geral', () => {
    const perms = [...GERENTE_GERAL, 'money:overview'];
    expect(dinheiroTabs(ctx(perms, 'custodia'))).toEqual(['visao-geral', 'carteiras', 'historico']);
    expect(dinheiroTabs(ctx(perms, 'direto'))).toEqual(['visao-geral', 'historico']);
    expect(dinheiroHref(ctx(perms, 'custodia'))).toBe('/admin/dinheiro');
  });

  it('só payout:view no direto: Dinheiro continua abrindo Estornos', () => {
    expect(dinheiroHref(ctx(['payout:view'], 'direto'))).toBe('/admin/estornos');
  });

  it('papel só com money:overview entra no admin pela Visão geral', () => {
    expect(adminHomeHref((p) => p === 'money:overview', false)).toBe('/admin/dinheiro');
  });
});

describe('rotas e títulos', () => {
  it('as duas páginas pertencem à área Dinheiro, com aba ativa e título "Dinheiro · …"', () => {
    const area = ADMIN_AREAS.find((a) => a.key === 'dinheiro')!;
    expect(adminAreaForPath('/admin/dinheiro')).toBe('dinheiro');
    expect(adminAreaForPath('/admin/dinheiro/historico')).toBe('dinheiro');
    expect(activeAdminTabKey(area, '/admin/dinheiro', {})).toBe('visao-geral');
    expect(activeAdminTabKey(area, '/admin/dinheiro/historico', {})).toBe('historico');
    expect(adminScreenTitle('/admin/dinheiro')).toBe('Dinheiro · Visão geral');
    expect(adminScreenTitle('/admin/dinheiro/historico')).toBe('Dinheiro · Histórico');
  });
});
