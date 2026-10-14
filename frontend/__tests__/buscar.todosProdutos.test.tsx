import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BuscarPage from '../pages/buscar';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

const push = jest.fn();
const replace = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, push, replace }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(() => 'added') }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;

const mk = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ _id: `p${from + i}`, name: `Produto ${from + i}`, price: 10, storeId: 's1', quantity: 5 }));
const pageRes = (products: any[], page: number, pages: number, total = products.length) =>
  Promise.resolve({ data: { products, pagination: { page, limit: 30, total, pages } } });

beforeEach(() => {
  push.mockClear(); replace.mockClear(); mockQuery = {}; localStorage.clear();
  __resetStoreQuotesCache();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/products?limit=30&page=1') return pageRes(mk(30), 1, 3, 70);
    if (url === '/products?limit=30&page=2') return pageRes(mk(30, 31), 2, 3, 70);
    if (url === '/products?limit=30&page=3') return pageRes(mk(10, 61), 3, 3, 70);
    if (url.startsWith('/search?')) return Promise.resolve({ data: { success: true, data: { items: [{ _id: 'x1', name: 'Fone', price: 40, storeId: 's1', quantity: 5 }], nextCursor: null } } });
    return Promise.resolve({ data: {} });
  });
});

test('sem busca mostra os 30 de /products?limit=30&page=1 e "Página 1 de 3"', async () => {
  render(<BuscarPage />);
  expect(await screen.findByText('Produto 1')).toBeInTheDocument();
  expect(screen.getByText('Produto 30')).toBeInTheDocument();
  expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/products?limit=30&page=1');
  expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/products/offers'));
});

test('próxima leva para page=2 na URL; anterior desabilitado na 1ª', async () => {
  render(<BuscarPage />);
  await screen.findByText('Produto 1');
  expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
  expect(push).toHaveBeenCalledWith('/buscar?page=2');
});

test('com page=2 na URL lê a página 2; na última, próxima desabilitada', async () => {
  mockQuery = { page: '3' };
  render(<BuscarPage />);
  expect(await screen.findByText('Produto 61')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/products?limit=30&page=3');
  expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
  expect(push).toHaveBeenCalledWith('/buscar?page=2');
});

test('página fora do intervalo vai para a última válida', async () => {
  mockQuery = { page: '999' };
  get.mockImplementation((url: string) => url.endsWith('page=999') ? pageRes([], 999, 3, 70) : pageRes(mk(10, 61), 3, 3, 70));
  render(<BuscarPage />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/buscar?page=3'));
});

test('vazio mostra EmptyState', async () => {
  get.mockImplementation(() => pageRes([], 1, 0, 0));
  render(<BuscarPage />);
  expect(await screen.findByText('Nenhum produto por aqui ainda')).toBeInTheDocument();
});

test('erro (429 incluso) mostra tentar de novo e recarrega', async () => {
  get.mockImplementationOnce(() => Promise.reject({ response: { status: 429 } }));
  render(<BuscarPage />);
  const retry = await screen.findByRole('button', { name: 'Tentar de novo' });
  fireEvent.click(retry);
  expect(await screen.findByText('Produto 1')).toBeInTheDocument();
});

test('com termo usa a busca, não a lista', async () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  expect(await screen.findByText('Fone')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/products?'));
  expect(screen.queryByText(/Página 1 de/)).not.toBeInTheDocument();
});

test('aba Lojas não usa a lista de produtos', async () => {
  mockQuery = { tab: 'lojas' };
  render(<BuscarPage />);
  await screen.findByRole('tab', { name: /Lojas/ });
  expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/products?'));
});
