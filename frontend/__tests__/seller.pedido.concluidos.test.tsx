// Bug de produção: em Pedidos → Concluídos, o pedido abria e logo ficava em branco.
// Pedidos concluídos (entregues, cancelados, devolvidos), inclusive antigos com campos
// ausentes, precisam abrir sem exceção; se algo quebrar, a tela mostra o erro do DS v2.
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { useOrder } from '../hooks/useSync';
import logger from '../lib/logger';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'o1' }, asPath: '/seller/pedido/o1', pathname: '/seller/pedido/[id]' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), isConnected: true, onReconnect: () => () => undefined }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSync', () => ({ useOrder: jest.fn() }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../lib/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));
// Só o teste do ErrorBoundary liga a bomba; nos outros a linha do tempo é a real.
let mockTimelineBomb = false;
jest.mock('../components/drop/OrderTimeline', () => {
  const real = jest.requireActual('../components/drop/OrderTimeline');
  return {
    ...real,
    OrderTimeline: (props: any) => {
      if (mockTimelineBomb) throw new Error('boom');
      return real.OrderTimeline(props);
    },
  };
});

// Exceção no render da própria página (fora dos blocos filhos).
let mockStageBomb = false;
jest.mock('../lib/sellerOrders', () => {
  const real = jest.requireActual('../lib/sellerOrders');
  return { ...real, orderStage: (o: any) => { if (mockStageBomb) throw new Error('boom'); return real.orderStage(o); } };
});

import SellerPedidoPage from '../pages/seller/pedido/[id]';
import SellerShell from '../components/seller/panel/SellerShell';

const get = api.get as jest.Mock;

/** Pedido antigo como o GET /orders/:id devolve (toApiOrder + getOrder), com o mínimo de campos. */
const old = {
  _id: 'o1', id: 'o1', storeId: 's1', customerId: 'c1', customerName: 'Cliente', totalValue: 50, deliveryFee: 7,
  deliveryDistance: null, paymentMethod: null, paymentStatus: 'paid', createdAt: '2025-03-02T15:00:00.000Z',
  paidAt: null, acceptedAt: null, readyAt: null, cancelledAt: null, walletDistribution: null, customerAddress: null,
  deliveryId: 'd1', storeRating: null, storeComment: null, directRefund: null, customerObj: null,
  products: [{ productId: 'p-gone', quantity: 2, price: 21.5, _id: 'i1', productName: 'Produto removido', image: null }],
};

const mockOrder = (extra: any) => (useOrder as jest.Mock).mockReturnValue({ order: { ...old, ...extra }, loading: false, setOrder: jest.fn() });

let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockTimelineBomb = false;
  mockStageBomb = false;
  mockPanel = { store: { _id: 's1' }, orders: [], refresh: jest.fn().mockResolvedValue(undefined), returnRequests: [] };
  get.mockImplementation(async (url: string) => {
    if (url === '/orders/o1/cancellations') return { data: { success: true, count: 0, history: [] } };
    return { data: { ...old } };
  });
  // Sem silenciar: os casos que devem abrir limpos conferem que nada foi para o console.error.
  errSpy = jest.spyOn(console, 'error');
});
afterEach(() => errSpy.mockRestore());
/** Só nos testes do ErrorBoundary o erro é esperado (o React também o registra). */
const expectRenderError = () => errSpy.mockImplementation(() => undefined);

/** Cancelamento como o Prisma serializa: Decimal vira string; campo opcional vazio vem null. */
const cancellation = (extra: any) => ({
  id: 'cx1', orderId: 'o1', deliveryId: null, cancelledBy: 'store', reason: 'Loja cheia', reasonCode: 'store_busy',
  details: null, refundAmount: null, refundStatus: 'pending', isLateCancellation: false, lateCancellationFee: null,
  createdAt: '2025-03-02T15:10:00.000Z', updatedAt: '2025-03-02T15:10:00.000Z', ...extra,
});
const withCancellations = (history: any[]) => get.mockImplementation(async (url: string) => {
  if (url === '/orders/o1/cancellations') return { data: { success: true, count: history.length, history } };
  return { data: { ...old } };
});

test('entregue antigo sem horários, sem motoboy e sem repasse abre inteiro', async () => {
  mockOrder({ status: 'entregue', delivery: { _id: 'd1', status: 'delivered', motoboyId: 'm1', statusDevolucao: 'pending', pickedAt: null, deliveredAt: null } });
  render(<SellerPedidoPage />);
  expect(screen.getAllByText('Entregue').length).toBeGreaterThan(0);
  expect(screen.getByText('2× Produto removido')).toBeInTheDocument();
  expect(screen.getByText('Retirado')).toBeInTheDocument();
  expect(screen.queryByText('Você recebe')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Andamento' })).toBeInTheDocument());
  expect(errSpy).not.toHaveBeenCalled();
});

test('entregue com a entrega apagada (delivery null) abre inteiro', async () => {
  mockOrder({ status: 'entregue', delivery: null, deliveryId: null, deliveryFee: 0 });
  render(<SellerPedidoPage />);
  expect(screen.getByRole('heading', { name: 'Itens' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Andamento' })).toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('cancelado pago com Pix e reembolso (Decimal em string): abre e mostra a linha com o valor', async () => {
  withCancellations([cancellation({ refundAmount: '50.00', refundStatus: 'processed' })]);
  mockOrder({ status: 'cancelado', paymentMethod: 'pix', cancelledAt: '2025-03-02T15:10:00.000Z', delivery: null });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('R$ 50,00')).toBeInTheDocument();
  expect(screen.getByText('Reembolso:')).toBeInTheDocument();
  expect(screen.getByText('Loja cheia')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Itens' })).toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('cancelado pago com cartão: linha de reembolso com o valor', async () => {
  withCancellations([cancellation({ refundAmount: '50.00', refundStatus: 'pending' })]);
  mockOrder({ status: 'cancelado', paymentMethod: 'credit_card', delivery: null });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('R$ 50,00')).toBeInTheDocument();
  expect(screen.getByText('Reembolso:')).toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('cancelado sem reembolso (refundAmount null) abre sem a linha de reembolso', async () => {
  withCancellations([cancellation({ refundAmount: null })]);
  mockOrder({ status: 'cancelado', paymentMethod: 'pix', delivery: null });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('Loja cheia')).toBeInTheDocument();
  expect(screen.queryByText(/Reembolso/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Itens' })).toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('cancelado sem pagamento: o backend grava refundAmount = total, mas não há linha de reembolso', async () => {
  withCancellations([cancellation({ refundAmount: '50.00', refundStatus: 'processed' })]);
  mockOrder({ status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'pending', delivery: null });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('Loja cheia')).toBeInTheDocument();
  expect(screen.queryByText(/Reembolso/)).not.toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('dinheiro na entrega: nada foi cobrado pelo app, sem linha de reembolso', async () => {
  withCancellations([cancellation({ refundAmount: '50.00', refundStatus: 'processed' })]);
  mockOrder({ status: 'cancelado', paymentMethod: 'cash_on_delivery', delivery: null });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('Loja cheia')).toBeInTheDocument();
  expect(screen.queryByText(/Reembolso/)).not.toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('devolvido (cancelado após retirada, devolução confirmada, estorno direto): só o card Estorno, sem linha duplicada', async () => {
  withCancellations([cancellation({ cancelledBy: 'motoboy', reasonCode: 'delivery_failed', reason: 'Cliente ausente', refundAmount: '43.00', refundStatus: 'processed' })]);
  mockOrder({
    status: 'cancelado', paymentMethod: 'pix', paymentProvider: 'asaas_loja', acceptedAt: '2025-03-02T15:02:00.000Z',
    directRefund: { status: 'done', amount: 43, lastError: null, attempts: 1 },
    delivery: { _id: 'd1', status: 'cancelled', motoboyId: 'm1', pickedAt: '2025-03-02T15:20:00.000Z', statusDevolucao: 'confirmado' },
  });
  render(<SellerPedidoPage />);
  expect(await screen.findByText('Cliente ausente')).toBeInTheDocument();
  expect(screen.getByText('Estorno')).toBeInTheDocument();
  expect(screen.queryByText(/Reembolso/)).not.toBeInTheDocument();
  expect(screen.getByText('Estornado — R$ 43,00')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Andamento' })).toBeInTheDocument();
  expect(errSpy).not.toHaveBeenCalled();
});

test('exceção num bloco vira a tela de erro; "Tentar de novo" relê o pedido e monta a tela de novo', async () => {
  expectRenderError();
  mockTimelineBomb = true;
  mockOrder({ status: 'entregue', delivery: null });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Não deu para abrir esta tela')).toBeInTheDocument();
  // O Error inteiro (com a pilha) vai para o log.
  expect(logger.error).toHaveBeenCalledWith(
    'Tela da loja quebrou no render',
    expect.objectContaining({ message: 'boom', stack: expect.any(String) }),
    expect.anything(),
  );
  // O topo (título e voltar) continua, a tela não fica branca.
  expect(screen.getByRole('heading', { name: 'Pedido #O1' })).toBeInTheDocument();
  mockTimelineBomb = false;
  get.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('heading', { name: 'Andamento' })).toBeInTheDocument();
  expect(screen.queryByText('Não deu para abrir esta tela')).not.toBeInTheDocument();
  await waitFor(() => expect(get).toHaveBeenCalledWith('/orders/o1'));
});

test('SellerShell: "Tentar de novo" chama o onRetry da tela e monta o conteúdo do zero', async () => {
  expectRenderError();
  let mounts = 0;
  let bomb = true;
  const Content = () => {
    useEffect(() => { mounts += 1; }, []);
    if (bomb) throw new Error('boom');
    return <p>conteúdo</p>;
  };
  const onRetry = jest.fn();
  render(<SellerShell title="Tela" back="/seller/pedidos" onRetry={onRetry}><Content /></SellerShell>);
  expect(screen.getByText('Não deu para abrir esta tela')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tela' })).toBeInTheDocument();
  bomb = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('conteúdo')).toBeInTheDocument();
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(mounts).toBe(1);
});

test('exceção no render da própria página também vira a tela de erro, com o topo e o voltar', async () => {
  expectRenderError();
  mockStageBomb = true;
  mockOrder({ status: 'entregue', delivery: null });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Não deu para abrir esta tela')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Pedido #O1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  mockStageBomb = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('heading', { name: 'Andamento' })).toBeInTheDocument();
});
