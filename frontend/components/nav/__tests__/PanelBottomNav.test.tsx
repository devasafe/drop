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
  it('mostra 4 itens de bottomNav + botão Mais', () => {
    render(<PanelBottomNav />);
    expect(screen.getByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('botão Mais abre a sidebar lateral (panelSidebar)', () => {
    render(<PanelBottomNav />);
    fireEvent.click(screen.getByText('Mais'));
    expect(toggle).toHaveBeenCalledWith('panelSidebar');
  });
});

describe('PanelBottomNav (ceo)', () => {
  it('não renderiza para admin (ceo) — sem itens de bottomNav', () => {
    mockRole = 'ceo'; mockRoles = ['ceo'];
    const { container } = render(<PanelBottomNav />);
    expect(container).toBeEmptyDOMElement();
  });
});
