import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const push = jest.fn();
let mockT: any;
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc123def456' }, push, replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], replaceCart: jest.fn() }) }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => mockT }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => <div>MAPA</div> }));
jest.mock('../components/drop/order/OrderPushPrompt', () => ({ OrderPushPrompt: () => null }));
let mockReturn: any = null;
const mockPost = jest.fn();
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn((url: string) => Promise.resolve({ data: url.endsWith('/return-request') ? mockReturn : { reviewedProductIds: [] } })),
    post: (...a: any[]) => mockPost(...a),
  },
}));
import PedidoPage from '../pages/pedido/[id]';

const order = { _id: 'abc123def456', status: 'entregue', paymentStatus: 'paid', paymentMethod: 'pix', paymentProvider: 'asaas_loja', storeName: 'Eletro Center', storeObj: { address: 'R. dos Pinheiros, 870' }, storeId: 's1', deliveryId: 'd1', deliveryFee: 14.1, subtotal: 229.9, totalValue: 244, createdAt: '2026-10-10T14:02:00', storeRating: 5, products: [] };
const tracking = (over: any = {}) => ({
  order, delivery: { _id: 'd1', status: 'delivered', rating: 5, deliveredAt: '2026-10-10T14:29:00' },
  loading: false, showPin: false, canConfirmReceived: false, confirmReceived: jest.fn(), openPix: jest.fn(), pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), decidePoolTimeout: jest.fn(), decideReturn: jest.fn(), ...over,
});

beforeEach(() => { jest.clearAllMocks(); mockReturn = null; mockPost.mockResolvedValue({ data: { _id: 'rr1', status: 'devolvendo', pin: '48213', amount: 244 } }); });

test('pedido entregue do modo SaaS sem reembolso: "Pedir reembolso" abre a tela do pedido', async () => {
  mockT = tracking();
  render(<PedidoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pedir reembolso' }));
  expect(push).toHaveBeenCalledWith('/pedido/abc123def456/reembolso');
});

test('pedido da custódia ou ainda não entregue: sem "Pedir reembolso"', async () => {
  mockT = tracking({ order: { ...order, paymentProvider: 'asaas' } });
  const { unmount } = render(<PedidoPage />);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Pedir reembolso' })).not.toBeInTheDocument());
  unmount();
  mockT = tracking({ order: { ...order, status: 'enviado' }, delivery: { _id: 'd1', status: 'picked' } });
  render(<PedidoPage />);
  expect(screen.queryByRole('button', { name: 'Pedir reembolso' })).not.toBeInTheDocument();
});

test('reembolso aprovado: "Continuar" escolhe levar na loja e mostra o código', async () => {
  mockReturn = { _id: 'rr1', orderId: order._id, status: 'aprovado', reason: 'defeito', amount: 244, includesDeliveryFee: true };
  mockT = tracking();
  render(<PedidoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/return-requests/rr1/mode', { mode: 'loja' }));
  expect(await screen.findByText('48213')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pedir reembolso' })).not.toBeInTheDocument();
});
