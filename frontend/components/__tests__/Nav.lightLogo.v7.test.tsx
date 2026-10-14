/**
 * V7 (auditoria visual D1, M1a): no tema claro (painel da loja no computador), a logo da Nav
 * não pode ser a arte para fundo escuro ("DR" branco sobre branco). Vira a marca do DS, com tokens.
 */
import { render, screen } from '@testing-library/react';
import Nav from '../Nav';

let mockPath = '/seller/dashboard';
const mockUser = { name: 'X', activeRole: 'lojista', roles: ['lojista'] };
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), pathname: mockPath, query: {} }) }));
jest.mock('../../hooks/useSync', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
  useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 0 }),
}));
jest.mock('../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ isOpen: () => false, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), active: null }),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, can: () => false }) }));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../nav/AccountMenu', () => () => null);

it('tema claro (painel da loja): marca do DS em texto, sem a imagem para fundo escuro', () => {
  mockPath = '/seller/dashboard';
  const { container } = render(<Nav />);
  expect(container.querySelector('img[src*="logog_png"]')).toBeNull();
  const link = screen.getByRole('link', { name: 'DROP' });
  expect(link).toHaveAttribute('href', '/seller/dashboard');
  expect(link).toHaveTextContent('DROP');
});

it('tema escuro (admin): continua a arte para fundo escuro', () => {
  mockPath = '/admin/dashboard';
  render(<Nav />);
  expect(screen.getByAltText('DROP').getAttribute('src')).toMatch(/logog_png/);
});

it('motoboy (night-auto, claro de dia): marca do DS, não a arte para fundo escuro', () => {
  mockPath = '/motoboy';
  const { container } = render(<Nav />);
  expect(container.querySelector('img[src*="logog_png"]')).toBeNull();
  expect(screen.getByRole('link', { name: 'DROP' })).toHaveTextContent('DROP');
});
