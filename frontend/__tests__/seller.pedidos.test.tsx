import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { SELLER_ROUTES } from '../lib/sellerRoutes';
import { cssViolations } from './helpers/dsTokens';

let mockQuery: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn(), query: mockQuery, asPath: '/seller/pedidos', pathname: '/seller/pedidos', isReady: true }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

import SellerPedidosPage from '../pages/seller/pedidos';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const o = (id: string, over: any = {}) => ({ _id: id, status: 'aguardando_motoboy', deliveryId: 'd' + id, deliveryFee: 7, totalValue: 109.7, customerName: 'Ana Souza', createdAt: '2026-10-12T12:26:00Z', acceptedAt: '2026-10-12T12:28:00Z', products: [{ productName: 'Ração', quantity: 2 }], delivery: { _id: 'd' + id, status: 'pending' }, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = {};
  mockPanel = { store: { _id: 's1' }, orders: [o('ord000004819'), o('ord000004823', { status: 'criado', customerName: 'Bruno Reis', delivery: null })], returnRequests: [], dismissReturn: jest.fn(), refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 1 };
});

afterEach(() => { jest.useRealTimers(); });

test('abre em Novos quando há pedido aguardando aceite, com os 4 segmentos e contadores', () => {
  mockPanel.orders[1].acceptDeadline = new Date(Date.now() + 4 * 60000).toISOString();
  render(<SellerPedidosPage />);
  const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
  expect(tabs).toEqual(['Novos1', 'Em andamento1', 'Concluídos', 'Devoluções0']);
  expect(screen.getByRole('tab', { name: /^Novos/ })).toHaveAttribute('aria-selected', 'true');
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByRole('link', { name: /#004823/ })).toHaveAttribute('href', SELLER_ROUTES.pedido('ord000004823'));
  expect(within(rows[0]).getByText('Novo')).toBeInTheDocument();
  expect(within(rows[0]).getByRole('timer')).toHaveTextContent(/^cancela em [34]:\d\d$/);
  expect(within(rows[0]).getByText('R$ 109,70')).toBeInTheDocument();
});

test('sem pedido novo, abre em Em andamento', () => {
  mockPanel.orders = [o('ord000004819')];
  render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Em andamento/ })).toHaveAttribute('aria-selected', 'true');
  const rows = screen.getAllByRole('listitem');
  expect(within(rows[0]).getByText('Separando')).toBeInTheDocument();
  expect(within(rows[0]).getByRole('link', { name: /#004819/ })).toHaveAttribute('href', SELLER_ROUTES.pedido('ord000004819'));
});

test('Em andamento não repete os novos', () => {
  mockQuery = { seg: 'andamento' };
  render(<SellerPedidosPage />);
  expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  expect(screen.queryByText('Bruno Reis')).not.toBeInTheDocument();
});

test('trocar de segmento atualiza a URL sem recarregar', () => {
  render(<SellerPedidosPage />);
  fireEvent.click(screen.getByRole('tab', { name: /^Concluídos/ }));
  expect(mockReplace).toHaveBeenCalledWith(SELLER_ROUTES.pedidos('concluidos'), undefined, { shallow: true });
});

test('link antigo ?seg=historico abre Concluídos', async () => {
  mockQuery = { seg: 'historico' };
  get.mockResolvedValue({ data: { history: [] } });
  render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Concluídos/ })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByText('Nenhum pedido concluído')).toBeInTheDocument();
});

test('Concluídos separa por período', async () => {
  mockQuery = { seg: 'concluidos' };
  // relógio fixo (15:00 em São Paulo): "Ontem" não pode depender do horário em que o teste roda
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'], now: new Date('2026-10-14T18:00:00Z') });
  const now = Date.now();
  get.mockResolvedValue({ data: { history: [
    o('ord000004812', { status: 'entregue', createdAt: new Date(now - 60000).toISOString(), delivery: { deliveredAt: new Date(now - 60000).toISOString() } }),
    o('ord000004800', { status: 'cancelado', customerName: 'Pedro Alves', createdAt: new Date(now - 30 * 3600000).toISOString(), cancelledAt: new Date(now - 30 * 3600000).toISOString() }),
  ] } });
  render(<SellerPedidosPage />);
  expect(await screen.findByText('Hoje')).toBeInTheDocument();
  expect(screen.getByText('Ontem')).toBeInTheDocument();
});

test('Concluídos busca o dashboard e mostra entregues e cancelados', async () => {
  mockQuery = { seg: 'concluidos' };
  get.mockResolvedValue({ data: { history: [o('ord000004812', { status: 'entregue', customerName: 'Júlia Martins' }), o('ord000004809', { status: 'cancelado', customerName: 'Pedro Alves' })] } });
  render(<SellerPedidosPage />);
  expect(await screen.findByText('Júlia Martins')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/stores/dashboard');
  expect(screen.getByText('Entregue')).toBeInTheDocument();
  expect(screen.getByText('Cancelado')).toBeInTheDocument();
});

test('Concluídos com erro oferece tentar de novo', async () => {
  mockQuery = { seg: 'concluidos' };
  get.mockRejectedValueOnce(new Error('x'));
  render(<SellerPedidosPage />);
  expect(await screen.findByText('Não carregamos os concluídos')).toBeInTheDocument();
  get.mockResolvedValue({ data: { history: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Nenhum pedido concluído')).toBeInTheDocument();
});

test('Devoluções: contador e confirmação com o PIN de devolução', async () => {
  mockQuery = { seg: 'devolucoes' };
  mockPanel.orders = [o('ord000004806', { customerName: 'Marina Costa', delivery: { _id: 'd9', status: 'picked', statusDevolucao: 'aguardando_confirmacao' } })];
  post.mockResolvedValue({ data: { success: true } });
  render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Devoluções/ })).toHaveTextContent('1');
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d9/confirm-return', { pinDevolucao: '123456' }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
});

test('Devoluções vazio', () => {
  mockQuery = { seg: 'devolucoes' };
  render(<SellerPedidosPage />);
  expect(screen.getByText('Nenhuma devolução — ótimo sinal')).toBeInTheDocument();
});

test('contador de Devoluções aparece em outro segmento, para a loja não perder a devolução', () => {
  mockPanel.orders = [...mockPanel.orders, o('ord000004806', { delivery: { _id: 'd9', status: 'picked', statusDevolucao: 'aguardando_confirmacao' } })];
  render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Devoluções/ })).toHaveTextContent('1');
});

test('devolução que chegou pelo socket (returnRequests) também entra no contador', () => {
  mockPanel.returnRequests = [{ deliveryId: 'd1', orderId: 'ord000004819', motoboyId: 'm', message: '', pinRequired: true, returnedAt: '' }];
  render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Devoluções/ })).toHaveTextContent('1');
});

test('busca é um ícone no topo que abre o campo; filtra por cliente ou número', () => {
  mockQuery = { seg: 'andamento' };
  mockPanel.orders = [o('ord000004819'), o('ord000004817', { customerName: 'Bruno Reis' })];
  render(<SellerPedidosPage />);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar pedidos' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pedidos' }), { target: { value: 'bruno' } });
  expect(screen.getByText('Bruno Reis')).toBeInTheDocument();
  expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pedidos' }), { target: { value: 'zzz' } });
  expect(screen.getByText('Nada com "zzz".')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'PedidosLoja.module.css'), 'utf8'))).toEqual([]);
});

test('confirmar devolução vinda de returnRequests dispensa o aviso mesmo com o pedido ainda em orders', async () => {
  mockQuery = { seg: 'devolucoes' };
  mockPanel.returnRequests = [{ deliveryId: 'dord000004819', orderId: 'ord000004819', motoboyId: 'm', message: '', pinRequired: true, returnedAt: '' }];
  mockPanel.dismissReturn = jest.fn((id: string) => { mockPanel = { ...mockPanel, returnRequests: mockPanel.returnRequests.filter((r: any) => r.deliveryId !== id) }; });
  post.mockResolvedValue({ data: { success: true } });
  const { rerender } = render(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Devoluções/ })).toHaveTextContent('1');
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  await waitFor(() => expect(mockPanel.dismissReturn).toHaveBeenCalledWith('dord000004819'));
  rerender(<SellerPedidosPage />);
  expect(screen.getByRole('tab', { name: /^Devoluções/ })).toHaveTextContent('0');
  expect(screen.getByText('Nenhuma devolução — ótimo sinal')).toBeInTheDocument();
});
