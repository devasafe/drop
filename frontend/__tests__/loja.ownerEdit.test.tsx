import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import StorePage from '../pages/loja/[id]';
import api from '../lib/api';
import { __resetStoreQuotesCache } from '../hooks/useStoreQuotes';

const mockPush = jest.fn();
let mockUser: any = { _id: 'u1' };
let mockStores: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: mockPush, back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: () => 'added', updateQuantity: jest.fn(), removeItem: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));
jest.mock('../components/drop/StoreReviews', () => ({ StoreReviews: () => null }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: mockStores, loading: false }),
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../hooks/useStoreProducts', () => ({ useStoreProducts: () => ({ products: [{ _id: 'p1', name: 'Cabo USB-C', price: 39.9, storeId: 's1', quantity: 10, categoryId: 'c1' }], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  mockPush.mockClear();
  __resetStoreQuotesCache();
  mockStores = [{ _id: 's1', ownerId: 'u1', name: 'Eletro Center', isOpen: true, plan: 2 }];
  (api.get as jest.Mock).mockResolvedValue({ data: [] });
  (api.post as jest.Mock).mockResolvedValue({ data: { data: [] } });
});

test('dono vê o botão Editar com o nome do produto e ele não dispara o clique da linha', async () => {
  mockUser = { _id: 'u1' };
  render(<StorePage />);
  const btn = await screen.findByRole('button', { name: 'Editar Cabo USB-C' });
  expect(btn).toHaveAttribute('title', 'Editar');
  fireEvent.click(btn);
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/seller/edit-product?edit=p1');
});

test('quem não é dono não vê o botão Editar', async () => {
  mockUser = { _id: 'outro' };
  render(<StorePage />);
  await screen.findByText('Cabo USB-C');
  expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
});

test('CSS: o botão do dono não é posicionado por cima do cartão', () => {
  const css = fs.readFileSync(path.join(__dirname, '../pages/loja/Loja.module.css'), 'utf8');
  const rule = (sel: string) => {
    const start = css.indexOf(`
${sel} {`);
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  };
  expect(rule('.ownerBadge')).not.toBe('');
  expect(rule('.ownerBadge')).not.toMatch(/position:\s*absolute/);
  expect(rule('.productRow')).toMatch(/display:\s*(flex|grid)/);
});
