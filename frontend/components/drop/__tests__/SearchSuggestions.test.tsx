import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSuggestions } from '../SearchSuggestions';

const data = {
  products: [{ id: 'p1', name: 'Fone Bluetooth JBL', image: null, price: 229.9, oldPrice: null, storeId: 's1' }],
  stores: [{ id: 's2', name: 'Fone Center', slug: 'fone-center' }],
  categories: ['Fones e áudio'],
};
const quotes = { s1: { storeId: 's1', inArea: true, distanceKm: 2, etaMinutes: [25, 35] as [number, number], fee: 5, freeDelivery: false, open: true, source: 'estimate' as const } };
const handlers = () => ({ onProduct: jest.fn(), onStore: jest.fn(), onCategory: jest.fn(), onSearch: jest.fn() });

it('produto com preço e prazo; loja e categoria; "Buscar" confirma o termo', () => {
  const h = handlers();
  render(<SearchSuggestions term="fone blu" data={data} loading={false} quotes={quotes} {...h} />);
  const prod = screen.getByRole('button', { name: /Fone Bluetooth JBL/ });
  expect(prod).toHaveTextContent('R$ 229,90');
  expect(prod).toHaveTextContent('~35 min');
  fireEvent.click(prod);
  expect(h.onProduct).toHaveBeenCalledWith('p1');
  fireEvent.click(screen.getByRole('button', { name: /Fone Center/ }));
  expect(h.onStore).toHaveBeenCalledWith('s2');
  fireEvent.click(screen.getByRole('button', { name: 'Fones e áudio' }));
  expect(h.onCategory).toHaveBeenCalledWith('Fones e áudio');
  fireEvent.click(screen.getByRole('button', { name: 'Buscar "fone blu"' }));
  expect(h.onSearch).toHaveBeenCalledWith('fone blu');
});
it('carregando mostra skeleton; sem nada sugere encurtar', () => {
  const { rerender } = render(<SearchSuggestions term="xyz" data={null} loading quotes={{}} {...handlers()} />);
  expect(screen.getByRole('status', { name: 'Carregando sugestões' })).toBeInTheDocument();
  rerender(<SearchSuggestions term="xyz" data={{ products: [], stores: [], categories: [] }} loading={false} quotes={{}} {...handlers()} />);
  expect(screen.getByText('Nada com "xyz". Tente um termo mais curto.')).toBeInTheDocument();
});
