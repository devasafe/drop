import { getNavItems, isItemActive, bottomNavLayout } from '../navConfig';

const allow = () => true;
const items = (opts?: any) => getNavItems('motoboy', allow, false, opts);
const tabs = (opts?: any) => items(opts).filter((i) => i.placement.includes('bottomNav'));
const active = (pathname: string, query: Record<string, string> = {}) =>
  items().filter((i) => isItemActive(i, pathname, query)).map((i) => i.label);

describe('motoboy: 4 abas (spec D2 3.1)', () => {
  it.each([undefined, { settlementMode: 'custodia' }, { settlementMode: 'direto' }, { settlementMode: 'direto', custodyLeftover: true }])(
    'sempre Corridas, Ganhos, Nível e Perfil, na barra e no menu lateral (%p)',
    (opts) => {
      const esperado = [['Corridas', '/motoboy'], ['Ganhos', '/motoboy/ganhos'], ['Nível', '/motoboy/nivel'], ['Perfil', '/motoboy/perfil']];
      expect(tabs(opts).map((i) => [i.label, i.route])).toEqual(esperado);
      expect(items(opts).map((i) => [i.label, i.route])).toEqual(esperado);
      expect(items(opts).every((i) => i.placement.includes('sidebar') && !i.placement.includes('drawer'))).toBe(true);
    },
  );

  it('4 abas e sem "Mais"', () => {
    expect(bottomNavLayout('motoboy')).toEqual({ max: 4, more: false });
  });

  it('badge de entregas fica em Corridas', () => {
    expect(items().find((i) => i.badge === 'deliveries')?.label).toBe('Corridas');
  });

  it('uma aba ativa por vez, pelas rotas novas', () => {
    expect(active('/motoboy')).toEqual(['Corridas']);
    expect(active('/motoboy/entregas', { seg: 'concluidas', tab: 'history' })).toEqual(['Corridas']);
    expect(active('/motoboy/entregas/[id]')).toEqual(['Corridas']);
    expect(active('/motoboy/corrida/[id]')).toEqual(['Corridas']);
    expect(active('/motoboy/ganhos', { seg: 'saques' })).toEqual(['Ganhos']);
    expect(active('/motoboy/ganhos/como-calculamos')).toEqual(['Ganhos']);
    expect(active('/motoboy/nivel')).toEqual(['Nível']);
    expect(active('/motoboy/ranking')).toEqual(['Nível']);
    expect(active('/motoboy/perfil')).toEqual(['Perfil']);
    expect(active('/motoboy/notificacoes')).toEqual(['Perfil']);
    expect(active('/motoboy/[id]')).toEqual([]);
  });

  it('C8/K26: as subtelas do Perfil (dados e ajuda) acendem a aba Perfil', () => {
    expect(active('/motoboy/perfil/dados')).toEqual(['Perfil']);
    expect(active('/motoboy/perfil/ajuda')).toEqual(['Perfil']);
  });
});
