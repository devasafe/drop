/**
 * Rotas antigas → novas (DS v2, fase C). Lido pelo next.config.js (redirects()).
 * Cada task que cria uma rota nova acrescenta aqui as antigas dela, com teste em
 * lib/__tests__/redirects.test.ts. A query da URL é repassada ao destino pelo Next.
 * permanent:true (308) em tudo, menos a raiz '/' (307), que não pode ficar em cache.
 * Rotas COMPARTILHADAS com os painéis não entram aqui: redirecionam só o cliente, na página.
 * @type {Array<{source:string,destination:string,permanent:boolean,has?:Array<{type:'query',key:string,value?:string}>}>}
 */
module.exports = [
  // Task 4 — abas (Buscar, Pedidos, Conta)
  { source: '/', has: [{ type: 'query', key: 'q' }], destination: '/buscar', permanent: false },
  { source: '/', destination: '/inicio', permanent: false },
  { source: '/user-dashboard', has: [{ type: 'query', key: 'tab', value: 'addresses' }], destination: '/conta?secao=enderecos', permanent: true },
  { source: '/user-dashboard', destination: '/pedidos', permanent: true },
  { source: '/wallet', destination: '/conta/carteira', permanent: true },
  { source: '/my-wallet', destination: '/conta/carteira', permanent: true },

  // Task 10 — /stores e /produtos viram abas de Buscar
  { source: '/stores', destination: '/buscar?tab=lojas', permanent: true },
  { source: '/produtos', destination: '/buscar?tab=produtos', permanent: true },

  // Task 11 — loja
  { source: '/stores/:id', destination: '/loja/:id', permanent: true },

  // Task 12 — produto
  { source: '/product/:id', destination: '/produto/:id', permanent: true },

  // Task 13 — Sacola (carrinho + checkout numa tela; Plano 1 usa a mesma)
  { source: '/checkout', destination: '/sacola', permanent: true },
  { source: '/checkout-vitrine', destination: '/sacola', permanent: true },

  // Task 15 — Pedido
  { source: '/store-order/:id', destination: '/pedido/:id', permanent: true },

  // D1 — painel da loja em 5 abas. /seller/dashboard SEM ?tab= é a aba Agora e não redireciona.
  // /seller/pagamentos e /seller/select-plan são etapas do onboarding: o destino depende da loja
  // e fica na própria página (parte P7), não aqui.
  { source: '/store-dashboard', destination: '/seller/dashboard', permanent: true },
  { source: '/seller/dashboard', has: [{ type: 'query', key: 'tab', value: 'orders' }], destination: '/seller/pedidos?seg=andamento', permanent: true },
  { source: '/seller/dashboard', has: [{ type: 'query', key: 'tab', value: 'history' }], destination: '/seller/pedidos?seg=historico', permanent: true },
  { source: '/seller/dashboard', has: [{ type: 'query', key: 'tab', value: 'returns' }], destination: '/seller/pedidos?seg=devolucoes', permanent: true },
  { source: '/seller/dashboard', has: [{ type: 'query', key: 'tab', value: 'chat' }], destination: '/seller/pedidos?seg=andamento', permanent: true },
  { source: '/seller/dashboard', has: [{ type: 'query', key: 'tab', value: 'config' }], destination: '/seller/loja', permanent: true },
  { source: '/seller/order-:id', destination: '/seller/pedido/:id', permanent: true },
  { source: '/seller/wallet', destination: '/seller/dinheiro', permanent: true },
  { source: '/seller/transfer-wallet', destination: '/seller/dinheiro', permanent: true },
  { source: '/store/plan-selection', destination: '/seller/select-plan', permanent: true },
  // V13 — o nome em português da aba Produtos leva à rota real (o /produtos do cliente segue para a busca).
  { source: '/seller/produtos', destination: '/seller/products', permanent: true },
];
