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
];
