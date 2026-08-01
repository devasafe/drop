import { render, screen, fireEvent } from '@testing-library/react';
import PanelBottomNav from '../PanelBottomNav';

const toggle = jest.fn();
let overlayActive: string | null = null;
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/seller/dashboard', query: {}, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 2, deliveries: 0 }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: overlayActive, toggle, close: jest.fn(), open: jest.fn(), isOpen: (id: string) => overlayActive === id }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Léa', activeRole: 'lojista', roles: ['lojista'] }, can: () => true }),
}));

beforeEach(() => { toggle.mockClear(); overlayActive = null; });

describe('PanelBottomNav (lojista)', () => {
  it('mostra 4 itens de bottomNav + botão Mais', () => {
    render(<PanelBottomNav />);
    expect(screen.getByText('Visão geral')).toBeInTheDocument();
    expect(screen.getByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Mais')).toBeInTheDocument();
  });

  it('o drawer "Mais" não repete os itens da bottom-nav', () => {
    overlayActive = 'panelDrawer';
    render(<PanelBottomNav />);
    // "Marketing" é item de drawer; "Visão geral" (bottomNav) não deve reaparecer no drawer
    const drawer = screen.getByRole('dialog');
    expect(drawer).toHaveTextContent('Marketing');
    expect(drawer).not.toHaveTextContent('Visão geral');
  });

  it('botão Mais alterna o overlay panelDrawer', () => {
    render(<PanelBottomNav />);
    fireEvent.click(screen.getByText('Mais'));
    expect(toggle).toHaveBeenCalledWith('panelDrawer');
  });
});
