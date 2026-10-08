import { render, screen } from '@testing-library/react';
import SellerOrderDetailPage from '../pages/seller/order-[id]';
import { useOrder } from '../hooks/useSync';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'o1' }, asPath: '/seller/order-o1' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), isConnected: false }) }));
jest.mock('../hooks/useSync', () => ({ useOrder: jest.fn() }));
jest.mock('../components/order/OrderActionsCard', () => ({ OrderActionsCard: () => null }));
jest.mock('../components/order/CancellationStatusDisplay', () => ({ CancellationStatusDisplay: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

const base = { _id: 'o1', storeId: 's1', status: 'cancelado', products: [], totalValue: 50, deliveryFee: 0, customerName: 'C' };
const mockOrder = (extra: any) => (useOrder as jest.Mock).mockReturnValue({ order: { ...base, ...extra }, loading: false });

test('pedido direto com estorno falho mostra o card, o erro legivel e o botao', () => {
  mockOrder({ directRefund: { status: 'failed', amount: 50, lastError: 'Saldo insuficiente', attempts: 1 } });
  render(<SellerOrderDetailPage />);
  expect(screen.getByText('Estorno')).toBeInTheDocument();
  expect(screen.getByText('A loja não tem saldo no Asaas para este estorno')).toBeInTheDocument();
  expect(screen.getByText('Estornar')).toBeInTheDocument();
});

test('estorno done: card sem botao', () => {
  mockOrder({ directRefund: { status: 'done', amount: 50, lastError: null, attempts: 1 } });
  render(<SellerOrderDetailPage />);
  expect(screen.getByText('Estorno')).toBeInTheDocument();
  expect(screen.queryByText('Estornar')).not.toBeInTheDocument();
});

test('sem directRefund (pedido nao direto): sem card', () => {
  mockOrder({ directRefund: null });
  render(<SellerOrderDetailPage />);
  expect(screen.queryByText('Estorno')).not.toBeInTheDocument();
});
