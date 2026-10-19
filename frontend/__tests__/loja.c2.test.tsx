import { render, screen, fireEvent } from '@testing-library/react';
import StorePage from '../pages/loja/[id]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

let mockStores: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: () => 'added', updateQuantity: jest.fn(), removeItem: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));
jest.mock('../components/drop/StoreReviews', () => ({ StoreReviews: () => null }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: mockStores, loading: false }),
  useAddresses: () => ({ addresses: [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../hooks/useStoreProducts', () => ({ useStoreProducts: () => ({ products: [{ _id: 'p1', name: 'Cabo USB-C', price: 39.9, storeId: 's1', quantity: 10, categoryId: 'c1' }], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];

beforeEach(() => {
  __resetStoreQuotesCache();
  mockStores = [{ _id: 's1', name: 'Eletro Center', isOpen: true, plan: 2, neighborhood: 'Pinheiros', city: 'São Paulo', ratingAverage: 4.8, ratingCount: 214, operatingHours: { [day]: { open: '00:00', close: '23:59', closed: false } } }];
  get.mockImplementation((url: string) => Promise.resolve({ data: url.startsWith('/categories') ? [{ _id: 'c1', name: 'Cabos' }] : [] }));
  post.mockResolvedValue({ data: { data: [{ storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: true, distanceKm: 1.2, source: 'estimate' }] } });
});

test('cabeçalho do protótipo: nota, selo de aberta e "Trocar" endereço', async () => {
  render(<StorePage />);
  expect(await screen.findByText('★ 4,8 (214)')).toBeInTheDocument();
  expect(screen.getByText('Aberta até 23:59')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Trocar endereço de entrega' })).toBeInTheDocument();
});

test('categorias em abas: "Destaques" + as da loja', async () => {
  render(<StorePage />);
  expect(await screen.findByRole('tab', { name: 'Destaques' })).toHaveAttribute('aria-selected', 'true');
  expect(await screen.findByRole('tab', { name: 'Cabos' })).toBeInTheDocument();
});

test('busca na capa mostra o campo', async () => {
  render(<StorePage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Buscar na loja' }));
  expect(screen.getByPlaceholderText('Buscar em Eletro Center…')).toBeInTheDocument();
});

test('aberta fora do horário até a abertura de hoje: "Aberta até 18:00" (o fechamento do horário)', async () => {
  // Só o Date é falso: timers reais para o RTL. Quarta 21/10/2026, 07:00 em São Paulo.
  jest.useFakeTimers({
    now: new Date('2026-10-21T07:00:00-03:00'),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout'] as any,
  });
  try {
    mockStores = [{ ...mockStores[0], operatingHours: { wednesday: { open: '10:00', close: '18:00', closed: false } }, openOverrideUntil: '2026-10-21T10:00:00-03:00' }];
    render(<StorePage />);
    expect(await screen.findByText('Aberta até 18:00')).toBeInTheDocument();
    expect(screen.queryByText('Aberta até 10:00')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
