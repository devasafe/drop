import { getNavItems, isItemActive } from '../navConfig';

const allow = () => true;
const tabs = (opts?: any) => getNavItems('cliente', allow, false, opts).filter((i) => i.placement.includes('bottomNav'));
const account = (opts?: any) => getNavItems('cliente', allow, false, opts).filter((i) => i.placement.includes('account'));

describe('cliente: 4 abas (spec §9)', () => {
  it.each([undefined, { settlementMode: 'custodia' }, { settlementMode: 'direto' }, { settlementMode: 'direto', custodyLeftover: true }])(
    'sempre Início, Buscar, Pedidos e Conta (%p)', (opts) => {
      expect(tabs(opts).map((i) => [i.label, i.route])).toEqual([
        ['Início', '/inicio'], ['Buscar', '/buscar'], ['Pedidos', '/pedidos'], ['Conta', '/conta'],
      ]);
    });
  it('Carteira vira linha da Conta (custódia) e some no modo direto', () => {
    expect(account({ settlementMode: 'custodia' }).map((i) => [i.label, i.route])).toEqual([['Carteira', '/conta/carteira']]);
    expect(account({ settlementMode: 'direto' })).toEqual([]);
    expect(account({ settlementMode: 'direto', custodyLeftover: true }).map((i) => i.label)).toEqual(['Saldo do modo anterior']);
  });
  it('estado ativo cobre as rotas novas e as antigas', () => {
    const [inicio, buscar, pedidos, conta] = tabs();
    expect(isItemActive(buscar, '/buscar')).toBe(true);
    expect(isItemActive(buscar, '/loja/abc')).toBe(true);
    expect(isItemActive(pedidos, '/pedido/abc')).toBe(true);
    expect(isItemActive(conta, '/conta/carteira')).toBe(true);
    expect(isItemActive(inicio, '/buscar')).toBe(false);
  });
});
