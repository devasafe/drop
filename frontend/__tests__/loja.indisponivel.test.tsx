import { render, screen } from '@testing-library/react';
import StorePage from '../pages/loja/[id]';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(), updateQuantity: jest.fn(), removeItem: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));
jest.mock('../components/drop/StoreReviews', () => ({ StoreReviews: () => null }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: [], loading: false }),
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../hooks/useStoreProducts', () => ({ useStoreProducts: () => ({ products: [], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;

test('loja pausada: cara reconhecível, o aviso e uma saída', async () => {
  get.mockImplementation((url: string) => url === '/stores/s1'
    ? Promise.reject({ response: { status: 404, data: { code: 'STORE_UNAVAILABLE', store: { _id: 's1', name: 'Eletro Center', neighborhood: 'Pinheiros' } } } })
    : Promise.resolve({ data: [] }));
  render(<StorePage />);
  expect(await screen.findByRole('heading', { name: 'Eletro Center' })).toBeInTheDocument();
  expect(screen.getByText('Fora do ar por enquanto')).toBeInTheDocument();
  expect(screen.getByText('Esta loja não está recebendo pedidos agora')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver lojas' })).toBeInTheDocument();
});

test('loja que não existe: "Loja não encontrada"', async () => {
  get.mockImplementation((url: string) => url === '/stores/s1' ? Promise.reject({ response: { status: 404, data: { error: 'Store not found' } } }) : Promise.resolve({ data: [] }));
  render(<StorePage />);
  expect(await screen.findByText('Loja não encontrada')).toBeInTheDocument();
});
