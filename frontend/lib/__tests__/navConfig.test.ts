import {
  ROLE_HOME, ROLE_AREAS, getNavItems, isItemActive, NavItem,
} from '../navConfig';

const allow = () => true;
const deny = () => false;

describe('navConfig', () => {
  it('mapeia a Home de cada role', () => {
    expect(ROLE_HOME.cliente).toBe('/inicio');
    expect(ROLE_HOME.lojista).toBe('/seller/dashboard');
    expect(ROLE_HOME.motoboy).toBe('/motoboy');
    expect(ROLE_HOME.ceo).toBe('/admin/dashboard');
  });

  it('cliente tem os 4 itens de bottomNav na ordem certa', () => {
    const items = getNavItems('cliente', allow, false).filter((i) => i.placement.includes('bottomNav'));
    expect(items.map((i) => i.label)).toEqual(
      ['Início', 'Buscar', 'Pedidos', 'Conta'],
    );
  });

  it('lojista usa "Dinheiro" e nunca expõe "Solicitar saque"', () => {
    const labels = getNavItems('lojista', allow, false).map((i) => i.label);
    expect(labels).toContain('Dinheiro');
    expect(labels).not.toContain('Solicitar saque');
  });

  it('motoboy: a aba de dinheiro é "Ganhos" em /motoboy/ganhos', () => {
    const items = getNavItems('motoboy', allow, false);
    expect(items.find((i) => i.label === 'Ganhos')?.route).toBe('/motoboy/ganhos');
  });

  it('ceo deriva itens do ADMIN_MENU com grupos e respeita permissão', () => {
    const ceo = getNavItems('ceo', deny, true);
    expect(ceo.length).toBeGreaterThan(0);
    expect(ceo.find((i) => i.route === '/admin/dashboard')?.group).toBe('Visão geral');
    // não-CEO sem permissões não vê itens delegáveis
    expect(getNavItems('ceo', deny, false)).toEqual([]);
  });

  it('filtra itens por permissão via can()', () => {
    const withoutPerm = getNavItems('lojista', deny, false);
    // itens sem `permission` continuam; os com permission somem
    expect(withoutPerm.every((i) => !i.permission)).toBe(true);
  });

  it('ROLE_AREAS cobre as 4 roles com home e descrição', () => {
    expect(ROLE_AREAS.map((a) => a.role).sort()).toEqual(
      ['ceo', 'cliente', 'lojista', 'motoboy'],
    );
    expect(ROLE_AREAS.every((a) => a.description.length > 0 && a.home)).toBe(true);
  });

  it('isItemActive casa por activeMatch/route com prefixo', () => {
    const item: NavItem = {
      label: 'Entregas', icon: 'truck', route: '/motoboy/ongoing',
      placement: ['sidebar'], activeMatch: '/motoboy/ongoing',
    };
    expect(isItemActive(item, '/motoboy/ongoing')).toBe(true);
    expect(isItemActive(item, '/motoboy/ongoing/123')).toBe(true);
    expect(isItemActive(item, '/motoboy')).toBe(false);
  });

  it('Buscar (route "/") fica ativo em /, /stores, /product e /produtos — não o Início', () => {
    const items = getNavItems('cliente', () => true, false);
    const activeLabel = (pathname: string) =>
      items.find((i) => isItemActive(i, pathname))?.label;
    expect(activeLabel('/')).toBe('Buscar');
    expect(activeLabel('/stores')).toBe('Buscar');
    expect(activeLabel('/stores/abc')).toBe('Buscar');
    expect(activeLabel('/product/xyz')).toBe('Buscar');
    expect(activeLabel('/produtos')).toBe('Buscar');
    // Início só na própria rota, nunca em "/"
    expect(activeLabel('/inicio')).toBe('Início');
    expect(isItemActive(items.find((i) => i.label === 'Início')!, '/')).toBe(false);
  });

  it('motoboy: "Corridas" fica ativa só nas rotas dela, nunca junto de outra aba', () => {
    const items = getNavItems('motoboy', () => true, false);
    const active = (pathname: string) =>
      items.filter((i) => isItemActive(i, pathname)).map((i) => i.label);
    expect(active('/motoboy')).toEqual(['Corridas']);
    expect(active('/motoboy/ganhos')).toEqual(['Ganhos']);
    expect(active('/motoboy/nivel')).toEqual(['Nível']);
    expect(active('/motoboy/perfil')).toEqual(['Perfil']);
  });

  it('Conta fica ativo em /user-profile e /editar-conta (não só /minha-conta)', () => {
    const items = getNavItems('cliente', () => true, false);
    const perfil = items.find((i) => i.label === 'Conta')!;
    expect(isItemActive(perfil, '/minha-conta')).toBe(true);
    expect(isItemActive(perfil, '/user-profile')).toBe(true);
    expect(isItemActive(perfil, '/editar-conta')).toBe(true);
  });

  it('resolve o estado ativo por rota no painel do lojista (um item por vez)', () => {
    const items = getNavItems('lojista', () => true, false);
    const active = (pathname: string, query: Record<string, string>) =>
      items.filter((i) => isItemActive(i, pathname, query)).map((i) => i.label);

    // Aba Agora
    expect(active('/seller/dashboard', {})).toEqual(['Agora']);
    // Pedidos (o ?tab= que sobra do redirect antigo não muda nada)
    expect(active('/seller/pedidos', { seg: 'andamento', tab: 'orders' })).toEqual(['Pedidos']);
  });
});
