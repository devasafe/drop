import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryDeliveryCard } from '../HistoryDeliveryCard';

test('entregue: status, ganho, estrelas e detalhes', () => {
  const onDetails = jest.fn();
  render(
    <HistoryDeliveryCard
      delivery={{ _id: 'd1', orderId: 'o123456', status: 'delivered', fee: 10, rating: 4, updatedAt: '2026-08-03T10:00:00' }}
      onDetails={onDetails}
    />
  );
  expect(screen.getByText('Entregue')).toBeInTheDocument();
  expect(screen.getByText(/R\$\s?8,00/)).toBeInTheDocument();
  expect(screen.getByLabelText(/avaliação 4 de 5/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /ver detalhes/i }));
  expect(onDetails).toHaveBeenCalled();
});

test('cancelada: mostra status cancelada e sem estrelas', () => {
  render(<HistoryDeliveryCard delivery={{ _id: 'd2', status: 'cancelled', fee: 5 }} onDetails={() => {}} />);
  expect(screen.getByText('Cancelada')).toBeInTheDocument();
  expect(screen.queryByLabelText(/avaliação/i)).toBeNull();
});
