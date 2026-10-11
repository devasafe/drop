import { render, screen } from '@testing-library/react';
import BuscarPage from '../pages/buscar';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, isReady: true, push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn(() => 'added') }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useAddresses: () => ({ addresses: [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }], loading: false, setAddresses: jest.fn() }),
  useStores: () => ({ stores: [], loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const get = api.get as jest.Mock;
const q = (id: string, open: boolean) => ({ storeId: id, inArea: true, etaMinutes: [20, 30], fee: 5, freeDelivery: false, open, distanceKm: 1, source: 'estimate' });

beforeEach(() => {
  __resetStoreQuotesCache(); localStorage.clear(); get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/search?')) return Promise.resolve({ data: { success: true, data: { items: [
      { _id: 'x', name: 'Fone Sony', price: 279.9, storeId: 's1', quantity: 0 },
      { _id: 'y', name: 'Fone QCY', price: 119.9, storeId: 's1', quantity: 3 },
    ], nextCursor: null } } });
    if (url.startsWith('/stores/nearby')) return Promise.resolve({ data: { success: true, data: [
      { _id: 'f', name: 'Bela Bijus', isOpen: true, quote: q('f', false) },
      { _id: 'o', name: 'Pet&Cia', isOpen: true, quote: q('o', true) },
    ] } });
    return Promise.resolve({ data: {} });
  });
});

test('resultados: linha do endereço, ordenação à vista e esgotados no fim', async () => {
  mockQuery = { q: 'fone' };
  render(<BuscarPage />);
  const qcy = await screen.findByText('Fone QCY');
  const sony = screen.getByText('Fone Sony');
  expect(qcy.compareDocumentPosition(sony) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('Produtos que entregam em Av. Paulista, 1578')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Mais relevantes/ })).toBeInTheDocument();
});

test('Lojas sem termo: quantas entregam no endereço; fechadas no fim', async () => {
  mockQuery = { tab: 'lojas' };
  render(<BuscarPage />);
  expect(await screen.findByText('2 lojas entregam em Av. Paulista, 1578 · mais perto primeiro')).toBeInTheDocument();
  const aberta = screen.getByText('Pet&Cia');
  const fechada = screen.getByText('Bela Bijus');
  expect(aberta.compareDocumentPosition(fechada) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
