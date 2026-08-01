import { render, screen, fireEvent } from '@testing-library/react';
import BuscarPage from '../pages/index';

const add = jest.fn();
let mockQuery: any = {};
const stores = [{ _id: 's1', name: 'Pizza Place', isOpen: true }];
const products = [
  { _id: 'p1', name: 'Pizza Calabresa', price: 40, category: 'Pizzas', storeId: 's1', quantity: 5 },
  { _id: 'p2', name: 'X-Burger', price: 25, category: 'Lanches', storeId: 's1', quantity: 2 },
];

jest.mock('next/router', () => ({ useRouter: () => ({ query: mockQuery, push: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add }) }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores, loading: false }),
  useProducts: () => ({ products, loading: false }),
}));

beforeEach(() => { add.mockClear(); mockQuery = {}; });

describe('Buscar (/)', () => {
  it('com ?q=pizza filtra lojas e produtos', () => {
    mockQuery = { q: 'pizza' };
    render(<BuscarPage />);
    // "Pizza Place" aparece como card de loja E como rótulo de loja do produto.
    expect(screen.getAllByText('Pizza Place').length).toBeGreaterThan(0);
    expect(screen.getByText('Pizza Calabresa')).toBeInTheDocument();
    expect(screen.queryByText('X-Burger')).toBeNull();
  });
  it('sem query mostra tudo (modo navegar)', () => {
    render(<BuscarPage />);
    expect(screen.getByText('Pizza Calabresa')).toBeInTheDocument();
    expect(screen.getByText('X-Burger')).toBeInTheDocument();
  });
  it('adicionar produto chama o cart (sem alert)', () => {
    render(<BuscarPage />);
    fireEvent.click(screen.getAllByLabelText(/adicionar/i)[0]);
    expect(add).toHaveBeenCalled();
  });
});
