import { render, screen } from '@testing-library/react';
import { CheckoutItems } from '../CheckoutItems';

test('lista itens com subtotal por linha', () => {
  render(<CheckoutItems items={[{ productId: 'p1', quantity: 2, name: 'Fone', price: 50 }]} />);
  expect(screen.getByText('Fone')).toBeInTheDocument();
  expect(screen.getByText(/100,00/)).toBeInTheDocument();
});
