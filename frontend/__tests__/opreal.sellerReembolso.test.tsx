// Loja responde o reembolso de pedido entregue e confere o código (DS v2, caso B).
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
const mockPost = jest.fn();
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a), put: jest.fn() } }));
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
let rr: any;
const theOrder = () => ({
  _id: 'o1', storeId: 's1', status: 'entregue', customerName: 'Ana Souza', totalValue: 244, deliveryFee: 14.1, paymentProvider: 'asaas_loja',
  products: [{ productId: 'p1', productName: 'Fone JBL 520BT', quantity: 1, price: 229.9 }],
  createdAt: '2026-10-12T12:00:00Z', acceptedAt: '2026-10-12T12:02:00Z', deliveryId: 'd1',
  delivery: { _id: 'd1', status: 'delivered', motoboyId: 'm1', motoboyName: 'Carlos' },
  returnRequest: { status: rr.status, reason: rr.reason, amount: rr.amount },
});

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  rr = { _id: 'rr1', orderId: 'o1', status: 'aguardando_loja', reason: 'defeito', note: 'O lado esquerdo não liga.', photoUrl: 'https://img/f.png', amount: 244, includesDeliveryFee: true };
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' }, orders: [theOrder()], history: [], categories: [] } });
    if (url === '/orders/o1') return Promise.resolve({ data: theOrder() });
    if (url === '/orders/o1/return-request') return Promise.resolve({ data: rr });
    return Promise.resolve({ data: {} });
  });
});

const renderPage = () => render(
  <AuthContext.Provider value={{ user: lojista, can: () => true } as any}>
    <SellerPanelProvider><SellerPedidoPage /></SellerPanelProvider>
  </AuthContext.Provider>,
);

test('pedido de reembolso: motivo, comentário, foto e quanto volta', async () => {
  renderPage();
  expect(await screen.findByText('Ana · veio com defeito')).toBeInTheDocument();
  expect(screen.getByText(/O lado esquerdo não liga\./)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Foto do problema' })).toHaveAttribute('src', 'https://img/f.png');
  expect(within(screen.getByRole('region', { name: 'Pedido de reembolso' })).getByText('R$ 244,00')).toBeInTheDocument();
  expect(screen.getByText(/Defeito: volta tudo\. Sai da sua conta Asaas só quando você receber o produto e digitar o código\./)).toBeInTheDocument();
});

test('aprovar chama a rota e recarrega', async () => {
  mockPost.mockResolvedValue({ data: { ...rr, status: 'aprovado' } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar reembolso' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/return-requests/rr1/approve', {}));
});

test('recusar pede um motivo da lista', async () => {
  mockPost.mockResolvedValue({ data: { ...rr, status: 'recusado', rejectReasonText: 'Produto com marca de uso' } });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
  const confirmar = screen.getByRole('button', { name: 'Confirmar recusa' });
  expect(confirmar).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Produto com marca de uso' }));
  fireEvent.click(confirmar);
  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/return-requests/rr1/reject', { reasonCode: 'usado' }));
});

test('produto voltando: a loja digita o código; código errado avisa', async () => {
  rr = { ...rr, status: 'devolvendo', mode: 'loja' };
  mockPost.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Código de devolução não confere', code: 'INVALID_PIN' } } });
  renderPage();
  const input = await screen.findByLabelText('Código de devolução (5 dígitos)');
  fireEvent.change(input, { target: { value: '12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  expect(await screen.findByText('Código não confere. Peça o código de novo.')).toBeInTheDocument();
  mockPost.mockResolvedValueOnce({ data: { ...rr, status: 'concluido', refundStatus: 'processed' } });
  fireEvent.change(input, { target: { value: '48213' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  await waitFor(() => expect(mockPost).toHaveBeenLastCalledWith('/return-requests/rr1/confirm', { pin: '48213' }));
});
