import { render, screen, fireEvent } from '@testing-library/react';
import ProdutosPage from '../pages/produtos';

const add = jest.fn();
const stores = [
  { _id: 's1', name: 'Premium Store', plan: 3 },
  { _id: 's2', name: 'Loja Comum', plan: 1 },
];
const products = [
  { _id: 'p1', name: 'Comum A', price: 10, category: 'Lanches', storeId: 's2', quantity: 5 },
  { _id: 'p2', name: 'Premium B', price: 20, category: 'Pizzas', storeId: 's1', quantity: 5 },
];

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ add }) }));
jest.mock('../hooks/useSync', () => ({
  useProducts: () => ({ products, loading: false }),
  useStores: () => ({ stores, loading: false }),
}));

beforeEach(() => add.mockClear());

describe('/produtos', () => {
  it('renderiza todos os produtos, premium primeiro', () => {
    render(<ProdutosPage />);
    const names = screen.getAllByText(/Comum A|Premium B/).map((n) => n.textContent);
    expect(names).toEqual(['Premium B', 'Comum A']); // premium antes
  });
  it('adicionar chama o cart', () => {
    render(<ProdutosPage />);
    fireEvent.click(screen.getAllByLabelText(/adicionar/i)[0]);
    expect(add).toHaveBeenCalled();
  });
});
