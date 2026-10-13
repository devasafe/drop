// Tela Pedido montada no SellerPanelProvider real: a devolução pedida pelo motoboy
// (socket delivery:return_requested, único evento que o backend emite) aparece sem recarregar a página.
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

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
// Socket estável: o useOrder real refaz a busca quando `on` muda de identidade.
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
let returned = false;
const theOrder = () => ({
  _id: 'o1', storeId: 's1', status: 'aguardando_motoboy', customerName: 'Ana', totalValue: 50, deliveryFee: 7,
  products: [{ productId: 'p1', productName: 'Ração', quantity: 1, price: 43 }],
  createdAt: '2026-10-12T12:00:00Z', acceptedAt: '2026-10-12T12:02:00Z', deliveryId: 'd1',
  delivery: { _id: 'd1', status: 'picked', motoboyId: 'm1', motoboyName: 'Carlos', ...(returned ? { statusDevolucao: 'aguardando_confirmacao' } : {}) },
});

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  returned = false;
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' }, orders: [theOrder()], history: [], categories: [] } });
    if (url === '/orders/o1') return Promise.resolve({ data: theOrder() });
    return Promise.resolve({ data: {} });
  });
});

test('delivery:return_requested para este pedido mostra "Devolução pedida" sem recarregar a página', async () => {
  render(
    <AuthContext.Provider value={{ user: lojista, can: () => true } as any}>
      <SellerPanelProvider><SellerPedidoPage /></SellerPanelProvider>
    </AuthContext.Provider>,
  );
  await screen.findByText('Retirado por Carlos');
  expect(screen.queryByText('Devolução pedida')).not.toBeInTheDocument();

  returned = true;
  await act(async () => {
    mockHandlers['delivery:return_requested']({ deliveryId: 'd1', orderId: 'o1', motoboyId: 'm1', message: 'x', pinRequired: true, returnedAt: '2026-10-12T12:30:00Z' });
  });
  expect(await screen.findByText('Devolução pedida')).toBeInTheDocument();
  expect(screen.getByLabelText('PIN de devolução (6 dígitos)')).toBeInTheDocument();

  // Uma recarga por devolução nova: sem loop.
  const calls = mockGet.mock.calls.filter((c) => c[0] === '/orders/o1').length;
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(mockGet.mock.calls.filter((c) => c[0] === '/orders/o1').length).toBe(calls);
});

test('devolução de outro pedido não recarrega este', async () => {
  render(
    <AuthContext.Provider value={{ user: lojista, can: () => true } as any}>
      <SellerPanelProvider><SellerPedidoPage /></SellerPanelProvider>
    </AuthContext.Provider>,
  );
  await screen.findByText('Retirado por Carlos');
  const before = mockGet.mock.calls.filter((c) => c[0] === '/orders/o1').length;
  await act(async () => {
    mockHandlers['delivery:return_requested']({ deliveryId: 'd9', orderId: 'o9', motoboyId: 'm1', message: 'x', pinRequired: true, returnedAt: '2026-10-12T12:30:00Z' });
  });
  expect(mockGet.mock.calls.filter((c) => c[0] === '/orders/o1').length).toBe(before);
});
