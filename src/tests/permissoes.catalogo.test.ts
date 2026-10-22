/**
 * Permissões por público (22/10): cada caixinha de /admin/permissoes diz o que libera.
 *  - `opens`: abre um item do menu (`area`);
 *  - `action`: ação dentro de uma tela, que precisa de uma das chaves de `requires` para abrir;
 *  - `app`: uso próprio do cliente, da loja ou do motoboy, fora do painel.
 * Caixinha sem tela sai da lista (RETIRED_PERMISSIONS); a linha do banco não é apagada.
 */
import {
  ALL_PERMISSIONS, RETIRED_PERMISSIONS, allowedAudiences, userAudiences,
} from '../services/permissions/catalog';

describe('catálogo de permissões', () => {
  it('toda caixinha tem um tipo; abre e ação dizem a área', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(['opens', 'action', 'app']).toContain(p.kind);
      if (p.kind !== 'app') expect(typeof p.area).toBe('string');
      if (p.kind === 'app') expect(p.area).toBeUndefined();
    }
  });

  it('ação aponta para chaves que abrem a mesma área', () => {
    const byKey = new Map(ALL_PERMISSIONS.map((p) => [p.key, p]));
    for (const p of ALL_PERMISSIONS.filter((x) => x.kind === 'action')) {
      expect(p.requires && p.requires.length).toBeTruthy();
      for (const r of p.requires!) {
        expect(byKey.get(r)?.kind).toBe('opens');
        expect(byKey.get(r)?.area).toBe(p.area);
      }
    }
  });

  it('as caixinhas sem tela saem da lista', () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key);
    for (const k of [
      'dashboard:view_client_metrics', 'dashboard:view_store_metrics', 'dashboard:view_motoboy_metrics',
      'coupon:create_global', 'reviews:moderate',
      'notification:create', 'notification:approve', 'notification:reject',
    ]) {
      expect(RETIRED_PERMISSIONS).toContain(k);
      expect(keys).not.toContain(k);
    }
  });

  it('as caixinhas por público abrem a tela do público', () => {
    const get = (k: string) => ALL_PERMISSIONS.find((p) => p.key === k)!;
    expect(get('user:view_motoboys')).toMatchObject({ kind: 'opens', area: 'usuarios', audience: 'motoboys' });
    expect(get('wallet:view_stores')).toMatchObject({ kind: 'opens', area: 'dinheiro', tab: 'carteiras', audience: 'lojas' });
    expect(get('verification:review_motoboys')).toMatchObject({ kind: 'opens', area: 'verificacoes' });
    expect(get('user:edit_motoboys')).toMatchObject({ kind: 'action', area: 'usuarios' });
    expect(get('store:edit')).toMatchObject({ kind: 'action', area: 'lojas', requires: ['store:view_all'] });
    expect(get('banner:manage')).toMatchObject({ kind: 'opens', area: 'comunicacao', tab: 'avisos' });
    expect(get('store:view_own').kind).toBe('app');
  });
});

describe('público permitido', () => {
  it("'*' e as chaves \"de tudo\" liberam todos os públicos", () => {
    expect(allowedAudiences(['*'], 'user')).toEqual({ all: true, audiences: ['cliente', 'lojista', 'motoboy', 'equipe'] });
    expect(allowedAudiences(['user:view_all'], 'user').all).toBe(true);
    expect(allowedAudiences(['wallet:view_all'], 'wallet').all).toBe(true);
  });

  it('as chaves por público liberam só o público delas', () => {
    expect(allowedAudiences(['user:view_motoboys'], 'user')).toEqual({ all: false, audiences: ['motoboy'] });
    expect(allowedAudiences(['user:view_clients', 'user:view_motoboys'], 'user').audiences).toEqual(['cliente', 'motoboy']);
    expect(allowedAudiences(['wallet:view_stores'], 'wallet').audiences).toEqual(['lojista']);
    expect(allowedAudiences(['user:edit_motoboys'], 'userEdit').audiences).toEqual(['motoboy']);
    expect(allowedAudiences(['user:block'], 'userEdit').all).toBe(true);
    expect(allowedAudiences(['theme:edit'], 'user').audiences).toEqual([]);
  });

  it('público da pessoa: cliente puro, lojista, motoboy e equipe', () => {
    expect(userAudiences(['cliente'])).toEqual(['cliente']);
    expect(userAudiences(['motoboy', 'cliente'])).toEqual(['motoboy']);
    expect(userAudiences(['cliente', 'gerente_motoboys'])).toEqual(['equipe']);
    expect(userAudiences(['motoboy', 'gerente_geral'])).toEqual(['motoboy', 'equipe']);
  });
});
