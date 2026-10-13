import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { useOrder } from '../hooks/useSync';
import { cssViolations } from './helpers/dsTokens';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'o1' }, asPath: '/seller/pedido/o1', pathname: '/seller/pedido/[id]' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), isConnected: true }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSync', () => ({ useOrder: jest.fn() }));
jest.mock('../components/order/CancellationStatusDisplay', () => ({ CancellationStatusDisplay: () => <p>Status do cancelamento</p> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

import SellerPedidoPage from '../pages/seller/pedido/[id]';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const setOrder = jest.fn();
const base = {
  _id: 'o1', storeId: 's1', customerId: 'c1', customerName: 'Ana Souza', totalValue: 116.7, deliveryFee: 7, deliveryDistance: 2.4,
  paymentMethod: 'pix', createdAt: '2026-10-12T12:26:00Z', paidAt: '2026-10-12T12:26:00Z',
  products: [{ productId: 'p1', productName: 'Ração Golden 3 kg', quantity: 1, price: 89.9 }, { productId: 'p2', productName: 'Petisco', quantity: 2, price: 9.9 }],
  walletDistribution: { storeAmount: 93.24 },
};
const mockOrder = (extra: any) => (useOrder as jest.Mock).mockReturnValue({ order: { ...base, ...extra }, loading: false, setOrder });

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { store: { _id: 's1' }, orders: [], refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 0 };
  get.mockResolvedValue({ data: { ...base } });
});

test('pedido novo: prazo do painel, recusar e aceitar com toque duplo', async () => {
  mockOrder({ status: 'criado' });
  mockPanel.orders = [{ ...base, status: 'criado', acceptDeadline: new Date(Date.now() + 300000).toISOString() }];
  post.mockResolvedValue({ data: { requiresDelivery: true } });
  render(<SellerPedidoPage />);
  expect(screen.getByRole('heading', { name: 'Pedido #O1' })).toBeInTheDocument();
  expect(screen.getByRole('timer')).toHaveTextContent(/cancela em [45]:\d\d/);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  fireEvent.click(screen.getByRole('button', { name: /toque de novo para aceitar/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/accept', { distance: 2.4 }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  expect(get).toHaveBeenCalledWith('/orders/o1');
});

test('motoboy na porta: PIN enviado ao completar 5 dígitos, com a entrega mais nova do painel', async () => {
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' } });
  mockPanel.orders = [{ ...base, status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'assigned', motoboyId: 'm1', motoboyName: 'Carlos Lima' } }];
  post.mockResolvedValue({ data: {} });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Carlos Lima')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/PIN de 5 dígitos/), { target: { value: '48213' } });
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/validar-pin-retirada', { pinRetirada: '48213' }));
  expect(post).toHaveBeenCalledTimes(1);
});

test('"Pronto para retirada" chama POST /orders/:id/ready e recarrega', async () => {
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' } });
  post.mockResolvedValue({ data: { success: true, data: { readyAt: '2026-10-12T12:40:00Z' } } });
  render(<SellerPedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Pronto para retirada' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/ready'));
  await waitFor(() => expect(get).toHaveBeenCalledWith('/orders/o1'));
  expect(setOrder).toHaveBeenCalled();
});

test('já pronto: diz desde quando está pronto e não mostra o botão', () => {
  const readyAt = new Date(2026, 9, 12, 9, 40).toISOString();
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' }, readyAt });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Pronto para retirada desde 09:40')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pronto para retirada' })).not.toBeInTheDocument();
});

test('separar itens marca um de cada vez', () => {
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' } });
  render(<SellerPedidoPage />);
  expect(screen.getByText('0 de 2')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('1× Ração Golden 3 kg'));
  expect(screen.getByText('1 de 2')).toBeInTheDocument();
});

test('linha do tempo mostra a hora real do aceite e o resumo mostra o que a loja recebe', () => {
  const acceptedAt = new Date(2026, 9, 12, 9, 28).toISOString();
  mockOrder({ status: 'aguardando_motoboy', acceptedAt, deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' } });
  render(<SellerPedidoPage />);
  const step = screen.getByText('Aceito por você').closest('li')!;
  expect(within(step).getByText('09:28')).toBeInTheDocument();
  expect(screen.getByText('R$ 93,24')).toBeInTheDocument();
});

test('cancelado: mostra o status do cancelamento e nenhuma ação', () => {
  mockOrder({ status: 'cancelado' });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Status do cancelamento')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /aceitar pedido/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pronto para retirada' })).not.toBeInTheDocument();
});

test('Mensagem abre a conversa com o cliente', async () => {
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'pending' } });
  post.mockResolvedValue({ data: { _id: 'cv1' } });
  get.mockResolvedValue({ data: { messages: [] } });
  render(<SellerPedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Mensagem' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'loja_cliente', otherParticipantId: 'c1', orderId: 'o1' }));
});

test('devolução pendente pede o PIN de devolução', () => {
  mockOrder({ status: 'aguardando_motoboy', acceptedAt: '2026-10-12T12:28:00Z', deliveryId: 'd1', delivery: { _id: 'd1', status: 'picked', statusDevolucao: 'aguardando_confirmacao' } });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Devolução pedida')).toBeInTheDocument();
  expect(screen.getByLabelText('PIN de devolução (6 dígitos)')).toBeInTheDocument();
});

test('pedido inexistente', () => {
  (useOrder as jest.Mock).mockReturnValue({ order: null, loading: false, setOrder });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Pedido não encontrado')).toBeInTheDocument();
});

test('a rota antiga seller/order-[id] é a mesma tela', () => {
  const oldPage = require('../pages/seller/order-[id]').default;
  expect(oldPage).toBe(SellerPedidoPage);
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'pedido', 'PedidoLoja.module.css'), 'utf8'))).toEqual([]);
});

test('cartão ainda não aprovado: não oferece aceitar nem recusar', () => {
  mockOrder({ status: 'criado', paymentMethod: 'credit_card', asaasPaymentId: 'pay_1', paymentStatus: 'pending' });
  render(<SellerPedidoPage />);
  expect(screen.getByText('Aguardando a aprovação do cartão')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /aceitar pedido/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Recusar' })).not.toBeInTheDocument();
});

test('C12: aceite marca o pedido no painel antes de recarregar', async () => {
  mockOrder({ status: 'criado' });
  mockPanel.patchOrder = jest.fn();
  post.mockResolvedValue({ data: {} });
  render(<SellerPedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  fireEvent.click(screen.getByRole('button', { name: /toque de novo para aceitar/i }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  expect(mockPanel.patchOrder).toHaveBeenCalledWith('o1', { status: 'pago' });
  expect(mockPanel.patchOrder.mock.invocationCallOrder[0]).toBeLessThan(mockPanel.refresh.mock.invocationCallOrder[0]);
});

test('C12: recusa tira o pedido do painel antes de recarregar', async () => {
  mockOrder({ status: 'criado' });
  mockPanel.removeOrder = jest.fn();
  post.mockResolvedValue({ data: { success: true, data: { refundStatus: 'processed', refundAmount: 116.7 } } });
  render(<SellerPedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Loja cheia agora' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/reject', { reason: 'Muitos pedidos para processar', reasonCode: 'store_busy' }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  expect(mockPanel.removeOrder).toHaveBeenCalledWith('o1');
  expect(mockPanel.removeOrder.mock.invocationCallOrder[0]).toBeLessThan(mockPanel.refresh.mock.invocationCallOrder[0]);
});

test('erro no aceite: recarrega e mostra "Já aceito" se o pedido não espera mais', async () => {
  mockOrder({ status: 'criado' });
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Pedido não está aguardando aceite' } } });
  get.mockResolvedValue({ data: { ...base, status: 'pago', acceptedAt: '2026-10-12T12:28:00Z' } });
  render(<SellerPedidoPage />);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  fireEvent.click(screen.getByRole('button', { name: /toque de novo para aceitar/i }));
  expect(await screen.findByText('Já aceito')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/orders/o1');
});
