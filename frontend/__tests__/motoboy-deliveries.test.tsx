import { render, screen } from '@testing-library/react';
import MotoboyDeliveries from '../pages/motoboy/ongoing';

jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useRequireAuth', () => ({ __esModule: true, default: () => {} }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../hooks/useSync', () => ({
  useOngoingDeliveries: jest.fn(),
  useDeliveryHistory: jest.fn(),
}));

const push = jest.fn();
const replace = jest.fn();
let query: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ query, push, replace }) }));

import { useOngoingDeliveries, useDeliveryHistory } from '../hooks/useSync';

const ongoing = [{ _id: 'o1', orderId: 'oAAAAAA', status: 'picked', fee: 10, distance: 2, pickupLocation: 'Loja' }];
const history = [{ _id: 'h1', orderId: 'hBBBBBB', status: 'delivered', fee: 20, rating: 5, updatedAt: '2026-08-03T10:00:00' }];

beforeEach(() => {
  (useOngoingDeliveries as jest.Mock).mockReturnValue({ deliveries: ongoing, loading: false, refetch: jest.fn() });
  (useDeliveryHistory as jest.Mock).mockReturnValue({ deliveries: history, loading: false });
});

test('aba Em andamento mostra as entregas ativas', () => {
  query = {};
  render(<MotoboyDeliveries />);
  expect(screen.getByText('Em trânsito')).toBeInTheDocument();
});

test('aba Histórico (via ?tab=history) mostra o histórico e os stats', () => {
  query = { tab: 'history' };
  render(<MotoboyDeliveries />);
  expect(screen.getByText('Entregue')).toBeInTheDocument();
  expect(screen.getByText('Ganhos')).toBeInTheDocument();
});
