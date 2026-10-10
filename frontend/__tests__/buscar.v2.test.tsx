import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BuscarPage from '../pages/buscar';
import api from '../lib/api';
import { buscarHref, produtoHref } from '../lib/routes';
import { RECENT_SEARCHES_KEY } from '../lib/recentSearches';

const push = jest.fn();
const showToast = jest.fn();
let mockQuery: any = {};
let mockReady = true;
jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, isReady: mockReady, push, replace: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: (_i: any, o: any) => { o?.onAdded?.(); return 'added'; } }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;

beforeEach(() => {
  push.mockClear(); showToast.mockClear(); localStorage.clear(); mockQuery = {}; mockReady = true;
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/search/suggest')) return Promise.resolve({ data: { success: true, data: { products: [{ id: 'p1', name: 'Fone JBL', image: null, price: 229.9, oldPrice: null, storeId: 's1' }], stores: [], categories: [] } } });
    if (url.startsWith('/search?')) return Promise.resolve({ data: { success: true, data: { items: [{ _id: 'p1', name: 'Fone JBL', price: 229.9, storeId: 's1', storeName: 'Eletro Center', quantity: 5 }], nextCursor: null } } });
    return Promise.resolve({ data: {} });
  });
});

test('sem termo: foco no campo e buscas recentes', () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['ração golden']));
  render(<BuscarPage />);
  expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar produtos e lojas' }));
  fireEvent.click(screen.getByRole('button', { name: 'ração golden' }));
  expect(push).toHaveBeenCalledWith(buscarHref({ q: 'ração golden' }));
});

test('digitando: sugestão leva direto ao produto e vira busca recente', async () => {
  jest.useFakeTimers();
  render(<BuscarPage />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar produtos e lojas' }), { target: { value: 'fone' } });
  await act(async () => { jest.advanceTimersByTime(300); });
  jest.useRealTimers();
  fireEvent.click(await screen.findByRole('button', { name: /Fone JBL/ }));
  expect(push).toHaveBeenCalledWith(produtoHref('p1'));
  expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')).toEqual(['fone']);
});

test('termo confirmado: resultados do servidor, com a loja, e adicionar avisa', async () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  expect(await screen.findByText('Eletro Center')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/search?q=fone&type=products&sort=relevance&limit=20');
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Fone JBL' }));
  expect(showToast).toHaveBeenCalledWith('Adicionado à sacola', 'success', expect.anything());
});

test('sem resultado: diz o termo e sugere o que fazer', async () => {
  mockQuery = { q: 'xyz' };
  get.mockImplementation(() => Promise.resolve({ data: { success: true, data: { items: [], nextCursor: null } } }));
  render(<BuscarPage />);
  expect(await screen.findByText('Nada encontrado para "xyz"')).toBeInTheDocument();
  expect(screen.getByText('Confira a ortografia ou tente um termo mais curto.')).toBeInTheDocument();
});

test('erro: "Tentar de novo" busca outra vez', async () => {
  mockQuery = { q: 'fone' };
  get.mockRejectedValueOnce(new Error('500'));
  render(<BuscarPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(screen.getByText('Eletro Center')).toBeInTheDocument());
});

test('router ainda não pronto com ?q=: sem foco e sem buscas recentes', () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['ração golden']));
  mockReady = false; mockQuery = {};
  const { rerender } = render(<BuscarPage />);
  expect(screen.queryByRole('button', { name: 'ração golden' })).toBeNull();
  mockReady = true; mockQuery = { q: 'fone' };
  rerender(<BuscarPage />);
  expect(document.activeElement).not.toBe(screen.getByRole('searchbox', { name: 'Buscar produtos e lojas' }));
  expect(screen.queryByRole('button', { name: 'ração golden' })).toBeNull();
});

test('campo apagado com ?q= ativo: some o resultado e voltam as buscas recentes', async () => {
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['ração golden']));
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  expect(await screen.findByText('Eletro Center')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar produtos e lojas' }), { target: { value: '' } });
  expect(screen.queryByText('Eletro Center')).toBeNull();
  expect(screen.getByRole('button', { name: 'ração golden' })).toBeInTheDocument();
});

test('falha ao carregar mais: avisa e deixa tentar de novo', async () => {
  mockQuery = { q: 'fone' };
  let calls = 0;
  get.mockImplementation((url: string) => {
    if (url.includes('cursor=')) {
      calls++;
      return calls === 1
        ? Promise.reject(new Error('500'))
        : Promise.resolve({ data: { success: true, data: { items: [{ _id: 'p2', name: 'Fone Dois', price: 10, storeId: 's1', storeName: 'Loja Dois', quantity: 5 }], nextCursor: null } } });
    }
    return Promise.resolve({ data: { success: true, data: { items: [{ _id: 'p1', name: 'Fone JBL', price: 229.9, storeId: 's1', storeName: 'Eletro Center', quantity: 5 }], nextCursor: 'c1' } } });
  });
  render(<BuscarPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByText(/Não carregamos mais resultados/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Loja Dois')).toBeInTheDocument();
});

test('aria-controls só existe com as sugestões na tela', async () => {
  render(<BuscarPage />);
  const box = screen.getByRole('searchbox', { name: 'Buscar produtos e lojas' });
  expect(box).not.toHaveAttribute('aria-controls');
  fireEvent.change(box, { target: { value: 'fone' } });
  expect(box).toHaveAttribute('aria-controls', 'busca-sugestoes');
  await screen.findByRole('button', { name: /Fone JBL/ });
});

test('o card do resultado é um link para o produto (teclado)', async () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  const link = await screen.findByRole('link', { name: 'Fone JBL' });
  expect(link).toHaveAttribute('href', produtoHref('p1'));
});
