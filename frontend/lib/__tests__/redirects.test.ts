import fs from 'fs';
import path from 'path';
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

describe('Task 13 — sacola', () => {
  it('Task 13 — sacola', () => {
    expect(resolveRedirect(rules, '/checkout')?.location).toBe('/sacola');
    expect(resolveRedirect(rules, '/checkout-vitrine')?.location).toBe('/sacola');
  });
});

describe('Task 15 — pedido', () => {
  it('/store-order/:id vira /pedido/:id (com a query)', () => {
    expect(resolveRedirect(rules, '/store-order/abc?from=push')?.location).toBe('/pedido/abc?from=push');
  });
});

describe('D1 — painel da loja', () => {
  const go = (u: string) => resolveRedirect(rules, u)?.location;

  it('/store-dashboard (pushes antigas) vai para a aba Agora', () => {
    expect(resolveRedirect(rules, '/store-dashboard')).toEqual({ location: '/seller/dashboard', permanent: true });
  });

  it('a aba Agora não redireciona (sem ?tab= ou com overview)', () => {
    expect(resolveRedirect(rules, '/seller/dashboard')).toBeNull();
    expect(resolveRedirect(rules, '/seller/dashboard?tab=overview')).toBeNull();
  });

  it('abas antigas por ?tab= viram rotas (a query segue junto)', () => {
    expect(go('/seller/dashboard?tab=orders')).toBe('/seller/pedidos?seg=andamento&tab=orders');
    expect(go('/seller/dashboard?tab=history')).toBe('/seller/pedidos?seg=historico&tab=history');
    expect(go('/seller/dashboard?tab=returns')).toBe('/seller/pedidos?seg=devolucoes&tab=returns');
    expect(go('/seller/dashboard?tab=chat')).toBe('/seller/pedidos?seg=andamento&tab=chat');
    expect(go('/seller/dashboard?tab=config')).toBe('/seller/loja?tab=config');
  });

  it('pedido, dinheiro e o plano órfão', () => {
    expect(go('/seller/order-abc?from=push')).toBe('/seller/pedido/abc?from=push');
    expect(go('/seller/wallet')).toBe('/seller/dinheiro');
    expect(go('/seller/transfer-wallet')).toBe('/seller/dinheiro');
    expect(go('/store/plan-selection')).toBe('/seller/select-plan');
  });

  it('etapas do onboarding e rotas compartilhadas não redirecionam aqui (decisão por estado fica na página)', () => {
    for (const u of ['/seller/pagamentos', '/seller/select-plan', '/verificacao', '/verificacao-loja', '/dados-recebimento', '/notifications']) {
      expect(resolveRedirect(rules, u)).toBeNull();
    }
  });

  it('todo destino da loja é uma página que existe (sem 404 entre commits)', () => {
    const PAGES = path.join(__dirname, '..', '..', 'pages');
    const d1 = rules.filter((r) => r.source.startsWith('/seller') || r.source.startsWith('/store'));
    expect(d1.length).toBeGreaterThan(0);
    const missing = d1
      .map((r) => r.destination.split('?')[0].replace(/:(\w+)/g, '[$1]'))
      .filter((p) => !fs.existsSync(path.join(PAGES, `${p}.tsx`)));
    expect(missing).toEqual([]);
  });
});

describe('V13 — /seller/produtos (pt) leva à aba Produtos', () => {
  it('/seller/produtos → /seller/products, sem mexer no /produtos do cliente', () => {
    expect(resolveRedirect(rules, '/seller/produtos')).toEqual({ location: '/seller/products', permanent: true });
    expect(resolveRedirect(rules, '/seller/produtos?q=fone')?.location).toBe('/seller/products?q=fone');
    expect(resolveRedirect(rules, '/produtos')?.location).toBe('/buscar?tab=produtos');
    expect(resolveRedirect(rules, '/seller/products')).toBeNull();
  });
});
