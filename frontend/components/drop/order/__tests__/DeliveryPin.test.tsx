import { render, screen } from '@testing-library/react';
import { DeliveryPin } from '../DeliveryPin';

test('mostra o PIN', () => {
  render(<DeliveryPin pin="1234" />);
  expect(screen.getByText('1234')).toBeInTheDocument();
});

test('mostra a dica para o cliente', () => {
  render(<DeliveryPin pin="1234" />);
  expect(screen.getByText('Compartilhe com o motoboy')).toBeInTheDocument();
});
