import { render, screen, fireEvent } from '@testing-library/react';
import BuscarPage from '../pages/index';

const add = jest.fn();
let mockQuery: any = {};
const stores = [{ _id: 's1', name: 'Pizza Place', isOpen: true, plan: 3, latitude: '-22.9', longitude: '-43.2' }];
const products = [
  { _id: 'p1', name: 'Pizza Calabresa', price: 40, category: 'Pizzas', storeId: 's1', quantity: 5 },
  { _id: 'p2', name: 'X-Burger', price: 25, category: 'Lanches', storeId: 's1', quantity: 2 },
];
const topStores = [{ _id: 's1', name: 'Pizza Place', plan: 3, latitude: '-22.9', longitude: '-43.2' }];
const topProducts = [{ _id: 't1', name: 'Top Pizza', price: 40, storeId: 's1', storeName: 'Pizza Place', storePlan: 3, quantity: 5 }];
const addresses = [{ isDefault: true, latitude: '-22.9', longitude: '-43.2' }];

jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, push: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add }) }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores, loading: false }),
  useProducts: () => ({ products, loading: false }),
  useTopStores: () => ({ stores: topStores, loading: false }),
  useTopProducts: () => ({ products: topProducts, loading: false }),
  useAddresses: () => ({ addresses, loading: false }),
}));

beforeEach(() => { add.mockClear(); mockQuery = {}; });

describe('Buscar (/)', () => {
  it('vitrine (sem query): seções de destaque + Mais vendidos + Ver mais', () => {
    render(<BuscarPage />);
    expect(screen.getByText('Lojas em destaque')).toBeInTheDocument();
    expect(screen.getByText('Mais vendidos')).toBeInTheDocument();
    expect(screen.getAllByText('Ver mais').length).toBe(2);
    expect(screen.getByText('Top Pizza')).toBeInTheDocument(); // produto premium mais vendido
  });
  it('busca por texto (?q=pizza) filtra lojas e produtos', () => {
    mockQuery = { q: 'pizza' };
    render(<BuscarPage />);
    expect(screen.getAllByText('Pizza Place').length).toBeGreaterThan(0);
    expect(screen.getByText('Pizza Calabresa')).toBeInTheDocument();
    expect(screen.queryByText('X-Burger')).toBeNull();
  });
  it('adicionar produto (vitrine) chama o cart', () => {
    render(<BuscarPage />);
    fireEvent.click(screen.getAllByLabelText(/adicionar/i)[0]);
    expect(add).toHaveBeenCalled();
  });
});
