import { render, screen } from '@testing-library/react';
import BuscarPage from '../pages/index';

// Marketplace novo: nada vendeu ainda (top vazio). A vitrine deve preencher
// com o catálogo — lojas premium primeiro e produtos de loja premium.
const stores = [
  { _id: 'S1', name: 'Loja Premium', plan: 3 },
  { _id: 'S2', name: 'Loja Comum', plan: 1 },
];
const products = [
  { _id: 'P1', name: 'Produto Premium', price: 10, storeId: 'S1', quantity: 5 },
  { _id: 'P2', name: 'Produto Comum', price: 5, storeId: 'S2', quantity: 5 },
];

jest.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores, loading: false }),
  useProducts: () => ({ products, loading: false }),
  useTopStores: () => ({ stores: [], loading: false }),
  useTopProducts: () => ({ products: [], loading: false }),
  useAddresses: () => ({ addresses: [], loading: false }),
}));

describe('Buscar — fallback da vitrine (sem vendas)', () => {
  it('preenche lojas do catálogo e produtos de loja premium', () => {
    render(<BuscarPage />);
    expect(screen.getAllByText('Loja Premium').length).toBeGreaterThan(0);
    expect(screen.getByText('Produto Premium')).toBeInTheDocument();
    // "Mais vendidos" é premium-only: produto de loja comum não entra
    expect(screen.queryByText('Produto Comum')).toBeNull();
  });
});
