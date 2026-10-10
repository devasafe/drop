import { render, screen, fireEvent } from '@testing-library/react';
import ProductPage from '../pages/produto/[id]';
import api from '../lib/api';
import { lojaHref } from '../lib/routes';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';
import { __resetCardFeeConfigCache } from '../hooks/useCardFeeConfig';

const push = jest.fn();
const showToast = jest.fn();
const add = jest.fn((_i: any, o: any) => { o?.onAdded?.(); return 'added'; });
let mockProducts: any[] = [];
let mockSaas: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'p1' }, push, back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../hooks/useSync', () => ({
  useProducts: () => ({ products: mockProducts, loading: false }),
  useStores: () => ({ stores: [{ _id: 's1', name: 'Eletro Center', isOpen: true }], loading: false }),
  useAddresses: () => ({ addresses: [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

beforeEach(() => {
  __resetStoreQuotesCache(); __resetCardFeeConfigCache();
  push.mockClear(); showToast.mockClear(); add.mockClear();
  mockProducts = [{ _id: 'p1', name: 'Fone JBL Tune 520BT', price: 229.9, oldPrice: 289.9, quantity: 5, storeId: 's1', description: '<p>Bluetooth 5.3</p>' }];
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
  get.mockImplementation((url: string) => {
    if (url.includes('/reviews')) return Promise.resolve({ data: { average: 4.8, count: 32, reviews: [] } });
    if (url === '/settings/platform-config') return Promise.resolve({ data: {} });
    return Promise.resolve({ data: {} });
  });
  post.mockResolvedValue({ data: { data: [{ storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: true, distanceKm: 1.2, source: 'estimate' }] } });
});

test('preço, desconto, parcelamento com total por extenso, nota e entrega', async () => {
  render(<ProductPage />);
  expect(await screen.findByRole('heading', { name: 'Fone JBL Tune 520BT' })).toBeInTheDocument();
  expect(screen.getByRole('group', { name: /De R\$ 289,90 por R\$ 229,90/ })).toBeInTheDocument();
  expect(await screen.findByText(/^ou até \d+x de R\$ [\d.,]+ no cartão \(total R\$ [\d.,]+\)$/)).toBeInTheDocument();
  expect(screen.getByText('4,8')).toBeInTheDocument();
  expect(await screen.findByText('Chega em ~35 min')).toBeInTheDocument();
});

test('modo direto sem cartão: sem parcelamento', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  render(<ProductPage />);
  await screen.findByRole('heading', { name: 'Fone JBL Tune 520BT' });
  expect(screen.queryByText(/no cartão/)).toBeNull();
});

test('barra fixa: quantidade e "Adicionar · R$ total"', async () => {
  render(<ProductPage />);
  await screen.findByRole('heading', { name: 'Fone JBL Tune 520BT' });
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Fone JBL Tune 520BT' }));
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar · R$ 459,80' }));
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quantity: 2, storeName: 'Eletro Center' }), expect.anything());
  expect(showToast).toHaveBeenCalledWith('Adicionado à sacola', 'success', expect.anything());
});

test('esgotado: botão "Esgotado" desabilitado', async () => {
  mockProducts = [{ ...mockProducts[0], quantity: 0 }];
  render(<ProductPage />);
  expect(await screen.findByRole('button', { name: 'Esgotado' })).toBeDisabled();
});

test('"Vendido por" é um link para a loja', async () => {
  render(<ProductPage />);
  expect(await screen.findByRole('link', { name: /Vendido por Eletro Center/ })).toHaveAttribute('href', lojaHref('s1'));
});
