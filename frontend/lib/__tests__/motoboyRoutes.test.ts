import { MOTOBOY_ROUTES, MOTOBOY_TAB_ROUTES, motoboyShowsTabBar, isMotoboyPanelRoute } from '../motoboyRoutes';

describe('motoboyRoutes · moldura (D2)', () => {
  it('as 4 abas na ordem da barra: Corridas, Ganhos, Nível, Perfil', () => {
    expect(MOTOBOY_TAB_ROUTES).toEqual(['/motoboy', '/motoboy/ganhos', '/motoboy/nivel', '/motoboy/perfil']);
  });

  it('barra nas 4 abas e em Entregas (fica sob a aba Corridas); nunca nas telas de fluxo', () => {
    for (const p of [...MOTOBOY_TAB_ROUTES, '/motoboy/entregas']) expect(motoboyShowsTabBar(p)).toBe(true);
    for (const p of [
      '/motoboy/entregas/[id]', '/motoboy/corrida/[id]', '/motoboy/ganhos/como-calculamos', '/motoboy/ranking',
      '/motoboy/notificacoes', '/motoboy/[id]', '/motoboy/cadastro', '/motoboy/wallet', '/dados-recebimento',
    ]) expect(motoboyShowsTabBar(p)).toBe(false);
  });

  it('painel = /motoboy e /motoboy/*, menos o perfil público', () => {
    expect(isMotoboyPanelRoute('/motoboy')).toBe(true);
    expect(isMotoboyPanelRoute('/motoboy/corrida/[id]')).toBe(true);
    expect(isMotoboyPanelRoute('/motoboy/wallet')).toBe(true);
    expect(isMotoboyPanelRoute('/motoboy/[id]')).toBe(false);
    expect(isMotoboyPanelRoute('/motoboyx')).toBe(false);
    expect(isMotoboyPanelRoute('/dados-recebimento')).toBe(false);
    expect(isMotoboyPanelRoute('/seller/dashboard')).toBe(false);
  });

  it('subtelas do Perfil (C8): moldura do painel, sem barra', () => {
    expect(isMotoboyPanelRoute('/motoboy/perfil/dados')).toBe(true);
    expect(motoboyShowsTabBar('/motoboy/perfil/dados')).toBe(false);
    expect(isMotoboyPanelRoute('/motoboy/perfil/ajuda')).toBe(true);
    expect(motoboyShowsTabBar('/motoboy/perfil/ajuda')).toBe(false);
  });
});

describe('MOTOBOY_ROUTES (contrato D2)', () => {
  it('abas e telas fixas', () => {
    expect(MOTOBOY_ROUTES.corridas).toBe('/motoboy');
    expect(MOTOBOY_ROUTES.comoCalculamos).toBe('/motoboy/ganhos/como-calculamos');
    expect(MOTOBOY_ROUTES.nivel).toBe('/motoboy/nivel');
    expect(MOTOBOY_ROUTES.ranking).toBe('/motoboy/ranking');
    expect(MOTOBOY_ROUTES.perfil).toBe('/motoboy/perfil');
    expect(MOTOBOY_ROUTES.notificacoes).toBe('/motoboy/notificacoes');
    expect(MOTOBOY_ROUTES.cadastro).toBe('/motoboy/cadastro');
    expect(MOTOBOY_ROUTES.recebimento).toBe('/dados-recebimento');
  });

  it('subtelas do Perfil (C8)', () => {
    expect(MOTOBOY_ROUTES.perfilDados).toBe('/motoboy/perfil/dados');
    expect(MOTOBOY_ROUTES.perfilAjuda).toBe('/motoboy/perfil/ajuda');
  });

  it('segmentos por query', () => {
    expect(MOTOBOY_ROUTES.entregas()).toBe('/motoboy/entregas');
    expect(MOTOBOY_ROUTES.entregas('andamento')).toBe('/motoboy/entregas?seg=andamento');
    expect(MOTOBOY_ROUTES.entregas('concluidas')).toBe('/motoboy/entregas?seg=concluidas');
    expect(MOTOBOY_ROUTES.ganhos()).toBe('/motoboy/ganhos');
    expect(MOTOBOY_ROUTES.ganhos('notas')).toBe('/motoboy/ganhos?seg=notas');
  });

  it('rotas com id codificam o id (nunca quebram o caminho)', () => {
    expect(MOTOBOY_ROUTES.corrida('d1')).toBe('/motoboy/corrida/d1');
    expect(MOTOBOY_ROUTES.entrega('d1')).toBe('/motoboy/entregas/d1');
    expect(MOTOBOY_ROUTES.perfilPublico('u1')).toBe('/motoboy/u1');
    expect(MOTOBOY_ROUTES.corrida('a/b')).toBe('/motoboy/corrida/a%2Fb');
  });

  it('as abas da barra são as rotas do contrato', () => {
    expect(MOTOBOY_TAB_ROUTES).toEqual([MOTOBOY_ROUTES.corridas, MOTOBOY_ROUTES.ganhos(), MOTOBOY_ROUTES.nivel, MOTOBOY_ROUTES.perfil]);
  });
});
