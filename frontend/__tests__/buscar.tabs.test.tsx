import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BuscarPage from '../pages/buscar';
import api from '../lib/api';
import { buscarHref } from '../lib/routes';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

const replace = jest.fn();
let mockQuery: any = {};
let mockAddresses: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, push: jest.fn(), replace }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(() => 'added') }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: mockAddresses, loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [{ _id: 'c1', name: 'Papel & Cia', isOpen: true, plan: 1 }], loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;
const casa = { _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' };

beforeEach(() => {
  replace.mockClear(); mockQuery = {}; mockAddresses = []; localStorage.clear();
  __resetStoreQuotesCache();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/search?') && url.includes('type=stores')) return Promise.resolve({ data: { success: true, data: { items: [{ _id: 's1', name: 'Eletro Center', isOpen: true }], nextCursor: null } } });
    if (url.startsWith('/search?')) return Promise.resolve({ data: { success: true, data: { items: [{ _id: 'p1', name: 'Fone', price: 40, storeId: 's1', quantity: 5 }], nextCursor: null } } });
    if (url.startsWith('/stores/nearby')) return Promise.resolve({ data: { success: true, data: [{ _id: 'n1', name: 'Pet&Cia', isOpen: true, quote: { storeId: 'n1', inArea: true, etaMinutes: [20, 30], fee: 0, freeDelivery: true, open: true, distanceKm: 3, source: 'estimate' } }] } });
    if (url.startsWith('/products/offers')) return Promise.resolve({ data: { success: true, data: [{ _id: 'o1', name: 'Caderno A5', price: 64.9, oldPrice: 79.9, storeId: 'c1' }] } });
    return Promise.resolve({ data: {} });
  });
});

test('aba Lojas com termo e endereço: busca lojas abertas agora, mais perto quando pedido', async () => {
  mockQuery = { q: 'eletro', tab: 'lojas' };
  mockAddresses = [casa];
  render(<BuscarPage />);
  expect(await screen.findByText('Eletro Center')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith(expect.stringMatching(/type=stores.*openNow=1/));
  fireEvent.click(screen.getByRole('button', { name: 'Mais perto' }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.stringContaining('sort=distance')));
});

test('trocar de aba mantém o termo na URL', () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  fireEvent.click(screen.getByRole('tab', { name: /Lojas/ }));
  expect(replace).toHaveBeenCalledWith(buscarHref({ q: 'fone', tab: 'lojas' }));
});

test('filtros: menor preço e faixa de preço vão para o servidor', async () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  await screen.findByText('Fone');
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
  const sheet = screen.getByRole('dialog', { name: 'Filtros' });
  fireEvent.click(within(sheet).getByLabelText('Menor preço'));
  fireEvent.change(within(sheet).getByLabelText('Preço máximo'), { target: { value: '150' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Ver resultados' }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.stringMatching(/sort=price_asc.*maxPrice=150/)));
  expect(screen.getByRole('button', { name: 'Filtros · 2' })).toBeInTheDocument();
});

test('sem endereço, "Mais perto" e "Abertas agora" ficam desabilitados', () => {
  mockQuery = { q: 'eletro', tab: 'lojas' };
  render(<BuscarPage />);
  expect(screen.getByRole('button', { name: 'Mais perto' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Abertas agora' })).toBeDisabled();
});

test('sem termo: Lojas mostra as que entregam perto; Produtos mostra ofertas', async () => {
  mockQuery = { tab: 'lojas' };
  mockAddresses = [casa];
  const { unmount } = render(<BuscarPage />);
  expect(await screen.findByText('Pet&Cia')).toBeInTheDocument();
  expect(screen.getByText('20–30 min · Frete grátis')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/products/offers'));
  unmount();
  mockQuery = { tab: 'produtos' };
  render(<BuscarPage />);
  expect(await screen.findByText('Caderno A5')).toBeInTheDocument();
});

test('filtro sem resultado oferece limpar', async () => {
  mockQuery = { q: 'fone' };
  get.mockImplementation((url: string) => Promise.resolve({ data: { success: true, data: { items: url.includes('maxPrice') ? [] : [{ _id: 'p1', name: 'Fone', price: 400, storeId: 's1' }], nextCursor: null } } }));
  render(<BuscarPage />);
  await screen.findByText('Fone');
  fireEvent.click(screen.getByRole('button', { name: 'Até R$ 50' }));
  expect(await screen.findByText('Nenhum resultado com esses filtros.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
  expect(await screen.findByText('Fone')).toBeInTheDocument();
});
