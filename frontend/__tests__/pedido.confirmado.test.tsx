import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { markJustPaid } from '../lib/justPaid';

let mockOrder: any;
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'o1' }, push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { reviewedProductIds: [] } })), post: jest.fn() } }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => ({
  order: mockOrder, delivery: null, loading: false, showPin: false, canConfirmReceived: false,
  confirmReceived: jest.fn(), openPix: jest.fn(), pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), steps: [], progress: 0, statusLabel: '', statusTone: 'info',
}) }));
import PedidoPage from '../pages/pedido/[id]';

const order = { _id: 'o1', status: 'criado', paymentStatus: 'paid', paymentMethod: 'pix', storeName: 'Eletro Center', storeId: 's1', deliveryId: 'd1', deliveryFee: 7.4, totalValue: 244, products: [], createdAt: '2026-10-10T14:02:00' };
beforeEach(() => { sessionStorage.clear(); mockOrder = order; });

test('acabou de pagar e está pago: mostra a confirmação uma vez; "Acompanhar" volta ao pedido', () => {
  markJustPaid('o1');
  const { unmount } = render(<PedidoPage />);
  expect(screen.getByRole('heading', { name: 'Pagamento aprovado' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Acompanhar pedido' }));
  expect(screen.queryByRole('heading', { name: 'Pagamento aprovado' })).toBeNull();
  unmount();
  render(<PedidoPage />);
  expect(screen.queryByRole('heading', { name: 'Pagamento aprovado' })).toBeNull();
});

test('marcado mas ainda pendente: não mostra e guarda a marca para quando pagar', () => {
  markJustPaid('o1');
  mockOrder = { ...order, paymentStatus: 'pending' };
  render(<PedidoPage />);
  expect(screen.queryByRole('heading', { name: 'Pagamento aprovado' })).toBeNull();
  expect(sessionStorage.getItem('drop:justPaid')).toBe('o1');
});

test('sem a marca (abriu o pedido depois): acompanhamento normal', () => {
  render(<PedidoPage />);
  expect(screen.queryByRole('heading', { name: 'Pagamento aprovado' })).toBeNull();
});
