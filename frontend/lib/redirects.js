/**
 * Rotas antigas → novas (DS v2, fase C). Lido pelo next.config.js (redirects()).
 * Cada task que cria uma rota nova acrescenta aqui as antigas dela, com teste em
 * lib/__tests__/redirects.test.ts. A query da URL é repassada ao destino pelo Next.
 * permanent:true (308) em tudo, menos a raiz '/' (307), que não pode ficar em cache.
 * Rotas COMPARTILHADAS com os painéis não entram aqui: redirecionam só o cliente, na página.
 * @type {Array<{source:string,destination:string,permanent:boolean,has?:Array<{type:'query',key:string,value?:string}>}>}
 */
module.exports = [];
