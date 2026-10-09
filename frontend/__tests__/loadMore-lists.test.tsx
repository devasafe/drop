/**
 * Pré-deploy item 2 — "Carregar mais" nas listas paginadas por cursor
 * (admin/transfers, admin/estornos, pagamentos a motoboys da loja, carteira do motoboy).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminTransfers from '../pages/admin/transfers';
import AdminEstornos from '../pages/admin/estornos';
import MotoboyTransfersCard from '../components/drop/asaas/MotoboyTransfersCard';
import MotoboyWalletPage from '../pages/motoboy/wallet';
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

const transfer = (id: string, storeName: string) => ({
  id, orderId: `ord${id}XXXXXX`, storeName, motoboyName: 'Zé', status: 'failed', amount: 8, attempts: 1, lastError: null, pixKeyMasked: '***4000',
  createdAt: '2026-10-08T10:00:00Z',
});

/** Primeira chamada (sem cursor) devolve página 1 + nextCursor 'c1'; com cursor 'c1' devolve a página 2, sem próxima. */
function paged(url: string, page1: any[], page2: any[]) {
  (api.get as jest.Mock).mockImplementation((u: string, cfg?: any) => {
    if (u !== url) {
      if (u.startsWith('/wallets/motoboy')) return Promise.resolve({ data: { balance: 0, availableBalance: 0 } });
      return Promise.reject(new Error('n/a'));
    }
    if (cfg?.params?.cursor === 'c1') return Promise.resolve({ data: { success: true, data: page2, nextCursor: null } });
    return Promise.resolve({ data: { success: true, data: page1, nextCursor: 'c1' } });
  });
}

beforeEach(() => jest.clearAllMocks());

test('admin/transfers: "Carregar mais" busca a próxima página (mantendo o filtro) e some no fim', async () => {
  paged('/admin/transfers', [transfer('t1', 'Loja Um')], [transfer('t2', 'Loja Dois')]);
  render(<AdminTransfers />);
  await screen.findByText(/Loja Um/);
  fireEvent.click(screen.getByText('Carregar mais'));
  expect(await screen.findByText(/Loja Dois/)).toBeInTheDocument();
  expect(screen.getByText(/Loja Um/)).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith('/admin/transfers', { params: { cursor: 'c1' } });
  await waitFor(() => expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument());
});

test('admin/transfers: sem nextCursor, sem botão', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: [transfer('t1', 'Loja Um')], nextCursor: null } });
  render(<AdminTransfers />);
  await screen.findByText(/Loja Um/);
  expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();
});

test('admin/estornos: "Carregar mais" anexa a próxima página', async () => {
  const r = (id: string, storeName: string) => ({ id, orderId: id, storeName, status: 'failed', amount: 10, attempts: 1, lastError: null });
  paged('/admin/direct-refunds', [r('r1', 'Loja Um')], [r('r2', 'Loja Dois')]);
  render(<AdminEstornos />);
  await screen.findByText(/Loja Um/);
  fireEvent.click(screen.getByText('Carregar mais'));
  expect(await screen.findByText(/Loja Dois/)).toBeInTheDocument();
  expect(screen.getByText(/Loja Um/)).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith('/admin/direct-refunds', { params: { cursor: 'c1' } });
  await waitFor(() => expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument());
});

test('loja: pagamentos a motoboys com "Carregar mais"', async () => {
  paged('/stores/s1/transfers', [{ ...transfer('t1', ''), motoboyName: 'Zé' }], [{ ...transfer('t2', ''), motoboyName: 'Ana' }]);
  render(<MotoboyTransfersCard storeId="s1" />);
  await screen.findByText(/Zé/);
  fireEvent.click(screen.getByText('Carregar mais'));
  expect(await screen.findByText(/Ana/)).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith('/stores/s1/transfers', { params: { cursor: 'c1' } });
  await waitFor(() => expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument());
});

test('motoboy/wallet: "Carregar mais" traz mais pagamentos diretos', async () => {
  const t = (id: string, orderId: string) => ({ id, orderId, amount: 8, status: 'done', createdAt: '2026-10-08T10:00:00Z' });
  paged('/motoboy/transfers', [t('a', 'ordAAAAAA')], [t('b', 'ordBBBBBB')]);
  render(<MotoboyWalletPage />);
  expect(await screen.findByText('Entrega #AAAAAA')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Carregar mais'));
  expect(await screen.findByText('Entrega #BBBBBB')).toBeInTheDocument();
  expect(api.get).toHaveBeenLastCalledWith('/motoboy/transfers', { params: { cursor: 'c1' } });
  await waitFor(() => expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument());
});
