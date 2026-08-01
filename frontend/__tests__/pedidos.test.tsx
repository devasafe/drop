import { render, screen, fireEvent } from '@testing-library/react';
import UserDashboard from '../pages/user-dashboard';

const orders = [
  { _id: 'p1', storeName: 'Loja Ativa', status: 'enviado', totalValue: 30, products: [{ name: 'Pizza', quantity: 2 }] },
  { _id: 'h1', storeName: 'Loja Antiga', status: 'entregue', totalValue: 20, products: [{ name: 'Burger', quantity: 1 }], createdAt: '2026-07-01T12:00:00Z' },
];

jest.mock('../contexts/AuthContext', () => {
  const React = require('react');
  return { __esModule: true, default: React.createContext({ user: { id: 'u1', name: 'Teste', roles: ['cliente'] } }) };
});
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: {} }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));
jest.mock('../hooks/useSync', () => ({
  useOrders: () => ({ orders, loading: false, refetch: jest.fn() }),
}));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));

describe('Pedidos (/user-dashboard)', () => {
  it('mostra cabeçalho Pedidos e o pedido em andamento como card', async () => {
    render(<UserDashboard />);
    expect(await screen.findByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Loja Ativa')).toBeInTheDocument();
    // o pedido concluído não aparece na aba padrão (Em andamento)
    expect(screen.queryByText('Loja Antiga')).toBeNull();
  });

  it('trocar para Histórico mostra o pedido concluído', async () => {
    render(<UserDashboard />);
    await screen.findByText('Pedidos');
    const chip = screen.getAllByText(/Histórico/).find((el) => el.tagName !== 'OPTION');
    fireEvent.click(chip!);
    expect(screen.getByText('Loja Antiga')).toBeInTheDocument();
  });
});
