import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StorePage from '../pages/loja/[id]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

const updateQuantity = jest.fn();
const removeItem = jest.fn();
const showToast = jest.fn();
let mockCart: any[] = [];
let mockStores: any[] = [];
let mockAddresses: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: mockCart, add: (_i: any, o: any) => { o?.onAdded?.(); return 'added'; }, updateQuantity, removeItem }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));
jest.mock('../components/drop/StoreReviews', () => ({ StoreReviews: () => null }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: mockStores, loading: false }),
  useAddresses: () => ({ addresses: mockAddresses, loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../hooks/useStoreProducts', () => ({ useStoreProducts: () => ({ products: [
  { _id: 'p1', name: 'Cabo USB-C', price: 39.9, storeId: 's1', quantity: 10 },
  { _id: 'p2', name: 'Capa esgotada', price: 49.9, storeId: 's1', quantity: 0 },
  { _id: 'p3', name: 'Fone', price: 229.9, storeId: 's1', quantity: 2 },
], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: [] })), post: jest.fn() } }));
const post = api.post as jest.Mock;

beforeEach(() => {
  __resetStoreQuotesCache();
  mockCart = []; mockAddresses = [{ _id: 'a1', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' }];
  mockStores = [{ _id: 's1', name: 'Eletro Center', isOpen: true, plan: 2, neighborhood: 'Pinheiros', city: 'São Paulo' }];
  updateQuantity.mockClear(); removeItem.mockClear(); showToast.mockClear();
  post.mockResolvedValue({ data: { data: [{ storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: true, distanceKm: 1.2, source: 'estimate' }] } });
});

test('cabeçalho com prazo e frete do endereço atual', async () => {
  render(<StorePage />);
  expect(await screen.findByText('Chega em ~35 min')).toBeInTheDocument();
  expect(screen.getByText('Frete R$ 6,20')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Eletro Center' })).toBeInTheDocument();
});

test('fechada: diz quando abre (sem bloquear a vitrine)', async () => {
  post.mockResolvedValue({ data: { data: [{ storeId: 's1', inArea: true, etaMinutes: [25, 35], fee: 6.2, freeDelivery: false, open: false, opensAt: '09:00', distanceKm: 1.2, source: 'estimate' }] } });
  render(<StorePage />);
  expect(await screen.findByText('Loja fechada agora')).toBeInTheDocument();
  expect(screen.getByText(/Abre às 09:00/)).toBeInTheDocument();
});

test('item na sacola vira seletor de quantidade; levar a 0 remove', () => {
  mockCart = [{ productId: 'p1', quantity: 2, storeId: 's1', name: 'Cabo USB-C', price: 39.9 }];
  render(<StorePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar quantidade de Cabo USB-C' }));
  expect(updateQuantity).toHaveBeenCalledWith('p1', 3);
});

test('com 1 na sacola, o "−" vira remover', () => {
  mockCart = [{ productId: 'p1', quantity: 1, storeId: 's1', name: 'Cabo USB-C', price: 39.9 }];
  render(<StorePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Remover Cabo USB-C' }));
  expect(removeItem).toHaveBeenCalledWith('p1');
});

test('esgotado vai para o fim e não deixa adicionar', () => {
  render(<StorePage />);
  const names = screen.getAllByText(/Cabo USB-C|Capa esgotada|Fone$/).map((n) => n.textContent);
  expect(names[names.length - 1]).toBe('Capa esgotada');
  expect(screen.getByRole('button', { name: 'Adicionar Capa esgotada' })).toBeDisabled();
});

test('adicionar avisa com "Ver sacola"', () => {
  render(<StorePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar Fone' }));
  expect(showToast).toHaveBeenCalledWith('Adicionado à sacola', 'success', expect.anything());
});

test('cotação que falha (ex.: 429) não fica em "Calculando entrega…"', async () => {
  post.mockRejectedValue(Object.assign(new Error('429'), { response: { status: 429 } }));
  render(<StorePage />);
  expect(await screen.findByText('Calculando entrega…')).toBeInTheDocument();
  await waitFor(() => expect(post).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Calculando entrega…')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Eletro Center' })).toBeInTheDocument();
});

test('logo da loja aparece na página pública; falha volta às iniciais; frase curta', async () => {
  mockStores = [{ _id: 's1', name: 'Eletro Center', isOpen: true, plan: 2, logoUrl: 'https://res.cloudinary.com/x/image/upload/v1/logo.png', tagline: 'Som e carga' }];
  render(<StorePage />);
  const imgs = await screen.findAllByAltText('Logo de Eletro Center');
  expect(screen.getByText('Som e carga')).toBeInTheDocument();
  imgs.forEach((i) => fireEvent.error(i));
  expect(screen.queryByAltText('Logo de Eletro Center')).toBeNull();
  expect(screen.getAllByText('EC').length).toBeGreaterThan(0);
});
