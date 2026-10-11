import { render, screen, within } from '@testing-library/react';
import ProductPage from '../pages/produto/[id]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';
import { __resetCardFeeConfigCache } from '../hooks/useCardFeeConfig';

jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'p1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(() => 'added') }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
// Referências estáveis: a página tem efeitos que dependem das listas.
const mockProducts = [{ _id: 'p1', name: 'Fone JBL Tune 520BT', price: 229.9, oldPrice: 289.9, quantity: 5, storeId: 's1', images: ['a.jpg', 'b.jpg', 'c.jpg'] }];
const mockStores = [{ _id: 's1', name: 'Eletro Center', isOpen: true, ratingAverage: 4.8, ratingCount: 214 }];
const mockAddresses = [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }];
jest.mock('../hooks/useSync', () => ({
  useProducts: () => ({ products: mockProducts, loading: false }),
  useStores: () => ({ stores: mockStores, loading: false }),
  useAddresses: () => ({ addresses: mockAddresses, loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

beforeEach(() => {
  __resetStoreQuotesCache(); __resetCardFeeConfigCache();
  get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('/reviews') ? { average: 4.8, count: 32, reviews: [] } : {} }));
  post.mockResolvedValue({ data: { data: [{ storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: true, distanceKm: 1.2, source: 'estimate' }] } });
});

test('loja com a nota no link; entrega num cartão com o endereço e "Trocar"', async () => {
  render(<ProductPage />);
  expect(await screen.findByRole('link', { name: 'Vendido por Eletro Center · ★ 4,8' })).toBeInTheDocument();
  const entrega = await screen.findByRole('region', { name: 'Entrega' });
  expect(await within(entrega).findByText('Chega em ~35 min')).toBeInTheDocument();
  expect(within(entrega).getByText('em Av. Paulista, 1578')).toBeInTheDocument();
  expect(within(entrega).getByRole('button', { name: 'Trocar endereço de entrega' })).toBeInTheDocument();
});

test('selo de desconto ao lado do preço', async () => {
  render(<ProductPage />);
  expect(await screen.findByText('-21%')).toBeInTheDocument();
});
