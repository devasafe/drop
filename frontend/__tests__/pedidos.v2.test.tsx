// __tests__/pedidos.v2.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import PedidosPage from '../pages/pedidos';
import { ROUTES, pedidoHref } from '../lib/routes';

const push = jest.fn();
const reorder = jest.fn(async () => ({ storeId: 's9', storeName: 'Pet&Cia', added: 2, skipped: [], priceChanged: [] }));
let mockOrders: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push, query: {} }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => children }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: mockOrders, loading: false, refetch: jest.fn() }) }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../hooks/useReorder', () => ({ useReorder: () => ({ reorder }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })) } }));

beforeEach(() => {
  push.mockClear(); reorder.mockClear();
  mockOrders = [
    { _id: 'p1', storeName: 'Eletro Center', storeId: 's1', status: 'enviado', totalValue: 277.2, products: [{ productName: 'Fone', quantity: 1 }], createdAt: '2026-10-10T14:02:00' },
    { _id: 'h1', storeName: 'Pet&Cia', storeId: 's9', status: 'entregue', totalValue: 112.4, products: [{ productName: 'Ração', quantity: 2 }], createdAt: '2026-09-12T19:08:00' },
    { _id: 'h2', storeName: 'Papel & Cia', storeId: 's8', status: 'cancelado', totalValue: 39.9, products: [], createdAt: '2026-09-01T10:00:00' },
  ];
});

test('abas com contagem; em andamento com "Acompanhar"', () => {
  render(<PedidosPage />);
  expect(screen.getByRole('tab', { name: /Em andamento\s*1/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /Histórico\s*2/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Acompanhar' }));
  expect(push).toHaveBeenCalledWith(pedidoHref('p1'));
});

test('histórico por mês; "De novo" só no entregue e monta a sacola', async () => {
  render(<PedidosPage />);
  fireEvent.click(screen.getByRole('tab', { name: /Histórico/ }));
  expect(screen.getByText('Setembro de 2026')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'De novo' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'De novo' }));
  await screen.findByText('Pet&Cia');
  expect(reorder).toHaveBeenCalledWith('h1');
  expect(push).toHaveBeenCalledWith(ROUTES.sacola);
});

test('sem pedidos: convite para explorar', () => {
  mockOrders = [];
  render(<PedidosPage />);
  expect(screen.getByText('Seus pedidos aparecem aqui')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Explorar lojas' }));
  expect(push).toHaveBeenCalledWith(ROUTES.inicio);
});
