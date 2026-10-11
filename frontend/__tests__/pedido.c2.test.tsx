import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ROUTES } from '../lib/routes';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc123def456' }, push, replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], replaceCart: jest.fn() }) }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => <div>MAPA</div> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { reviewedProductIds: [] } })), post: jest.fn() } }));
const order = { _id: 'abc123def456', status: 'pago', paymentStatus: 'paid', paymentMethod: 'pix', storeName: 'Eletro Center', storeId: 's1', deliveryId: 'd1', deliveryFee: 7.4, subtotal: 269.8, totalValue: 277.2, deliveryDuration: 720, createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00', products: [{ productId: 'p1', productName: 'Fone JBL', quantity: 1, price: 229.9 }, { productId: 'p2', productName: 'Cabo USB-C', quantity: 1, price: 39.9 }] };
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => ({
  order, delivery: { status: 'picked', pin: '48213', motoboyObj: { name: 'Carlos Silva', plate: 'ABC1D23', rating: 4.9 } },
  loading: false, showPin: true, canConfirmReceived: false, confirmReceived: jest.fn(), openPix: jest.fn(), pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), steps: [], progress: 0, statusLabel: '', statusTone: 'info',
}) }));
import PedidoPage from '../pages/pedido/[id]';

beforeEach(() => push.mockClear());

test('topo: voltar para Pedidos e ajuda', () => {
  render(<PedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(push).toHaveBeenCalledWith(ROUTES.pedidos);
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda com este pedido' }));
  expect(push).toHaveBeenCalledWith(ROUTES.ajuda);
});

test('itens recolhidos numa linha que abre o resumo', () => {
  render(<PedidoPage />);
  const linha = screen.getByRole('button', { name: /2 itens · Eletro Center/ });
  expect(linha).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Subtotal')).toBeNull();
  fireEvent.click(linha);
  expect(linha).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Subtotal')).toBeInTheDocument();
});

test('PIN em bloco com a dica de sempre', () => {
  render(<PedidoPage />);
  expect(screen.getByText('48213')).toBeInTheDocument();
  expect(screen.getByText('Compartilhe com o motoboy')).toBeInTheDocument();
});
