import { render, screen, within } from '@testing-library/react';
import { SearchSuggestions } from '../SearchSuggestions';

const data = {
  products: [{ id: 'p1', name: 'Fone Bluetooth JBL', image: null, price: 229.9, oldPrice: null, storeId: 's1', storeName: 'Eletro Center' }],
  stores: [],
  categories: ['Fones e áudio'],
};
const h = { onProduct: jest.fn(), onStore: jest.fn(), onCategory: jest.fn(), onSearch: jest.fn() };

it('produto com o trecho em negrito e a loja; categorias numa lista com rótulo', () => {
  render(<SearchSuggestions term="fone blu" data={data} loading={false} quotes={{}} {...h} />);
  const prod = screen.getByRole('button', { name: /Fone Bluetooth JBL/ });
  expect(prod.querySelector('strong')?.textContent).toBe('Fone Blu');
  expect(within(prod).getByText('Eletro Center')).toBeInTheDocument();
  const grupo = screen.getByRole('group', { name: 'Categorias' });
  expect(within(grupo).getByRole('button', { name: 'Fones e áudio' })).toBeInTheDocument();
});
