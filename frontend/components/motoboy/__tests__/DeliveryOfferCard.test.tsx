import { render, screen, fireEvent } from '@testing-library/react';
import { DeliveryOfferCard } from '../DeliveryOfferCard';

const delivery = { _id: 'd1', orderId: 'o123456', fee: 10, distance: 2.5, pickupLocation: 'Loja X', destination: 'Rua Y' };

test('mostra valor do motoboy (80% da taxa) e dispara callbacks', () => {
  const onAccept = jest.fn();
  const onReject = jest.fn();
  render(<DeliveryOfferCard delivery={delivery} onAccept={onAccept} onReject={onReject} />);

  // 10 * 0.8 = R$ 8,00 — aparece no destaque "Você recebe" e no botão "Aceitar por R$ 8,00"
  expect(screen.getAllByText(/R\$\s?8,00/).length).toBeGreaterThanOrEqual(1);

  fireEvent.click(screen.getByRole('button', { name: /aceitar/i }));
  expect(onAccept).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /recusar/i }));
  expect(onReject).toHaveBeenCalled();
});
