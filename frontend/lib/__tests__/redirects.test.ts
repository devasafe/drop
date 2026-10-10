import { resolveRedirect, type RedirectRule } from '../../__tests__/helpers/nextRedirects';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rules: RedirectRule[] = require('../redirects');

describe('resolveRedirect (semântica do next.config)', () => {
  const sample: RedirectRule[] = [
    { source: '/a', has: [{ type: 'query', key: 'tab', value: 'x' }], destination: '/b?secao=x', permanent: true },
    { source: '/a', destination: '/c', permanent: true },
    { source: '/item/:id', destination: '/novo/:id', permanent: true },
  ];
  it('primeira regra que casa vence; has de query; query repassada', () => {
    expect(resolveRedirect(sample, '/a?tab=x')).toEqual({ location: '/b?secao=x&tab=x', permanent: true });
    expect(resolveRedirect(sample, '/a?y=1')).toEqual({ location: '/c?y=1', permanent: true });
    expect(resolveRedirect(sample, '/item/abc?k=2')).toEqual({ location: '/novo/abc?k=2', permanent: true });
    expect(resolveRedirect(sample, '/outra')).toBeNull();
  });
});

describe('lib/redirects.js', () => {
  it('é uma lista de regras válidas para o next.config', () => {
    expect(Array.isArray(rules)).toBe(true);
    for (const r of rules) {
      expect(r.source.startsWith('/')).toBe(true);
      expect(r.destination.startsWith('/')).toBe(true);
      expect(typeof r.permanent).toBe('boolean');
    }
  });
});

describe('Task 4 — abas', () => {
  const go = (u: string) => resolveRedirect(rules, u)?.location;
  it('raiz: com q vai para Buscar; sem q, Início; não permanente', () => {
    expect(resolveRedirect(rules, '/?q=fone')).toEqual({ location: '/buscar?q=fone', permanent: false });
    expect(resolveRedirect(rules, '/')).toEqual({ location: '/inicio', permanent: false });
  });
  it('Pedidos, endereços e carteira', () => {
    expect(go('/user-dashboard')).toBe('/pedidos');
    expect(go('/user-dashboard?tab=addresses')).toMatch(/^\/conta\?secao=enderecos/);
    expect(go('/wallet')).toBe('/conta/carteira');
    expect(go('/my-wallet')).toBe('/conta/carteira');
  });
});

describe('Task 10 — vitrines viram Buscar', () => {
  it('stores e produtos', () => {
    expect(resolveRedirect(rules, '/stores')?.location).toBe('/buscar?tab=lojas');
    expect(resolveRedirect(rules, '/produtos')?.location).toBe('/buscar?tab=produtos');
    expect(resolveRedirect(rules, '/produtos?q=fone')?.location).toBe('/buscar?tab=produtos&q=fone');
  });
});

describe('Task 11 — loja', () => {
  it('/stores/:id vira /loja/:id; /stores continua em Buscar', () => {
    expect(resolveRedirect(rules, '/stores/abc?utm=qr')?.location).toBe('/loja/abc?utm=qr');
    expect(resolveRedirect(rules, '/stores')?.location).toBe('/buscar?tab=lojas');
  });
});

describe('Task 12 — produto', () => {
  it('/product/:id vira /produto/:id', () => {
    expect(resolveRedirect(rules, '/product/p1')?.location).toBe('/produto/p1');
  });
});
