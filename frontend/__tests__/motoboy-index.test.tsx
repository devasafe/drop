import { render, screen } from '@testing-library/react';
import MotoboyPage from '../pages/motoboy/index';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: {} }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useMotoboyStatus', () => ({ useMotoboyStatus: jest.fn() }));
jest.mock('../hooks/useSync', () => ({
  useDeliveries: jest.fn(),
  useOngoingDeliveries: jest.fn(),
  useDeliveryHistory: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({
  __esModule: true,
  default: require('react').createContext({ user: { name: 'Moto' } }),
  useAuth: () => ({ user: { name: 'Moto' } }),
}));

import { useMotoboyStatus } from '../hooks/useMotoboyStatus';
import { useDeliveries, useOngoingDeliveries, useDeliveryHistory } from '../hooks/useSync';

const offer = { _id: 'd1', orderId: 'o123456', fee: 10, distance: 2, pickupLocation: 'Loja' };

beforeEach(() => {
  (useOngoingDeliveries as jest.Mock).mockReturnValue({ deliveries: [], loading: false });
  (useDeliveryHistory as jest.Mock).mockReturnValue({ deliveries: [], loading: false });
});

test('online: mostra as ofertas do pool', () => {
  (useMotoboyStatus as jest.Mock).mockReturnValue({ online: true, loading: false, setOnline: jest.fn() });
  (useDeliveries as jest.Mock).mockReturnValue({ deliveries: [offer], loading: false, setDeliveries: jest.fn() });
  render(<MotoboyPage />);
  expect(screen.getByText(/pedido #123456/i)).toBeInTheDocument();
});

test('offline: mostra o EmptyState de offline', () => {
  (useMotoboyStatus as jest.Mock).mockReturnValue({ online: false, loading: false, setOnline: jest.fn() });
  (useDeliveries as jest.Mock).mockReturnValue({ deliveries: [], loading: false, setDeliveries: jest.fn() });
  render(<MotoboyPage />);
  expect(screen.getByText(/você está offline/i)).toBeInTheDocument();
});
