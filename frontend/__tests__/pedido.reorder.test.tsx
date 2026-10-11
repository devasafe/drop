import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const reorder = jest.fn(async () => ({ storeId: 's1', storeName: 'Eletro Center', added: 1, skipped: [], priceChanged: [] }));
const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'o1' }, push, replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../hooks/useReorder', () => ({ useReorder: () => ({ reorder }) }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { reviewedProductIds: [] } })), post: jest.fn() } }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => ({
  order: { _id: 'o1', status: 'entregue', storeId: 's1', storeName: 'Eletro Center', deliveryId: 'd1', deliveryFee: 7.4, products: [], createdAt: '2026-10-10T14:02:00' },
  delivery: { status: 'delivered', rating: null }, loading: false, showPin: false, canConfirmReceived: false,
  confirmReceived: jest.fn(), openPix: jest.fn(), pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(), steps: [], progress: 1, statusLabel: '', statusTone: 'success',
}) }));
import PedidoPage from '../pages/pedido/[id]';

test('pedido entregue: "Comprar de novo" monta a sacola', async () => {
  render(<PedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Comprar de novo' }));
  await screen.findByRole('button', { name: 'Comprar de novo' });
  expect(reorder).toHaveBeenCalledWith('o1');
  expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull(); // entregue: cancelar some (spec §4 regra 11 + protótipo)
});
