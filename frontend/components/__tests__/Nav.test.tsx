import { render, screen } from '@testing-library/react';
import Nav from '../Nav';

let mockUser: any = { name: 'X', activeRole: 'cliente', roles: ['cliente'] };
let mockCan: (p: string) => boolean = () => false;

// pathname é usado pelo Nav p/ marcar o link ativo (isItemActive) — sem ele,
// router.pathname.startsWith(...) quebra.
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), pathname: '/' }) }));
jest.mock('../../hooks/useSync', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
  useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 0 }),
}));
jest.mock('../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ isOpen: () => false, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), active: null }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: mockCan }),
}));
// Nav mostra o botão de carrinho (badge de quantidade) via useCart — em produção
// sempre dentro do CartProvider (no _app). No teste, provê um carrinho vazio.
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ cart: [] }),
}));
jest.mock('../nav/AccountMenu', () => () => null);

const logoHref = () => screen.getByAltText('DROP').closest('a')?.getAttribute('href');

describe('Nav — logo leva à Home da role', () => {
  beforeEach(() => { mockUser = { name: 'X', activeRole: 'cliente', roles: ['cliente'] }; mockCan = () => false; });

  it('cliente → /inicio', () => {
    render(<Nav />);
    expect(logoHref()).toBe('/inicio');
  });
  it('lojista → /seller/dashboard', () => {
    mockUser = { name: 'X', activeRole: 'lojista', roles: ['lojista'] };
    render(<Nav />);
    expect(logoHref()).toBe('/seller/dashboard');
  });
  it('motoboy → /motoboy', () => {
    mockUser = { name: 'X', activeRole: 'motoboy', roles: ['motoboy'] };
    render(<Nav />);
    expect(logoHref()).toBe('/motoboy');
  });
  it('ceo → /admin/dashboard', () => {
    mockUser = { name: 'X', activeRole: 'ceo', roles: ['ceo'] };
    render(<Nav />);
    expect(logoHref()).toBe('/admin/dashboard');
  });
  it('admin delegado (marketing) com permissões → /admin/dashboard', () => {
    mockUser = { name: 'X', activeRole: 'marketing', roles: ['marketing'] };
    mockCan = () => true;
    render(<Nav />);
    expect(logoHref()).toBe('/admin/dashboard');
  });
});
