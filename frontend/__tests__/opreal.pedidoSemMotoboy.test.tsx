import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const showToast = jest.fn();
let mockT: any;
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc123def456' }, push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], replaceCart: jest.fn() }) }));
jest.mock('../hooks/useOrderTracking', () => ({ useOrderTracking: () => mockT }));
jest.mock('../hooks/useCancellation', () => ({ useCancellation: () => ({ cancelOrder: jest.fn(), getCancellationHistory: jest.fn(async () => ({ success: true, data: [] })) }) }));
jest.mock('../components/map/presets/ClienteTrackingMap', () => ({ ClienteTrackingMap: () => <div>MAPA</div> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { reviewedProductIds: [] } })), post: jest.fn() } }));
jest.mock('../components/drop/order/OrderPushPrompt', () => ({ OrderPushPrompt: () => null }));
import PedidoPage from '../pages/pedido/[id]';

const order = { _id: 'abc123def456', status: 'aguardando_motoboy', paymentStatus: 'paid', paymentMethod: 'pix', storeName: 'Pet Bom', storeId: 's1', deliveryId: 'd1', deliveryFee: 7.4, subtotal: 182.4, totalValue: 189.8, createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00', products: [{ productId: 'p1', productName: 'Ração', quantity: 1, price: 182.4 }] };
const tracking = (over: any = {}) => ({
  order, delivery: { _id: 'd1', status: 'pending', createdAt: new Date(Date.now() - 16 * 60000).toISOString() },
  loading: false, showPin: false, canConfirmReceived: false, confirmReceived: jest.fn(), openPix: jest.fn(), pixData: null, closePix: jest.fn(), refetch: jest.fn(),
  submitMotoboyRating: jest.fn(), submitStoreRating: jest.fn(),
  decidePoolTimeout: jest.fn(async () => ({ ok: true })), decideReturn: jest.fn(async () => ({ ok: true })), ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('pedido sem motoboy', () => {
  it('pool expirou: mostra a pergunta com as duas saídas', () => {
    mockT = tracking({ order: { ...order, awaitingCustomerPoolDecision: true } });
    render(<PedidoPage />);
    expect(screen.getByText('Sem motoboy por enquanto', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Procuramos por 16 min perto da Pet Bom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelar e receber R\$ 189,80/ })).toBeInTheDocument();
  });

  it('continuar esperando: chama a decisão e mostra "procurando de novo"', async () => {
    mockT = tracking({ order: { ...order, awaitingCustomerPoolDecision: true } });
    const { rerender } = render(<PedidoPage />);
    fireEvent.click(screen.getByRole('button', { name: /Continuar esperando/ }));
    await waitFor(() => expect(mockT.decidePoolTimeout).toHaveBeenCalledWith('seguir'));
    // O hook limpa a flag; a página mostra o aviso azul enquanto segue procurando.
    mockT = tracking({ order: { ...order, awaitingCustomerPoolDecision: false }, decidePoolTimeout: mockT.decidePoolTimeout });
    rerender(<PedidoPage />);
    expect(screen.getByText('Procurando de novo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continuar esperando/ })).not.toBeInTheDocument();
  });

  it('cancelar: chama a decisão de cancelar', async () => {
    mockT = tracking({ order: { ...order, awaitingCustomerPoolDecision: true } });
    render(<PedidoPage />);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar e receber/ }));
    await waitFor(() => expect(mockT.decidePoolTimeout).toHaveBeenCalledWith('cancelar'));
  });

  it('erro na decisão vira toast', async () => {
    mockT = tracking({ order: { ...order, awaitingCustomerPoolDecision: true }, decidePoolTimeout: jest.fn(async () => ({ ok: false, error: 'Falhou' })) });
    render(<PedidoPage />);
    fireEvent.click(screen.getByRole('button', { name: /Continuar esperando/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Falhou', 'error'));
  });

  it('procurando normalmente (sem pergunta): nada de cards de decisão', () => {
    mockT = tracking();
    render(<PedidoPage />);
    expect(screen.queryByRole('button', { name: /Continuar esperando/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Procurando de novo')).not.toBeInTheDocument();
  });
});

describe('entrega interrompida', () => {
  const returning = { _id: 'd1', status: 'picked', statusDevolucao: 'aguardando_confirmacao', motoboyObj: { name: 'Carlos Silva', plate: 'ABC1D23' } };

  it('mostra "Entrega interrompida" e a escolha, sem código de entrega nem convite ao mapa', () => {
    mockT = tracking({ order: { ...order, status: 'enviado', totalValue: 244 }, delivery: { ...returning, pin: '48213' }, showPin: true });
    render(<PedidoPage />);
    expect(screen.getByText('Entrega interrompida', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Reembolso de R\$ 244,00/ })).toBeInTheDocument();
    expect(screen.queryByText('Código de entrega')).not.toBeInTheDocument();
    expect(screen.queryByText('Saiu para entrega', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('confirmar envia a escolha', async () => {
    mockT = tracking({ order: { ...order, status: 'enviado' }, delivery: returning });
    render(<PedidoPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nova entrega' }));
    await waitFor(() => expect(mockT.decideReturn).toHaveBeenCalledWith('reentrega'));
  });

  it('nova entrega já escolhida: mostra a confirmação', () => {
    mockT = tracking({ order: { ...order, status: 'enviado' }, delivery: { ...returning, pendingReturnAction: 'reassign' } });
    render(<PedidoPage />);
    expect(screen.getByText('Nova entrega confirmada')).toBeInTheDocument();
  });

  it('o cancelamento manda: pedido cancelado não mostra a escolha', () => {
    mockT = tracking({ order: { ...order, status: 'cancelado' }, delivery: returning });
    render(<PedidoPage />);
    expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument();
  });
});
