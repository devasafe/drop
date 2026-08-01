import { render, screen } from '@testing-library/react';
import AppSidebar from '../AppSidebar';

jest.mock('next/router', () => ({ useRouter: () => ({ pathname: '/motoboy/wallet', push: jest.fn() }) }));
jest.mock('../../../hooks/useSync', () => ({ useBadgeCounts: () => ({ verifications: 0, storeOrders: 0, deliveries: 3 }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ active: null, open: jest.fn(), close: jest.fn(), toggle: jest.fn(), isOpen: () => false }),
}));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Beto', activeRole: 'motoboy', roles: ['motoboy'] }, can: () => true }),
}));

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
