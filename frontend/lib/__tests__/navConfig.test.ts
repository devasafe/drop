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

  it('cliente tem os 5 itens de bottomNav na ordem certa', () => {
    const items = getNavItems('cliente', allow, false);
    expect(items.map((i) => i.label)).toEqual(
      ['Início', 'Buscar', 'Pedidos', 'Carteira', 'Perfil'],
    );
    expect(items.every((i) => i.placement.includes('bottomNav'))).toBe(true);
  });

  it('lojista usa "Financeiro da loja" e nunca expõe "Solicitar saque"', () => {
    const labels = getNavItems('lojista', allow, false).map((i) => i.label);
    expect(labels).toContain('Financeiro da loja');
    expect(labels).not.toContain('Solicitar saque');
  });

  it('motoboy usa "Ganhos e saques" e rotas reais', () => {
    const items = getNavItems('motoboy', allow, false);
    const ganhos = items.find((i) => i.label === 'Ganhos e saques');
    expect(ganhos?.route).toBe('/motoboy/wallet');
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
});
