import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { useOrder } from '../hooks/useSync';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'o1' }, asPath: '/x', pathname: '/x', isReady: true }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), isConnected: true }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: [], loading: false }) }));
jest.mock('../hooks/useSync', () => ({ useOrder: jest.fn() }));
jest.mock('../components/order/CancellationStatusDisplay', () => ({ CancellationStatusDisplay: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

import AgoraPage from '../pages/seller/dashboard';
import SellerPedidoPage from '../pages/seller/pedido/[id]';

const post = api.post as jest.Mock;
const get = api.get as jest.Mock;
const novo = { _id: 'o1', status: 'criado', totalValue: 50, deliveryDistance: 3.1, customerName: 'Ana', createdAt: new Date().toISOString(), acceptDeadline: new Date(Date.now() + 600000).toISOString(), products: [{ productId: 'p1', productName: 'X', quantity: 1, price: 50 }] };

let logs: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { store: { _id: 's1', name: 'Loja', isOpen: true }, orders: [novo], refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 1 };
  get.mockRejectedValue(new Error('n/a'));
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => { logs.forEach((s) => s.mockRestore()); });

describe('Etapa 0 · aceite (tela nova)', () => {
  test('POST /orders/:id/accept com { distance } da entrega, uma vez', async () => {
    post.mockResolvedValue({ data: { requiresDelivery: true } });
    render(<AgoraPage />);
    const card = screen.getByTestId('novo-o1');
    fireEvent.click(within(card).getByRole('button', { name: /aceitar pedido/i }));
    fireEvent.click(within(card).getByRole('button', { name: /toque de novo/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/accept', { distance: 3.1 }));
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('Etapa 0 · recusa com reasonCode (tela nova)', () => {
  test.each([
    ['Vou fechar', 'store_closed', 'Loja está fechada no momento'],
    ['Loja cheia agora', 'store_busy', 'Muitos pedidos para processar'],
    ['Acabou um item', 'not_available', 'Item fora de estoque'],
    ['Problema no pagamento', 'payment_issue', 'Problema com o pagamento'],
  ])('%s → POST /orders/:id/reject { reason, reasonCode: %s }', async (label, reasonCode, reason) => {
    post.mockResolvedValue({ data: { success: true, refundStatus: 'processed', refundAmount: 50 } });
    render(<AgoraPage />);
    fireEvent.click(within(screen.getByTestId('novo-o1')).getByRole('button', { name: 'Recusar' }));
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/reject', { reason, reasonCode }));
  });
});

describe('Etapa 0 · PIN de retirada (tela nova)', () => {
  const assigned = { ...novo, status: 'aguardando_motoboy', acceptedAt: new Date().toISOString(), deliveryId: 'd1', deliveryFee: 7, delivery: { _id: 'd1', status: 'assigned', motoboyId: 'm1', motoboyName: 'Carlos' } };
  beforeEach(() => {
    (useOrder as jest.Mock).mockReturnValue({ order: assigned, loading: false, setOrder: jest.fn() });
    mockPanel.orders = [assigned];
  });

  test('um envio por PIN completo, payload { pinRetirada }, sem reenvio do mesmo PIN', async () => {
    post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'PIN de retirada inválido' } } });
    render(<SellerPedidoPage />);
    const input = screen.getByLabelText(/PIN de 5 dígitos/);
    fireEvent.change(input, { target: { value: '1234' } });
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '12345' } });
    await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/validar-pin-retirada', { pinRetirada: '12345' }));
    await screen.findByRole('alert');
    fireEvent.change(input, { target: { value: '1234' } });
    fireEvent.change(input, { target: { value: '12345' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(post).toHaveBeenCalledTimes(1);
    for (const s of logs) for (const c of s.mock.calls) expect(JSON.stringify(c)).not.toContain('12345');
  });

  test('lockout 429 aparece em texto legível', async () => {
    post.mockRejectedValue({ response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 15 min.', code: 'PIN_LOCKED' } } });
    render(<SellerPedidoPage />);
    fireEvent.change(screen.getByLabelText(/PIN de 5 dígitos/), { target: { value: '12345' } });
    expect(await screen.findByText('Muitas tentativas de PIN. Tente novamente em 15 min.')).toBeInTheDocument();
  });
});
