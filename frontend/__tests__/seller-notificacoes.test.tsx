import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import SellerNotificacoes, { notificationCategory } from '../pages/seller/notificacoes';
import api from '../lib/api';

const mockPush = jest.fn();
const mockRefresh = jest.fn(() => Promise.resolve());
let mockPanel: any;
let mockNotifs: any[];
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/seller/notificacoes' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => ({
  SellerShell: ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>,
}));
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: mockNotifs, loading: false }) }));
jest.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: true, subscribed: false, permission: 'default', busy: false, enable: jest.fn(), disable: jest.fn(), sendTest: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), patch: jest.fn(() => Promise.resolve({})), delete: jest.fn() } }));

const now = new Date().toISOString();
const n = (over: any) => ({ _id: 'n1', title: 'Aviso', message: 'msg', type: 'system', read: false, createdAt: now, ...over });
const awaitingOrder = (over: any = {}) => [{ _id: 'o1', status: 'criado', acceptDeadline: new Date(Date.now() + 600000).toISOString(), ...over }];
const newOrderNotif = () => [n({ _id: 'n4', type: 'order', title: 'Pedido novo', link: '/seller/pedido/o1', entityId: 'o1' })];
const renderPage = () => render(<SellerNotificacoes />);
const arm = () => {
  fireEvent.click(screen.getByRole('button', { name: /^Aceitar pedido$/ }));
  fireEvent.click(screen.getByRole('button', { name: /Toque de novo para aceitar/ }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { store: { _id: 's1' }, orders: [], refresh: mockRefresh, newOrderCount: 0 };
  mockNotifs = [];
});
afterEach(() => { jest.useRealTimers(); });

test('tocar no aviso marca como lido e abre o link', () => {
  mockNotifs = [n({ _id: 'n1', title: 'Pix ao motoboy parado', link: '/seller/dinheiro' })];
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /Pix ao motoboy parado/ }));
  expect(api.patch).toHaveBeenCalledWith('/notifications/n1/read');
  expect(mockPush).toHaveBeenCalledWith('/seller/dinheiro');
});

test('link externo, de outra área ou ausente não navega', () => {
  mockNotifs = [
    n({ _id: 'n2', title: 'Estranho', link: '//evil.com' }),
    n({ _id: 'n6', title: 'Outra area', link: '/admin/users' }),
    n({ _id: 'n7', title: 'Absoluto', link: 'https://evil.com/seller/x' }),
    n({ _id: 'n3', title: 'Sem link' }),
  ];
  renderPage();
  for (const t of [/Estranho/, /Outra area/, /Absoluto/, /Sem link/]) fireEvent.click(screen.getByRole('button', { name: t }));
  expect(mockPush).not.toHaveBeenCalled();
});

test('pedido aguardando aceite: dois toques aceitam por /orders/:id/accept', async () => {
  mockPanel = { ...mockPanel, orders: awaitingOrder({ deliveryDistance: 2.4 }) };
  mockNotifs = newOrderNotif();
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /^Aceitar pedido$/ }));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Toque de novo para aceitar/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/o1/accept', { distance: 2.4 }));
  expect(await screen.findByText('Aceito')).toBeInTheDocument();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockRefresh).toHaveBeenCalled();
});

test('o primeiro toque expira em 3 s', () => {
  jest.useFakeTimers();
  mockPanel = { ...mockPanel, orders: awaitingOrder() };
  mockNotifs = newOrderNotif();
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: /^Aceitar pedido$/ }));
  expect(screen.getByText('Toque de novo para aceitar')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(3100); });
  expect(screen.getByRole('button', { name: /^Aceitar pedido$/ })).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('erro 400 porque o pedido já foi aceito: recarrega o pedido e mostra "Já aceito"', async () => {
  mockPanel = { ...mockPanel, orders: awaitingOrder() };
  mockNotifs = newOrderNotif();
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { success: false, error: { message: 'Pedido não está aguardando aceite', statusCode: 400 } } } });
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: { _id: 'o1', status: 'pago' } } });
  renderPage();
  arm();
  expect(await screen.findByText('Já aceito')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/orders/o1');
  expect(mockRefresh).toHaveBeenCalled();
});

test('erro 400 com o pedido ainda aguardando aceite: mostra a mensagem do servidor', async () => {
  mockPanel = { ...mockPanel, orders: awaitingOrder() };
  mockNotifs = newOrderNotif();
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { success: false, error: { message: 'Pagamento ainda não confirmado', statusCode: 400 } } } });
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: { _id: 'o1', status: 'criado' } } });
  renderPage();
  arm();
  expect(await screen.findByText('Pagamento ainda não confirmado')).toBeInTheDocument();
  expect(screen.queryByText('Já aceito')).not.toBeInTheDocument();
});

test('STORE_TRANSFER_PENDING mostra a mensagem do servidor sem recarregar o pedido', async () => {
  mockPanel = { ...mockPanel, orders: awaitingOrder() };
  mockNotifs = newOrderNotif();
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'Há repasse Pix a motoboy pendente há muito tempo.', code: 'STORE_TRANSFER_PENDING' } } });
  renderPage();
  arm();
  expect(await screen.findByText('Há repasse Pix a motoboy pendente há muito tempo.')).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByText('Já aceito')).not.toBeInTheDocument();
});

test('pedido que não espera aceite: sem botão de aceitar', () => {
  mockPanel = { ...mockPanel, orders: [{ _id: 'o9', status: 'pago' }] };
  mockNotifs = [n({ _id: 'n5', type: 'order', title: 'Pedido cancelado', link: '/seller/pedido/o9', entityId: 'o9' })];
  renderPage();
  expect(screen.queryByRole('button', { name: /Aceitar pedido/ })).not.toBeInTheDocument();
});

test('cartão ainda não aprovado: sem botão de aceitar', () => {
  mockPanel = { ...mockPanel, orders: awaitingOrder({ paymentMethod: 'credit_card', asaasPaymentId: 'pay_1', paymentStatus: 'pending' }) };
  mockNotifs = newOrderNotif();
  renderPage();
  expect(screen.queryByRole('button', { name: /Aceitar pedido/ })).not.toBeInTheDocument();
});

test('filtro Dinheiro mostra só os avisos de dinheiro', () => {
  mockNotifs = [
    n({ _id: 'a', title: 'Pedido novo', type: 'order', link: '/seller/pedido/o1' }),
    n({ _id: 'b', title: 'Pix ao motoboy parado', link: '/seller/dinheiro' }),
    n({ _id: 'c', title: 'Feriado', type: 'broadcast' }),
  ];
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Dinheiro' }));
  const lista = screen.getByRole('region', { name: 'Avisos' });
  expect(within(lista).getByText('Pix ao motoboy parado')).toBeInTheDocument();
  expect(within(lista).queryByText('Pedido novo')).not.toBeInTheDocument();
  expect(within(lista).queryByText('Feriado')).not.toBeInTheDocument();
});

test('lista vazia: "Tudo em dia"', () => {
  renderPage();
  expect(screen.getByText('Tudo em dia')).toBeInTheDocument();
});

test('notificationCategory', () => {
  expect(notificationCategory({ type: 'broadcast' })).toBe('drop');
  expect(notificationCategory({ type: 'system', link: '/seller/dinheiro' })).toBe('dinheiro');
  expect(notificationCategory({ type: 'order' })).toBe('pedidos');
  expect(notificationCategory({ type: 'system', link: '/seller/pedido/o1' })).toBe('pedidos');
  expect(notificationCategory({ type: 'system', link: '/seller/abrir' })).toBe('outros');
});
