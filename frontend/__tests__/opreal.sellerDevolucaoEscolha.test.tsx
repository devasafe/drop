// Loja vê a escolha do cliente na devolução (DS v2, frame "Devolução · escolha do cliente"):
// o backend avisa o painel com order:updated quando o cliente escolhe nova entrega.
import React from 'react';
import { render, screen, act } from '@testing-library/react';

const mockHandlers: Record<string, (data?: any) => any> = {};
jest.mock('../hooks/useAutoRefetch', () => ({
  useSocketListener: (event: string, handler: (data?: any) => any) => { mockHandlers[event] = handler; },
  useAutoRefetch: jest.fn(),
  useSocketToast: jest.fn(),
}));
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: true, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
const mockGet = jest.fn();
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: (...a: any[]) => mockGet(...a), post: jest.fn(), put: jest.fn() } }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'o1' }, asPath: '/seller/pedido/o1', pathname: '/seller/pedido/[id]' }) }));
jest.mock('../contexts/SocketContext', () => {
  const socket = { on: () => () => undefined, emit: () => undefined, isConnected: true };
  return { useSocket: () => socket };
});
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});

import AuthContext from '../contexts/AuthContext';
import { SellerPanelProvider } from '../components/seller/panel/SellerPanelProvider';
import SellerPedidoPage from '../pages/seller/pedido/[id]';

const lojista = { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista' };
let action: string | null = null;
const theOrder = () => ({
  _id: 'o1', storeId: 's1', status: 'enviado', customerName: 'Ana Souza', totalValue: 50, deliveryFee: 7,
  products: [{ productId: 'p1', productName: 'Ração', quantity: 1, price: 43 }],
  createdAt: '2026-10-12T12:00:00Z', acceptedAt: '2026-10-12T12:02:00Z', deliveryId: 'd1',
  delivery: { _id: 'd1', status: 'picked', motoboyId: 'm1', motoboyName: 'Carlos', statusDevolucao: 'aguardando_confirmacao', pendingReturnAction: action },
});

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  action = null;
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' }, orders: [theOrder()], history: [], categories: [] } });
    if (url === '/orders/o1') return Promise.resolve({ data: theOrder() });
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(
  <AuthContext.Provider value={{ user: lojista, can: () => true } as any}>
    <SellerPanelProvider><SellerPedidoPage /></SellerPanelProvider>
  </AuthContext.Provider>,
);

test('cliente ainda não escolheu: a loja sabe o que acontece se confirmar', async () => {
  renderPage();
  expect(await screen.findByText('Aguardando Ana escolher')).toBeInTheDocument();
  expect(screen.getByText(/Se não houver escolha, o pedido é cancelado quando você confirmar o pacote\./)).toBeInTheDocument();
});

test('cliente escolheu nova entrega: chega ao vivo pelo order:updated', async () => {
  renderPage();
  await screen.findByText('Aguardando Ana escolher');

  action = 'reassign';
  await act(async () => { mockHandlers['order:updated']({ orderId: 'o1', pendingReturnAction: 'reassign' }); });

  expect(await screen.findByText('Ana escolheu: nova entrega')).toBeInTheDocument();
  expect(screen.getByText(/Depois disso, um motoboy novo busca o pedido aqui\. Não precisa separar de novo\./)).toBeInTheDocument();
  expect(screen.queryByText('Aguardando Ana escolher')).not.toBeInTheDocument();
});

test('cliente pediu reembolso: a loja sabe que, ao confirmar o pacote, o valor volta para o cliente', async () => {
  action = 'cancel';
  renderPage();
  expect(await screen.findByText('Ana pediu o dinheiro de volta')).toBeInTheDocument();
  expect(screen.getByText(/Ao confirmar o pacote com o código, o pedido é cancelado e o valor volta para o cliente\./)).toBeInTheDocument();
  expect(screen.getByLabelText('PIN de devolução (6 dígitos)')).toBeInTheDocument();
});
