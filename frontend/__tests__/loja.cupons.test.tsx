import { render, screen, waitFor } from '@testing-library/react';
import StorePage from '../pages/loja/[id]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';
import { couponLabel } from '../components/drop/StoreCouponChips';

const mockStores = [{ _id: 's1', name: 'Bella Livros', isOpen: true, plan: 2 }];
const mockAddresses: any[] = [];
const mockProducts: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(), updateQuantity: jest.fn(), removeItem: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));
jest.mock('../components/drop/StoreReviews', () => ({ StoreReviews: () => null }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: mockStores, loading: false }),
  useAddresses: () => ({ addresses: mockAddresses, loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../hooks/useStoreProducts', () => ({ useStoreProducts: () => ({ products: mockProducts, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;

const coupons = [
  { _id: 'c1', code: 'LIVRO5', discountType: 'fixed', discountValue: 5, minOrderValue: null, validUntil: '2026-11-30T23:59:59.000Z' },
  { _id: 'c2', code: 'LEIA10', discountType: 'percent', discountValue: 10, minOrderValue: 50, validUntil: '2026-11-30T23:59:59.000Z' },
];

beforeEach(() => { __resetStoreQuotesCache(); get.mockReset(); });

test('mostra os cupons públicos da loja com código e desconto', async () => {
  get.mockImplementation((url: string) => Promise.resolve({
    data: url === '/stores/s1' ? { _id: 's1', name: 'Bella Livros', publicCoupons: coupons } : [],
  }));
  render(<StorePage />);
  expect(await screen.findByRole('heading', { name: 'Cupons da loja' })).toBeInTheDocument();
  expect(screen.getByText('LIVRO5')).toBeInTheDocument();
  expect(screen.getByText('R$ 5,00 de desconto')).toBeInTheDocument();
  expect(screen.getByText('LEIA10')).toBeInTheDocument();
  expect(screen.getByText('10% de desconto acima de R$ 50,00')).toBeInTheDocument();
  expect(screen.getByText('Use o código na sacola.')).toBeInTheDocument();
});

test('sem cupom público (ou resposta sem o campo): o bloco não aparece', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/stores/s1' ? { _id: 's1', name: 'Bella Livros' } : [] }));
  render(<StorePage />);
  await screen.findByRole('heading', { name: 'Bella Livros' });
  await waitFor(() => expect(get).toHaveBeenCalledWith('/stores/s1'));
  expect(screen.queryByText('Cupons da loja')).toBeNull();
});

test('erro ao buscar a loja: o bloco não aparece e a página segue', async () => {
  get.mockImplementation((url: string) => (url === '/stores/s1' ? Promise.reject(new Error('rede')) : Promise.resolve({ data: [] })));
  render(<StorePage />);
  expect(await screen.findByRole('heading', { name: 'Bella Livros' })).toBeInTheDocument();
  await waitFor(() => expect(get).toHaveBeenCalledWith('/stores/s1'));
  expect(screen.queryByText('Cupons da loja')).toBeNull();
});

test('couponLabel: percentual com vírgula e valor fixo em reais', () => {
  expect(couponLabel({ ...coupons[1], discountValue: 7.5 } as any)).toBe('7,5% de desconto acima de R$ 50,00');
  expect(couponLabel(coupons[0] as any)).toBe('R$ 5,00 de desconto');
});
