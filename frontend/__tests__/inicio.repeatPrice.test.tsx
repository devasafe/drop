import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Inicio from '../pages/inicio';
import { formatMoney } from '../lib/money';

const add = jest.fn((_i: any, o: any) => { o?.onAdded?.(); return 'added'; });
const showToast = jest.fn();
const get = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
  useFeaturedStores: () => ({ stores: [], loading: false }),
  usePromoBanners: () => ({ banners: [], loading: false }),
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false }),
}));
// O GET /orders devolve nome e foto ATUAIS do produto, mas o preço é o snapshot do pedido.
jest.mock('../hooks/useActiveOrders', () => ({
  useActiveOrders: () => ({
    activeOrders: [],
    orders: [1, 2, 3].map((n) => ({ _id: `o${n}`, status: 'entregue', storeId: 's9', storeName: 'Mercado', createdAt: new Date().toISOString(),
      products: [{ productId: 'p1', productName: 'RedBull', image: 'redbull.jpg', price: 27000, quantity: 1 }] })),
    loading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

const current = { _id: 'p1', name: 'RedBull', price: 19, quantity: 10, isActive: true, image: 'redbull.jpg', storeId: 's9' };

beforeEach(() => {
  add.mockClear(); showToast.mockClear(); get.mockReset();
  get.mockImplementation((url: string) => url === '/products/p1' ? Promise.resolve({ data: current }) : new Promise(() => {}));
});

test('"De novo" põe na sacola o preço ATUAL do produto, nunca o do pedido antigo, e avisa que mudou', async () => {
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'De novo: RedBull' }));
  await waitFor(() => expect(add).toHaveBeenCalled());
  expect(get).toHaveBeenCalledWith('/products/p1');
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's9' }), expect.anything());
  expect(showToast).toHaveBeenCalledWith(`Adicionado à sacola. O preço mudou: agora ${formatMoney(19)}.`, 'success', expect.objectContaining({ action: expect.objectContaining({ label: 'Ver sacola' }) }));
});

test('"Pra você repetir" não mostra o preço do pedido antigo', () => {
  render(<Inicio />);
  expect(screen.queryByText(formatMoney(27000))).not.toBeInTheDocument();
});

test('produto que saiu do catálogo: não entra na sacola e avisa', async () => {
  get.mockImplementation((url: string) => url === '/products/p1' ? Promise.reject({ response: { status: 404 } }) : new Promise(() => {}));
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'De novo: RedBull' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Este produto não está mais disponível.', 'error'));
  expect(add).not.toHaveBeenCalled();
});

test('produto esgotado: não entra na sacola e avisa', async () => {
  get.mockImplementation((url: string) => url === '/products/p1' ? Promise.resolve({ data: { ...current, quantity: 0 } }) : new Promise(() => {}));
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'De novo: RedBull' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('RedBull esgotou.', 'error'));
  expect(add).not.toHaveBeenCalled();
});

test('erro de rede: não põe preço velho na sacola, pede para tentar de novo', async () => {
  get.mockImplementation((url: string) => url === '/products/p1' ? Promise.reject(new Error('Network Error')) : new Promise(() => {}));
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'De novo: RedBull' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Não conseguimos adicionar agora. Tente de novo.', 'error'));
  expect(add).not.toHaveBeenCalled();
});
