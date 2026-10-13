import { getNavItems, isItemActive, bottomNavLayout } from '../navConfig';

const allow = () => true;
const MODES = [undefined, { settlementMode: 'custodia' }, { settlementMode: 'direto' }, { settlementMode: 'direto', custodyLeftover: true }];
const tabs = (opts?: any) => getNavItems('lojista', allow, false, opts).filter((i) => i.placement.includes('bottomNav'));

describe('lojista: 5 abas (spec D1 §3.1)', () => {
  it.each(MODES)('sempre Agora, Pedidos, Produtos, Dinheiro e Loja (%p)', (opts) => {
    expect(tabs(opts).map((i) => [i.label, i.route])).toEqual([
      ['Agora', '/seller/dashboard'],
      ['Pedidos', '/seller/pedidos'],
      ['Produtos', '/seller/products'],
      ['Dinheiro', '/seller/dinheiro'],
      ['Loja', '/seller/loja'],
    ]);
  });

  it('o badge de pedidos continua na aba Pedidos', () => {
    expect(tabs().find((i) => i.label === 'Pedidos')?.badge).toBe('storeOrders');
  });

  it('aba ativa pelo caminho, uma por vez (o ?tab= do redirect não conta)', () => {
    const active = (p: string, q: Record<string, string> = {}) => tabs().filter((i) => isItemActive(i, p, q)).map((i) => i.label);
    expect(active('/seller/dashboard')).toEqual(['Agora']);
    expect(active('/seller/pedidos', { seg: 'andamento', tab: 'orders' })).toEqual(['Pedidos']);
    expect(active('/seller/pedido/[id]')).toEqual(['Pedidos']);
    expect(active('/seller/products')).toEqual(['Produtos']);
    expect(active('/seller/create-product')).toEqual(['Produtos']);
    expect(active('/seller/edit-product', { edit: 'p1' })).toEqual(['Produtos']);
    expect(active('/seller/dinheiro')).toEqual(['Dinheiro']);
    expect(active('/seller/wallet')).toEqual(['Dinheiro']);
    expect(active('/seller/loja', { tab: 'config' })).toEqual(['Loja']);
    expect(active('/seller/analytics')).toEqual(['Loja']);
    expect(active('/seller/coupons')).toEqual(['Loja']);
    expect(active('/seller/create-store')).toEqual([]);
  });

  it('subitens da Loja no menu lateral seguem o modo (cada um leva a uma tela de um modo só)', () => {
    const loja = (opts?: any) => getNavItems('lojista', allow, false, opts).filter((i) => i.group === 'Loja').map((i) => i.label);
    expect(loja({ settlementMode: 'custodia' })).toEqual(['Desempenho', 'Cupons', 'Integrações (API)', 'Plano e cobrança']);
    expect(loja({ settlementMode: 'direto' })).toEqual(['Desempenho', 'Cupons', 'Integrações (API)', 'Assinatura', 'Recebimentos']);
  });

  it('lojista: 5 abas e sem "Mais"; motoboy e admin seguem com 4 + "Mais"', () => {
    expect(bottomNavLayout('lojista')).toEqual({ max: 5, more: false });
    expect(bottomNavLayout('motoboy')).toEqual({ max: 4, more: true });
    expect(bottomNavLayout('ceo')).toEqual({ max: 4, more: true });
  });

  it('motoboy continua respeitando ?tab= (pathOnly é só da loja)', () => {
    const entregas = getNavItems('motoboy', allow, false).find((i) => i.label === 'Entregas')!;
    expect(isItemActive(entregas, '/motoboy/ongoing', { tab: 'x' })).toBe(false);
    expect(isItemActive(entregas, '/motoboy/ongoing', {})).toBe(true);
  });
});
