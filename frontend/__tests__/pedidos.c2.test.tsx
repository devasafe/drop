import { render, screen } from '@testing-library/react';
import PedidosPage from '../pages/pedidos';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: { tab: 'historico' } }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [
  { _id: 'h1', storeName: 'Pet&Cia', storeId: 's9', status: 'entregue', totalValue: 112.4, products: [{ productName: 'Ração', quantity: 2 }], createdAt: '2026-09-12T19:08:00', storeRating: 5 },
  { _id: 'h2', storeName: 'Eletro Center', storeId: 's1', status: 'cancelado', paymentStatus: 'refunded', totalValue: 39.9, products: [], createdAt: '2026-09-01T10:00:00' },
], loading: false, refetch: jest.fn() }) }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../hooks/useReorder', () => ({ useReorder: () => ({ reorder: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));

test('histórico no formato do protótipo', () => {
  render(<PedidosPage />);
  expect(screen.getByText('Pet&Cia · R$ 112,40')).toBeInTheDocument();
  expect(screen.getByText('Entregue 12/09 · 2 itens')).toBeInTheDocument();
  expect(screen.getByText('Cancelado 01/09 · estorno feito')).toBeInTheDocument();
});
