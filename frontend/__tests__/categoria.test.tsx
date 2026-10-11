import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CategoriaPage from '../pages/categoria/[nome]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

jest.mock('next/router', () => ({ useRouter: () => ({ query: { nome: 'Fones e áudio' }, isReady: true, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(() => 'added') }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({ useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;

beforeEach(() => {
  __resetStoreQuotesCache(); get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/search/category')) return Promise.resolve({ data: { success: true, data: { name: 'Fones e áudio', productCount: 48, storeCount: 6, subCategories: [{ name: 'Sem fio', count: 21 }, { name: 'Com fio', count: 9 }] } } });
    if (url.startsWith('/search?')) return Promise.resolve({ data: { success: true, data: { items: [{ _id: 'p1', name: 'Fone QCY T13', price: 119.9, storeId: 's1', storeName: 'Tech House', quantity: 3 }], nextCursor: null } } });
    return Promise.resolve({ data: {} });
  });
});

test('título, chips com contagem, resumo e produtos com a loja', async () => {
  render(<CategoriaPage />);
  expect(await screen.findByRole('heading', { name: 'Fones e áudio' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Todos 48' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sem fio 21' })).toBeInTheDocument();
  expect(screen.getByText('48 produtos em 6 lojas')).toBeInTheDocument();
  expect(await screen.findByText('Fone QCY T13')).toBeInTheDocument();
  expect(screen.getByText('Tech House')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(expect.stringContaining('categoryName=Fones%20e%20%C3%A1udio'));
  expect(get).not.toHaveBeenCalledWith(expect.stringMatching(/[?&]q=/));
});

test('subcategoria filtra no servidor', async () => {
  render(<CategoriaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sem fio 21' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('subCategory=Sem%20fio')));
});

test('categoria sem produtos: diz e oferece buscar', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: url.startsWith('/search/category')
    ? { name: 'Fones e áudio', productCount: 0, storeCount: 0, subCategories: [] } : { items: [], nextCursor: null } } }));
  render(<CategoriaPage />);
  expect(await screen.findByText('Nada nesta categoria por enquanto')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Buscar produtos' })).toBeInTheDocument();
});
