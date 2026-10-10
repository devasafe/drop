import { ROUTES, buscarHref, contaHref, lojaHref, produtoHref, pedidoHref } from '../routes';

describe('rotas do cliente', () => {
  it('abas e conta', () => {
    expect(ROUTES.inicio).toBe('/inicio');
    expect(ROUTES.buscar).toBe('/buscar');
    expect(ROUTES.pedidos).toBe('/pedidos');
    expect(ROUTES.conta).toBe('/conta');
    expect(ROUTES.carteira).toBe('/conta/carteira');
  });
  it('buscarHref monta a querystring só com o que veio', () => {
    expect(buscarHref()).toBe('/buscar');
    expect(buscarHref({ q: 'fone bluetooth', tab: 'lojas' })).toBe('/buscar?q=fone+bluetooth&tab=lojas');
    expect(buscarHref({ categoria: 'Fones e áudio' })).toBe('/buscar?categoria=Fones+e+%C3%A1udio');
    expect(buscarHref({ focus: true })).toBe('/buscar?focus=1');
  });
  it('contaHref com seção', () => {
    expect(contaHref()).toBe('/conta');
    expect(contaHref('enderecos')).toBe('/conta?secao=enderecos');
  });
  it('helpers escapam o id', () => {
    expect(lojaHref('a/b')).toMatch(/a%2Fb$/);
    expect(lojaHref('s1')).toBe('/loja/s1');
    expect(produtoHref('p1')).toMatch(/\/p1$/);
    expect(pedidoHref('o1')).toMatch(/\/o1$/);
  });
});
