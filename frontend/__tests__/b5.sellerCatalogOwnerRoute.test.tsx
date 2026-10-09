import { render, screen, waitFor } from '@testing-library/react';
import SellerProducts from '../pages/seller/products';
import CreateProduct from '../pages/seller/create-product';
import api from '../lib/api';

// Loja pausada pela mensalidade: a vitrine pública (useStores/useProducts) vem VAZIA.
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, asPath: '/', pathname: '/seller/products' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, activeRole: 'lojista', can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores: [], loading: false }),
  useProducts: () => ({ products: [], loading: false }),
  useCategories: jest.fn(() => ({ categories: [], loading: false })),
}));
jest.mock('../components/ImageCropUploader', () => () => null);
jest.mock('../components/RichTextEditor', () => () => null);
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const dash = {
  store: { _id: 's1', name: 'Loja Pausada', ownerId: 'u1' },
  products: [{ _id: 'p1', storeId: 's1', name: 'Hamburguer do Dono', price: 20, quantity: 4 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: dash });
    return Promise.resolve({ data: [] });
  });
});

test('Meus Produtos mostra os produtos do dono mesmo com a vitrine pública vazia', async () => {
  render(<SellerProducts />);
  expect(await screen.findByText('Hamburguer do Dono')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/stores/dashboard');
});

test('Criar Produto encontra a loja do dono pela dashboard (categorias buscadas com o id dela)', async () => {
  const { useCategories } = require('../hooks/useSync');
  render(<CreateProduct />);
  await waitFor(() => expect(useCategories).toHaveBeenLastCalledWith('s1'));
});
