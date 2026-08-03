import { render, screen, fireEvent } from '@testing-library/react';
import { OngoingDeliveryCard } from '../OngoingDeliveryCard';

test('mostra status, ganho (80%) e dispara detalhes', () => {
  const onDetails = jest.fn();
  render(
    <OngoingDeliveryCard
      delivery={{ _id: 'd1', orderId: 'o123456', status: 'picked', fee: 10, distance: 2, pickupLocation: 'Loja X' }}
      onDetails={onDetails}
    />
  );
  expect(screen.getByText('Em trânsito')).toBeInTheDocument();
  expect(screen.getByText(/R\$\s?8,00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));
  expect(onDetails).toHaveBeenCalled();
});
