/**
 * Lote pré-deploy 2 — item E: "Carregar mais" em voo quando o filtro (ou a chave da consulta)
 * muda. A resposta antiga não pode ser anexada à lista nova.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import AdminTransfers from '../pages/admin/transfers';
import AdminEstornos from '../pages/admin/estornos';
import MotoboyTransfersCard from '../components/drop/asaas/MotoboyTransfersCard';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'm1', id: 'm1', activeRole: 'ceo', role: 'ceo', name: 'C' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const transfer = (id: string, storeName: string, motoboyName = 'Zé') => ({
  id, orderId: `ord${id}XXXXXX`, storeName, motoboyName, status: 'failed', amount: 8, attempts: 1, lastError: null, pixKeyMasked: '***4000',
  createdAt: '2026-10-08T10:00:00Z',
});
const refund = (id: string, storeName: string) => ({ id, orderId: id, storeName, status: 'failed', amount: 10, attempts: 1, lastError: null });

/**
 * Sem filtro: página 1 (`first`) com nextCursor 'c1'. "Carregar mais" (cursor c1) fica pendente
 * até `release()`, e devolve `stale`. Com filtro: `filtered`, sem próxima página.
 */
function setup(url: string, first: any, stale: any, filtered: any) {
  let release!: () => void;
  const pending = new Promise<void>((r) => { release = r; });
  (api.get as jest.Mock).mockImplementation(async (u: string, cfg?: any) => {
    if (u !== url) return Promise.reject(new Error('n/a'));
    if (cfg?.params?.cursor === 'c1') {
      await pending;
      return { data: { success: true, data: [stale], nextCursor: 'c2' } };
    }
    if (cfg?.params?.status) return { data: { success: true, data: [filtered], nextCursor: null } };
    return { data: { success: true, data: [first], nextCursor: 'c1' } };
  });
  return () => release();
}

beforeEach(() => jest.clearAllMocks());

test.each([
  ['admin/transfers', AdminTransfers, '/admin/transfers', transfer],
  ['admin/estornos', AdminEstornos, '/admin/direct-refunds', refund],
])('%s: troca de filtro com "Carregar mais" pendente → linhas antigas não aparecem', async (_n, Page: any, url, row: any) => {
  const release = setup(url, row('a1', 'Loja Um'), row('a2', 'Loja Velha'), row('f1', 'Loja Filtrada'));
  render(<Page />);
  await screen.findByText(/Loja Um/);
  fireEvent.click(screen.getByText('Carregar mais'));
  fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'failed' } });
  await screen.findByText(/Loja Filtrada/);
  await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });

  expect(screen.queryByText(/Loja Velha/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Loja Um/)).not.toBeInTheDocument();
  expect(screen.getByText(/Loja Filtrada/)).toBeInTheDocument();
  // o cursor da lista antiga também não volta
  expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();
});

test('loja: trocar de loja com "Carregar mais" pendente → pagamentos da loja anterior não aparecem', async () => {
  let release!: () => void;
  const pending = new Promise<void>((r) => { release = r; });
  (api.get as jest.Mock).mockImplementation(async (u: string, cfg?: any) => {
    if (u === '/stores/s1/transfers' && cfg?.params?.cursor === 'c1') {
      await pending;
      return { data: { success: true, data: [transfer('x2', '', 'Antigo')], nextCursor: null } };
    }
    if (u === '/stores/s1/transfers') return { data: { success: true, data: [transfer('x1', '', 'Primeiro')], nextCursor: 'c1' } };
    if (u === '/stores/s2/transfers') return { data: { success: true, data: [transfer('y1', '', 'Novo')], nextCursor: null } };
    return Promise.reject(new Error('n/a'));
  });
  const { rerender } = render(<MotoboyTransfersCard storeId="s1" />);
  await screen.findByText(/Primeiro/);
  fireEvent.click(screen.getByText('Carregar mais'));
  rerender(<MotoboyTransfersCard storeId="s2" />);
  await screen.findByText(/Novo/);
  await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });

  expect(screen.queryByText(/Antigo/)).not.toBeInTheDocument();
});
