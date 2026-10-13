import { SELLER_ROUTES, SELLER_TAB_ROUTES, isSellerPanelRoute } from '../sellerRoutes';
import { ROLE_HOME } from '../navConfig';

describe('rotas da loja (D1)', () => {
  it('as 5 abas', () => {
    expect(SELLER_ROUTES.agora).toBe('/seller/dashboard');
    expect(SELLER_ROUTES.pedidos()).toBe('/seller/pedidos');
    expect(SELLER_ROUTES.pedidos('historico')).toBe('/seller/pedidos?seg=historico');
    expect(SELLER_ROUTES.produtos).toBe('/seller/products');
    expect(SELLER_ROUTES.dinheiro).toBe('/seller/dinheiro');
    expect(SELLER_ROUTES.loja).toBe('/seller/loja');
  });

  it('Agora continua sendo a home do lojista', () => {
    expect(SELLER_ROUTES.agora).toBe(ROLE_HOME.lojista);
  });

  it('secundárias com id escapam o id e mantêm a query real do editar produto', () => {
    expect(SELLER_ROUTES.pedido('o1')).toBe('/seller/pedido/o1');
    expect(SELLER_ROUTES.pedido('a/b')).toBe('/seller/pedido/a%2Fb');
    expect(SELLER_ROUTES.editarProduto('p1')).toBe('/seller/edit-product?edit=p1');
  });

  it('secundárias fixas', () => {
    expect([
      SELLER_ROUTES.novoProduto, SELLER_ROUTES.estoque, SELLER_ROUTES.desempenho, SELLER_ROUTES.avaliacoes,
      SELLER_ROUTES.cupons, SELLER_ROUTES.integracoes, SELLER_ROUTES.horarios, SELLER_ROUTES.plano,
      SELLER_ROUTES.assinatura, SELLER_ROUTES.notificacoes, SELLER_ROUTES.contaAsaas, SELLER_ROUTES.abrir,
    ]).toEqual([
      '/seller/create-product', '/seller/estoque', '/seller/analytics', '/seller/avaliacoes',
      '/seller/coupons', '/seller/integrations', '/seller/horarios', '/seller/plano',
      '/seller/assinatura', '/seller/notificacoes', '/seller/conta-asaas', '/seller/abrir',
    ]);
  });

  it('SELLER_TAB_ROUTES na ordem da barra', () => {
    expect(SELLER_TAB_ROUTES).toEqual(['/seller/dashboard', '/seller/pedidos', '/seller/products', '/seller/dinheiro', '/seller/loja']);
  });

  it('o painel monta em todo /seller/* e no /store-dashboard antigo', () => {
    for (const p of ['/seller/dashboard', '/seller/products', '/seller/pedido/[id]', '/seller/create-store', '/store-dashboard']) {
      expect(isSellerPanelRoute(p)).toBe(true);
    }
  });

  it('fora da loja o painel não monta', () => {
    for (const p of ['/inicio', '/motoboy', '/motoboy/wallet', '/admin/dashboard', '/notifications', '/verificacao', '/sellerx']) {
      expect(isSellerPanelRoute(p)).toBe(false);
    }
  });
});
