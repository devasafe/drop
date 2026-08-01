import { render, screen } from '@testing-library/react';
import AppSidebar from '../AppSidebar';

let mockPathname = '/motoboy/wallet';
let mockQuery: Record<string, string> = {};
let mockRole = 'motoboy';
let mockRoles = ['motoboy'];

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, query: mockQuery, push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 3 }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: null, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), isOpen: () => false }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'X', activeRole: mockRole, roles: mockRoles }, can: () => true }),
}));

beforeEach(() => {
  mockPathname = '/motoboy/wallet';
  mockQuery = {};
  mockRole = 'motoboy';
  mockRoles = ['motoboy'];
});

describe('AppSidebar (motoboy)', () => {
  it('renderiza os itens de sidebar da role e marca o ativo por rota', () => {
    render(<AppSidebar />);
    expect(screen.getByText('Ganhos e saques')).toBeInTheDocument();
    expect(screen.getByText('Entregas')).toBeInTheDocument();
    const ativo = screen.getByText('Ganhos e saques').closest('a');
    expect(ativo?.getAttribute('aria-current')).toBe('page');
  });

  it('mostra o badge de deliveries em Entregas', () => {
    render(<AppSidebar />);
    // 3 entregas pendentes vira pill numérico
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('AppSidebar (lojista)', () => {
  it('lojista: só o item do tab atual fica ativo (?tab=orders → Pedidos)', () => {
    mockRole = 'lojista'; mockRoles = ['lojista'];
    mockPathname = '/seller/dashboard'; mockQuery = { tab: 'orders' };
    render(<AppSidebar />);
    const pedidos = screen.getByText('Pedidos').closest('a');
    expect(pedidos?.getAttribute('aria-current')).toBe('page');
    // "Visão geral" aparece duas vezes: como rótulo do grupo (div) e como
    // label do próprio item (a) — o grupo e o item de topo compartilham nome.
    const visaoGeralLink = screen.getAllByText('Visão geral')
      .map((el) => el.closest('a'))
      .find((el): el is HTMLAnchorElement => el !== null);
    expect(visaoGeralLink?.getAttribute('aria-current')).toBeNull();
  });
});
