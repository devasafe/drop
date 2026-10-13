/**
 * V13 · no computador, a marca aparece uma vez só no painel da loja: a da Nav (DROP, que leva à Home).
 * O menu lateral do lojista não repete "DROP SELLER". Motoboy e admin seguem como estão.
 */
import { render, screen } from '@testing-library/react';

let mockRole = 'lojista';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/seller/loja', query: {}, push: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', role: mockRole, activeRole: mockRole }, can: () => false }),
}));
jest.mock('../contexts/OverlayContext', () => ({ useOverlay: () => ({ isOpen: () => false, close: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({ useBadgeCounts: () => ({ storeOrders: 0, deliveries: 0, verifications: 0 }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia' }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));

import AppSidebar from '../components/nav/AppSidebar';

test('lojista: o menu lateral não repete a marca, mas segue nomeado para leitor de tela', () => {
  mockRole = 'lojista';
  const { container } = render(<AppSidebar />);
  expect(screen.queryByText('DROP SELLER')).toBeNull();
  expect(container.querySelector('aside')).toHaveAttribute('aria-label', 'Painel do lojista');
  expect(screen.getByRole('link', { name: 'Agora' })).toBeInTheDocument();
});

test('motoboy: o cabeçalho do menu lateral continua', () => {
  mockRole = 'motoboy';
  render(<AppSidebar />);
  expect(screen.getByText('DROP MOTOBOY')).toBeInTheDocument();
});
