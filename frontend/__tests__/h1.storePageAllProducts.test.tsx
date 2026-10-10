import { render, screen, waitFor } from '@testing-library/react';
import StorePage from '../pages/stores/[id]';
import api from '../lib/api';

// H1 — a página da loja busca os produtos DELA (GET /products?storeId=…) percorrendo as
// páginas, em vez de filtrar os 20 primeiros produtos do app inteiro.

jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 's1' }, push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add: jest.fn() }) }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => {}, isConnected: false }) }));
jest.mock('../components/drop/StoreCartPanel', () => ({ StoreCartPanel: () => null }));

const stores = [{ _id: 's1', name: 'Loja Grande', isOpen: true, plan: 2 }];
// O app inteiro (useProducts) só enxerga 20 produtos — não pode ser a fonte da página da loja.
const vinte = Array.from({ length: 20 }, (_, i) => ({ _id: `g${i}`, name: `Global ${i}`, price: 5, storeId: 's1', quantity: 5 }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores, loading: false }),
  useProducts: () => ({ products: vinte, loading: false }),
}));

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const prod = (i: number) => ({ _id: `p${i}`, name: `Produto ${String(i).padStart(3, '0')}`, price: 10, storeId: 's1', quantity: 5 });

beforeEach(() => {
  (api.get as jest.Mock).mockReset();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.startsWith('/categories')) return Promise.resolve({ data: [] });
    if (url.startsWith('/products')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page') || '1');
      const items = page === 1
        ? Array.from({ length: 100 }, (_, i) => prod(i + 1))
        : Array.from({ length: 5 }, (_, i) => prod(i + 101));
      return Promise.resolve({ data: { products: items, pagination: { page, limit: 100, total: 105, pages: 2 } } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('Página da loja — todos os produtos', () => {
  it('chama /products com storeId e mostra produtos além dos 20 (2 páginas)', async () => {
    render(<StorePage />);
    expect(await screen.findByText('Produto 105')).toBeInTheDocument();
    expect(screen.getByText('Produto 001')).toBeInTheDocument();
    const urls = (api.get as jest.Mock).mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/products'));
    expect(urls.some((u) => /storeId=s1/.test(u) && /limit=100/.test(u) && /page=2/.test(u))).toBe(true);
    await waitFor(() => expect(screen.queryByText('Global 0')).toBeNull());
  });
});
