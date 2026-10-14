import { render, screen, fireEvent } from '@testing-library/react';
import PanelBottomNav from '../PanelBottomNav';

const toggle = jest.fn();
let overlayActive: string | null = null;
let mockPathname = '/seller/dashboard';
let mockQuery: Record<string, string> = {};
let mockRole = 'lojista';
let mockRoles = ['lojista'];

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, query: mockQuery, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 2, deliveries: 0 }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: overlayActive, toggle, close: jest.fn(), open: jest.fn(), isOpen: (id: string) => overlayActive === id }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Léa', activeRole: mockRole, roles: mockRoles }, can: () => true }),
}));

beforeEach(() => {
  toggle.mockClear();
  overlayActive = null;
  mockPathname = '/seller/dashboard';
  mockQuery = {};
  mockRole = 'lojista';
  mockRoles = ['lojista'];
});

describe('PanelBottomNav (lojista)', () => {
  it('mostra as 5 abas e nenhum botão Mais', () => {
    render(<PanelBottomNav />);
    for (const l of ['Agora', 'Pedidos', 'Produtos', 'Dinheiro', 'Loja']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText('Mais')).toBeNull();
  });

  it('badge de pedidos na aba Pedidos', () => {
    render(<PanelBottomNav />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('aba ativa pela rota', () => {
    mockPathname = '/seller/edit-product'; mockQuery = { edit: 'p1' };
    render(<PanelBottomNav />);
    expect(screen.getByText('Produtos').closest('button')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Agora').closest('button')?.getAttribute('aria-current')).toBeNull();
  });
});

describe('PanelBottomNav (motoboy)', () => {
  it('4 abas e nenhum botão Mais (D2)', () => {
    mockRole = 'motoboy'; mockRoles = ['motoboy']; mockPathname = '/motoboy';
    render(<PanelBottomNav />);
    for (const l of ['Corridas', 'Ganhos', 'Nível', 'Perfil']) expect(screen.getByText(l)).toBeInTheDocument();
    expect(screen.queryByText('Mais')).toBeNull();
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('PanelBottomNav (ceo)', () => {
  it('não renderiza para admin (ceo) — sem itens de bottomNav', () => {
    mockRole = 'ceo'; mockRoles = ['ceo'];
    const { container } = render(<PanelBottomNav />);
    expect(container).toBeEmptyDOMElement();
  });
});
