// Aba Reembolsos em Pedidos: aparece quando o cliente já pediu algum, com a situação de cada um.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PedidosPage from '../pages/pedidos';
import { pedidoHref } from '../lib/routes';
import api from '../lib/api';

const push = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push, query: mockQuery }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [{ _id: 'h1', storeName: 'Eletro Center', storeId: 's1', status: 'entregue', totalValue: 244, products: [], createdAt: '2026-10-20T10:00:00' }], loading: false, refetch: jest.fn() }) }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../hooks/useReorder', () => ({ useReorder: () => ({ reorder: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

const refund = (over: any) => ({ _id: 'r1', orderId: 'h1', orderCode: 'ABC123', storeName: 'Eletro Center', status: 'aguardando_loja', mode: null, amount: 244, createdAt: '2026-10-28T10:00:00Z', ...over });

beforeEach(() => { push.mockClear(); mockQuery = {}; get.mockReset(); });

test('sem reembolso, sem aba', async () => {
  get.mockResolvedValue({ data: [] });
  render(<PedidosPage />);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/return-requests/mine'));
  expect(screen.queryByRole('tab', { name: /Reembolsos/ })).not.toBeInTheDocument();
});

test('aba conta os abertos e mostra a situação; tocar abre o pedido', async () => {
  get.mockResolvedValue({ data: [refund({}), refund({ _id: 'r2', orderId: 'h2', orderCode: 'XYZ789', status: 'concluido' })] });
  render(<PedidosPage />);
  fireEvent.click(await screen.findByRole('tab', { name: /Reembolsos\s*1/ }));
  expect(screen.getByText('Em análise pela loja')).toBeInTheDocument();
  expect(screen.getByText('Reembolsado')).toBeInTheDocument();
  expect(screen.getByText(/Pedido #ABC123/)).toHaveTextContent('R$ 244,00');
  fireEvent.click(screen.getByText('Em análise pela loja'));
  expect(push).toHaveBeenCalledWith(pedidoHref('h1'));
});

test('vindo do pedido de reembolso (?tab=reembolsos) já abre na aba', async () => {
  mockQuery = { tab: 'reembolsos' };
  get.mockResolvedValue({ data: [refund({})] });
  render(<PedidosPage />);
  expect(screen.getByRole('tab', { name: /Reembolsos/ })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByText('Em análise pela loja')).toBeInTheDocument();
});
