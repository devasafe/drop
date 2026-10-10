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
import PedidoPage from '../pages/pedido/[id]';

const order = { _id: 'abc123def456', status: 'pago', paymentStatus: 'paid', paymentMethod: 'pix', storeName: 'Eletro Center', storeId: 's1', deliveryId: 'd1', deliveryFee: 7.4, subtotal: 269.8, totalValue: 277.2, deliveryDuration: 720, createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00', products: [{ productId: 'p1', productName: 'Fone JBL', quantity: 1, price: 229.9 }] };
const tracking = (over: any = {}) => ({
  order, delivery: { status: 'picked', pin: '48213', motoboyObj: { name: 'Carlos Silva', plate: 'ABC1D23', rating: 4.9 } },
  loading: false, showPin: true, canConfirmReceived: false, confirmReceived: jest.fn(), openPix, pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), steps: [], progress: 0, statusLabel: '', statusTone: 'info', ...over,
});

test('acompanhando: status, trajeto, entregador, código e timeline com hora real', () => {
  mockT = tracking();
  render(<PedidoPage />);
  expect(screen.getByRole('heading', { name: 'Pedido #DEF456' })).toBeInTheDocument();
  expect(screen.getByText('Eletro Center')).toBeInTheDocument(); // portado de OrderTimeline.test (título com a loja)
  expect(screen.getAllByText('Saiu para entrega').length).toBeGreaterThan(0);
  expect(screen.getByText('Trajeto de cerca de 12 min')).toBeInTheDocument();
  expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
  expect(screen.getAllByText(/ABC1D23/).length).toBeGreaterThan(0); // card do entregador e detalhe da timeline
  expect(screen.getByText('48213')).toBeInTheDocument();
  expect(screen.getByText('Código de entrega')).toBeInTheDocument();
  expect(screen.getByText('14:03')).toBeInTheDocument();
  expect(screen.getByText('Entregue')).toBeInTheDocument(); // passos da timeline (portado de OrderTimeline.test)
  expect(screen.getByRole('button', { name: 'Acompanhar no mapa' })).not.toHaveAttribute('style');
});

test('Pix pendente: aviso com "Pagar com Pix"', () => {
  mockT = tracking({ order: { ...order, status: 'criado', paymentStatus: 'pending', asaasPaymentId: 'pay_1' }, delivery: null, showPin: false });
  render(<PedidoPage />);
  expect(screen.getAllByText('Aguardando pagamento').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Pagar com Pix' }));
  expect(openPix).toHaveBeenCalled();
});

// portado de OrderStatusHero.test: cada estado renderiza o seu rótulo sem quebrar
test.each([
  [{ status: 'entregue' }, { status: 'delivered' }, 'Entregue'],
  [{ status: 'cancelado' }, null, 'Cancelado'],
  [{ status: 'pago' }, { status: 'pending' }, 'Procurando entregador'],
])('estado %p renderiza o rótulo "%s"', (o, d, label) => {
  mockT = tracking({ order: { ...order, ...o }, delivery: d, showPin: false });
  render(<PedidoPage />);
  expect(screen.getAllByText(label as string).length).toBeGreaterThan(0);
});

test('não encontrado: saída útil', () => {
  mockT = tracking({ order: null });
  render(<PedidoPage />);
  expect(screen.getByText('Pedido não encontrado')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver meus pedidos' })).toBeInTheDocument();
});
