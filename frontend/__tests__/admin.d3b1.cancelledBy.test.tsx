/**
 * D3b-1 · P3.5 (nota 4 do controlador) — o cancelamento do admin chega ao cliente e à loja com cancelledBy: 'admin'.
 * Os dois status de cancelamento que eles veem (o do DS, no /pedido do cliente, e o antigo, no /order e no pedido da
 * loja) dizem "Cancelado pelo suporte do DROP", sem a culpa.
 */
import { render, screen } from '@testing-library/react';
import { CancellationStatus } from '../components/drop/order/CancellationStatus';
import { CancellationStatusDisplay } from '../components/order/CancellationStatusDisplay';

const ADMIN_CANCELLATION = {
  _id: 'k1', cancelledBy: 'admin' as const, reasonCode: 'other', reason: 'Motivo gravado pelo servidor',
  refundAmount: 59.9, refundStatus: 'processed' as const,
  createdAt: '2026-10-20T13:20:00.000Z', updatedAt: '2026-10-20T13:20:00.000Z',
};
const mockHistory = jest.fn();
jest.mock('@/hooks/useCancellation', () => ({
  __esModule: true,
  default: () => ({ getCancellationHistory: mockHistory }),
}));

beforeEach(() => {
  mockHistory.mockReset();
  mockHistory.mockResolvedValue({ success: true, data: [ADMIN_CANCELLATION] });
});

it('status do cliente (DS): "Cancelado pelo suporte do DROP"', () => {
  render(<CancellationStatus cancellation={ADMIN_CANCELLATION} />);
  expect(screen.getByText('Cancelado pelo suporte do DROP')).toBeInTheDocument();
  expect(screen.queryByText(/pelo admin/)).toBeNull();
});

it('status antigo (cliente em /order e loja): "Cancelado pelo suporte do DROP"', async () => {
  render(<CancellationStatusDisplay orderId="o1" />);
  expect(await screen.findByText('Cancelado pelo suporte do DROP')).toBeInTheDocument();
  expect(screen.queryByText(/pelo admin/)).toBeNull();
});
