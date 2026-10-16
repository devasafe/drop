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

describe('D2 — painel do motoboy', () => {
  // Tabela do contrato do plano D2 ("Regra de redirects"). Só estas regras podem existir para o motoboy.
  type Planned = { source: string; has?: RedirectRule['has']; destination: string };
  const PLANNED: Planned[] = [
    { source: '/motoboy/ongoing', has: [{ type: 'query', key: 'tab', value: 'history' }], destination: '/motoboy/entregas?seg=concluidas' },
    { source: '/motoboy/ongoing', destination: '/motoboy/entregas?seg=andamento' },
    { source: '/motoboy/history', destination: '/motoboy/entregas?seg=concluidas' },
    { source: '/motoboy/delivery/:id', destination: '/motoboy/corrida/:id' },
    { source: '/motoboy/wallet', destination: '/motoboy/ganhos' },
    { source: '/motoboy/request-withdrawal', destination: '/motoboy/ganhos' },
    { source: '/motoboy/transfer-wallet', destination: '/motoboy/ganhos' },
    { source: '/motoboy/ajuda-ganhos', destination: '/motoboy/ganhos/como-calculamos' },
    { source: '/motoboy/gamification', destination: '/motoboy/nivel' },
    { source: '/motoboy/beneficios', destination: '/motoboy/nivel' },
    { source: '/motoboy/profile', destination: '/motoboy/perfil' },
    { source: '/verificacao-motoboy', destination: '/motoboy/cadastro' },
  ];
  const same = (r: RedirectRule, p: Planned) =>
    r.source === p.source && r.destination === p.destination && JSON.stringify(r.has ?? null) === JSON.stringify(p.has ?? null);
  const d2 = rules.filter((r) => r.source.startsWith('/motoboy') || r.source === '/verificacao-motoboy');
  const PAGES = path.join(__dirname, '..', '..', 'pages');
  const pageExists = (route: string) => {
    const p = route.split('?')[0].replace(/:(\w+)/g, '[$1]');
    return fs.existsSync(path.join(PAGES, `${p}.tsx`)) || fs.existsSync(path.join(PAGES, p, 'index.tsx'));
  };

  it('só regras do contrato, todas permanentes', () => {
    expect(d2.filter((r) => !PLANNED.some((p) => same(r, p)))).toEqual([]);
    expect(d2.filter((r) => r.permanent !== true)).toEqual([]);
  });

  it('destino é página que existe e a página antiga foi apagada no mesmo commit', () => {
    expect(d2.filter((r) => !pageExists(r.destination)).map((r) => r.destination)).toEqual([]);
    expect(d2.filter((r) => pageExists(r.source)).map((r) => r.source)).toEqual([]);
  });

  it('regra com has vem antes da regra sem has da mesma origem', () => {
    const fora = d2.filter((r, i) => !r.has && d2.slice(i + 1).some((o) => o.source === r.source && o.has));
    expect(fora).toEqual([]);
  });

  it('as rotas novas, o perfil público e as compartilhadas não redirecionam aqui', () => {
    for (const u of [
      '/motoboy', '/motoboy/entregas', '/motoboy/entregas/abc', '/motoboy/corrida/abc', '/motoboy/ganhos',
      '/motoboy/ganhos/como-calculamos', '/motoboy/nivel', '/motoboy/ranking', '/motoboy/perfil', '/motoboy/notificacoes',
      '/motoboy/cadastro', '/motoboy/abc123', '/notifications', '/register', '/dados-recebimento',
    ]) expect(resolveRedirect(rules, u)).toBeNull();
  });

  // P3–P5: cada task de tela nova acrescenta aqui o `it` das rotas antigas dela (modelo na Task P2.7 do plano).

  it('P3.13: /motoboy/delivery/:id vira /motoboy/corrida/:id, com a query (?nav=1 abre a navegação, C1)', () => {
    expect(resolveRedirect(rules, '/motoboy/delivery/abc')).toEqual({ location: '/motoboy/corrida/abc', permanent: true });
    expect(resolveRedirect(rules, '/motoboy/delivery/abc?nav=1')?.location).toBe('/motoboy/corrida/abc?nav=1');
  });

  it('P4.4: ongoing e history viram Entregas, preservando o segmento', () => {
    expect(resolveRedirect(rules, '/motoboy/ongoing')).toEqual({ location: '/motoboy/entregas?seg=andamento', permanent: true });
    expect(resolveRedirect(rules, '/motoboy/history')).toEqual({ location: '/motoboy/entregas?seg=concluidas', permanent: true });
  });

  it('P4.4: /motoboy/ongoing?tab=history cai em Concluídas (a regra com has vence a sem has)', () => {
    expect(resolveRedirect(rules, '/motoboy/ongoing?tab=history')).toEqual({ location: '/motoboy/entregas?seg=concluidas&tab=history', permanent: true });
    // outra aba antiga continua no andamento
    expect(resolveRedirect(rules, '/motoboy/ongoing?tab=ongoing')?.location).toMatch(/^\/motoboy\/entregas\?seg=andamento/);
  });

  it('P4.11: carteira, pedido de saque e transferência viram Ganhos', () => {
    for (const old of ['/motoboy/wallet', '/motoboy/request-withdrawal', '/motoboy/transfer-wallet']) {
      expect(resolveRedirect(rules, old)).toEqual({ location: '/motoboy/ganhos', permanent: true });
    }
  });

  it('P4.12: ajuda-ganhos vira Como calculamos', () => {
    expect(resolveRedirect(rules, '/motoboy/ajuda-ganhos')).toEqual({ location: '/motoboy/ganhos/como-calculamos', permanent: true });
  });
  it('P5.2: Desempenho e Benefícios viram Nível', () => {
    for (const old of ['/motoboy/gamification', '/motoboy/beneficios']) {
      expect(resolveRedirect(rules, old)).toEqual({ location: '/motoboy/nivel', permanent: true });
    }
  });
  it('P5.9: /verificacao-motoboy vira o Cadastro, com a query', () => {
    expect(resolveRedirect(rules, '/verificacao-motoboy')).toEqual({ location: '/motoboy/cadastro', permanent: true });
    expect(resolveRedirect(rules, '/verificacao-motoboy?onboarding=1')?.location).toBe('/motoboy/cadastro?onboarding=1');
  });
});

describe('D3a — painel do admin (spec 5.6)', () => {
  const ROOT = path.join(__dirname, '..', '..');
  const D3A: Array<[string, string]> = [
    ['/admin/analytics', '/admin/dashboard'],
    ['/admin/conversas', '/admin/suporte?filtro=conversas'],
    ['/admin/ranking-config', '/admin/settings?aba=ranking'],
    ['/admin/pricing-config', '/admin/settings'],
  ];

  it.each(D3A)('%s redireciona (308) para %s', (from, to) => {
    expect(resolveRedirect(rules, from)).toEqual({ location: to, permanent: true });
  });

  it('a query da URL antiga vai junto', () => {
    expect(resolveRedirect(rules, '/admin/conversas?id=c1')?.location).toBe('/admin/suporte?filtro=conversas&id=c1');
  });

  it('as páginas antigas saíram (redirect e página não convivem)', () => {
    for (const p of ['analytics', 'conversas', 'ranking-config', 'pricing-config']) {
      expect(fs.existsSync(path.join(ROOT, 'pages', 'admin', `${p}.tsx`))).toBe(false);
    }
  });

  it('todo destino do admin é uma página que existe', () => {
    const admin = rules.filter((r) => r.source.startsWith('/admin/'));
    expect(admin.length).toBeGreaterThanOrEqual(4);
    const missing = admin
      .map((r) => r.destination.split('?')[0])
      .filter((p) => !fs.existsSync(path.join(ROOT, 'pages', `${p}.tsx`)));
    expect(missing).toEqual([]);
  });
});
