/**
 * V13 · Pedidos: o segmento padrão (sem ?seg) é calculado uma vez ao entrar.
 * - Não pula para "Novos" quando chega um pedido enquanto a pessoa olha outro segmento.
 * - Não pisca num segmento errado antes de o router ou o painel estarem prontos.
 */
import { render, screen } from '@testing-library/react';

let mockQuery: Record<string, string> = {};
let mockReady = true;
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: mockQuery, asPath: '/seller/pedidos', pathname: '/seller/pedidos', isReady: mockReady }),
}));
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
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(() => new Promise(() => {})), post: jest.fn() } }));

import SellerPedidosPage from '../pages/seller/pedidos';

const o = (id: string, over: any = {}) => ({ _id: id, status: 'aguardando_motoboy', deliveryFee: 7, totalValue: 50, customerName: 'Ana', createdAt: '2026-10-12T12:26:00Z', acceptedAt: '2026-10-12T12:28:00Z', products: [{ productName: 'Ração', quantity: 1 }], delivery: { _id: 'd' + id, status: 'pending' }, ...over });
const novo = (id: string) => o(id, { status: 'criado', delivery: null, acceptedAt: null, acceptDeadline: new Date(Date.now() + 5 * 60000).toISOString() });
const panel = (over: any = {}) => ({ inPanel: true, loading: false, error: null, store: { _id: 's1' }, orders: [], history: [], returnRequests: [], dismissReturn: jest.fn(), refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 0, ...over });
const selected = () => screen.queryAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.id.replace(/^.*-tab-/, ''));

beforeEach(() => { mockQuery = {}; mockReady = true; });

test('sem ?seg: chega um pedido novo enquanto olha Em andamento e o segmento não pula', () => {
  mockPanel = panel({ orders: [o('ord1')] });
  const { rerender } = render(<SellerPedidosPage />);
  expect(selected()).toEqual(['andamento']);
  mockPanel = panel({ orders: [o('ord1'), novo('ord2')] });
  rerender(<SellerPedidosPage />);
  expect(selected()).toEqual(['andamento']);
  expect(screen.getByRole('tab', { name: /^Novos/ })).toHaveTextContent('Novos1');
});

test('sem ?seg: espera o painel carregar antes de escolher (não abre em Em andamento e depois pula)', () => {
  mockPanel = panel({ loading: true, orders: [] });
  const { rerender } = render(<SellerPedidosPage />);
  expect(selected()).toEqual([]);
  mockPanel = panel({ orders: [novo('ord2')] });
  rerender(<SellerPedidosPage />);
  expect(selected()).toEqual(['novos']);
});

test('com ?seg: nenhum segmento errado no primeiro render, antes do router ficar pronto', () => {
  mockReady = false;
  mockQuery = {};
  mockPanel = panel({ orders: [novo('ord2')] });
  const { rerender } = render(<SellerPedidosPage />);
  expect(selected()).toEqual([]);
  mockReady = true;
  mockQuery = { seg: 'devolucoes' };
  rerender(<SellerPedidosPage />);
  expect(selected()).toEqual(['devolucoes']);
});
