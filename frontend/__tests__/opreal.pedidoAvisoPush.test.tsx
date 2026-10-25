import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const openPix = jest.fn(async () => ({ ok: true }));
let mockT: any;
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc123def456' }, push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], replaceCart: jest.fn() }) }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => mockT }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => <div>MAPA</div> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { reviewedProductIds: [] } })), post: jest.fn() } }));
jest.mock('../components/drop/order/OrderPushPrompt', () => ({ OrderPushPrompt: () => <div>CONVITE PUSH</div> }));
import PedidoPage from '../pages/pedido/[id]';

const order = { _id: 'abc123def456', status: 'pago', paymentStatus: 'paid', paymentMethod: 'pix', storeName: 'Eletro Center', storeId: 's1', deliveryId: 'd1', deliveryFee: 7.4, subtotal: 269.8, totalValue: 277.2, deliveryDuration: 720, createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00', products: [{ productId: 'p1', productName: 'Fone JBL', quantity: 1, price: 229.9 }] };
const tracking = (over: any = {}) => ({
  order, delivery: { status: 'picked', pin: '48213', motoboyObj: { name: 'Carlos Silva', plate: 'ABC1D23', rating: 4.9 } },
  loading: false, showPin: true, canConfirmReceived: false, confirmReceived: jest.fn(), openPix, pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), steps: [], progress: 0, statusLabel: '', statusTone: 'info', ...over,
});

/** Avisos ao cliente: o convite para ativar o push aparece no pedido em andamento já pago. */
test.each([
  ['pago, procurando entregador', { status: 'pago' }, { status: 'pending' }],
  ['saiu para entrega', {}, undefined],
  ['aguardando a loja', { status: 'criado' }, null],
])('convite do push aparece: %s', (_n, o, d) => {
  mockT = tracking({ order: { ...order, ...o }, ...(d === undefined ? {} : { delivery: d }) });
  render(<PedidoPage />);
  expect(screen.getByText('CONVITE PUSH')).toBeInTheDocument();
});

test.each(['entregue', 'cancelado', 'rejeitado'])('pedido %s: sem convite do push', (status) => {
  mockT = tracking({ order: { ...order, status }, showPin: false });
  render(<PedidoPage />);
  expect(screen.queryByText('CONVITE PUSH')).not.toBeInTheDocument();
});

test('Pix ainda não pago: o aviso é o do pagamento, sem convite do push', () => {
  mockT = tracking({ order: { ...order, status: 'criado', paymentStatus: 'pending', asaasPaymentId: 'pay_1' }, delivery: null, showPin: false });
  render(<PedidoPage />);
  expect(screen.queryByText('CONVITE PUSH')).not.toBeInTheDocument();
});
