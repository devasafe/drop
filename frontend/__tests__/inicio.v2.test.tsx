import { render, screen, fireEvent } from '@testing-library/react';
import Inicio from '../pages/inicio';
import api from '../lib/api';
import { buscarHref, pedidoHref } from '../lib/routes';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

const push = jest.fn();
const showToast = jest.fn();
let mockUser: any = null;
let mockAddresses: any[] = [];
let mockActive: any[] = [];
const allStores = [{ _id: 'c1', name: 'Papel & Cia', plan: 1, isOpen: true }, { _id: 'c2', name: 'Pet&Cia', plan: 2, isOpen: true }];

jest.mock('next/router', () => ({ useRouter: () => ({ push, query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: (_i: any, o: any) => { o?.onAdded?.(); return 'added'; } }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: mockAddresses, loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: allStores, loading: false }),
  useFeaturedStores: () => ({ stores: [{ _id: 'f1', name: 'Banner Loja', featuredBannerUrl: 'b.jpg' }], loading: false }),
  usePromoBanners: () => ({ banners: [], loading: false }),
}));
jest.mock('../hooks/useActiveOrders', () => ({ useActiveOrders: () => ({ activeOrders: mockActive, orders: mockActive, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const quote = { storeId: 'n1', inArea: true, distanceKm: 1.2, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: true, source: 'estimate' };

beforeEach(() => {
  push.mockClear(); showToast.mockClear(); localStorage.clear();
  __resetStoreQuotesCache();
  mockUser = null; mockAddresses = []; mockActive = [];
  get.mockReset(); post.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/products/offers')) return Promise.resolve({ data: { success: true, data: [{ _id: 'o1', name: 'Fone JBL', price: 229.9, oldPrice: 289.9, storeId: 'n1', storeName: 'Eletro', quantity: 5 }] } });
    if (url.startsWith('/stores/nearby')) return Promise.resolve({ data: { success: true, data: [{ _id: 'n1', name: 'Eletro Center', plan: 1, isOpen: true, quote }] } });
    return Promise.resolve({ data: {} });
  });
  post.mockResolvedValue({ data: { data: [quote] } });
});

test('sem endereço: pede o endereço e lista lojas de qualquer plano, sem prazo', async () => {
  render(<Inicio />);
  expect(await screen.findByText('Papel & Cia')).toBeInTheDocument(); // plano 1 aparece (spec A9)
  expect(screen.getAllByText('Informe o endereço para ver prazo e frete').length).toBeGreaterThan(0);
  expect(screen.queryByText(/min ·/)).toBeNull();
  expect(get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/stores\/nearby/));
});

test('com endereço: lojas perto (todas os planos) com prazo e frete', async () => {
  mockUser = { _id: 'u1' };
  mockAddresses = [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }];
  render(<Inicio />);
  expect(await screen.findByText('25–35 min · R$ 6,20')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/stores/nearby?lat=-23.56&lng=-46.65&limit=12');
  expect(screen.getByRole('button', { name: /Entregar em Av\. Paulista, 1578/ })).toBeInTheDocument();
});

test('pedido ativo vem antes do banner e abre o pedido', async () => {
  mockUser = { _id: 'u1' };
  mockActive = [{ _id: 'order123', status: 'enviado', storeName: 'Loja X', products: [] }];
  render(<Inicio />);
  const card = await screen.findByRole('button', { name: /Pedido #DER123/ });
  const banner = screen.getByRole('region', { name: /destaques/i });
  expect(card.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(card);
  expect(push).toHaveBeenCalledWith(pedidoHref('order123'));
});

test('ofertas reais (com desconto) e adicionar mostra "Ver sacola"', async () => {
  render(<Inicio />);
  expect(await screen.findByText('Fone JBL')).toBeInTheDocument();
  expect(screen.getByText('-21%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Fone JBL' }));
  expect(showToast).toHaveBeenCalledWith('Adicionado à sacola', 'success', expect.anything());
});

test('a busca do topo abre Buscar com foco; "Ver todas" das lojas abre a aba Lojas', async () => {
  render(<Inicio />);
  fireEvent.click(screen.getByRole('button', { name: 'Buscar produtos e lojas' }));
  expect(push).toHaveBeenCalledWith(buscarHref({ focus: true }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver todas as lojas' }));
  expect(push).toHaveBeenCalledWith(buscarHref({ tab: 'lojas' }));
});
