import { MOTOBOY_TAB_ROUTES, motoboyShowsTabBar, isMotoboyPanelRoute } from '../motoboyRoutes';

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
