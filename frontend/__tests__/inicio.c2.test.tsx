import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Inicio from '../pages/inicio';
import { ROUTES } from '../lib/routes';

const push = jest.fn();
const add = jest.fn((_i: any, o: any) => { o?.onAdded?.(); return 'added'; });
jest.mock('next/router', () => ({ useRouter: () => ({ push, query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
  useFeaturedStores: () => ({ stores: [], loading: false }),
  usePromoBanners: () => ({ banners: [], loading: false }),
  useNotifications: () => ({ notifications: [], unreadCount: 2, loading: false }),
}));
jest.mock('../hooks/useActiveOrders', () => ({
  useActiveOrders: () => ({
    activeOrders: [],
    orders: [{ _id: 'o1', status: 'entregue', storeId: 's9', storeName: 'Pet&Cia', createdAt: new Date().toISOString(), products: [{ productId: 'p1', productName: 'Ração Golden', price: 89.9 }] }],
    loading: false,
  }),
}));
// "De novo" busca o produto atual (GET /products/:id) antes de pôr na sacola.
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn((url: string) => Promise.resolve(url === '/products/p1'
  ? { data: { _id: 'p1', name: 'Ração Golden', price: 89.9, quantity: 3, isActive: true, storeId: 's9' } }
  : { data: { data: [] } })), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

beforeEach(() => { push.mockClear(); add.mockClear(); });

test('sino com o número de não lidas leva às notificações', () => {
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'Notificações, 2 não lidas' }));
  expect(push).toHaveBeenCalledWith(ROUTES.notificacoes);
});

test('"Pra você repetir": linha de apoio e "De novo" põe na sacola', async () => {
  render(<Inicio />);
  expect(screen.getByText('Último pedido hoje · Pet&Cia')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'De novo: Ração Golden' }));
  await waitFor(() => expect(add).toHaveBeenCalled());
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quantity: 1, storeId: 's9' }), expect.anything());
});
