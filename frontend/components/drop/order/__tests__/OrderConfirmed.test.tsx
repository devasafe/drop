import { render, screen, fireEvent } from '@testing-library/react';
import { OrderConfirmed } from '../OrderConfirmed';

const base = { _id: 'abc4821', storeName: 'Eletro Center', paymentMethod: 'pix', totalValue: 244, walletApplied: 0, deliveryId: 'd1', deliveryFee: 7.4 };

it('pagamento aprovado, o que acontece agora e as duas saídas', () => {
  const onTrack = jest.fn(); const onContinue = jest.fn();
  render(<OrderConfirmed order={base} onTrack={onTrack} onContinue={onContinue} />);
  expect(screen.getByRole('heading', { name: 'Pagamento aprovado' })).toBeInTheDocument();
  expect(screen.getByText('Avisamos a Eletro Center. Ela tem até 5 minutos para aceitar.')).toBeInTheDocument();
  expect(screen.getByText('Pix recebido')).toBeInTheDocument();
  expect(screen.getByText('R$ 244,00')).toBeInTheDocument();
  expect(screen.getByText('Motoboy retira e leva')).toBeInTheDocument();
  expect(screen.getByText(/código de entrega/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Acompanhar pedido' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar comprando' }));
  expect(onTrack).toHaveBeenCalled(); expect(onContinue).toHaveBeenCalled();
});

it('Plano 1: combina com a loja e sem código de entrega', () => {
  render(<OrderConfirmed order={{ ...base, deliveryId: null, deliveryFee: 0 }} onTrack={() => {}} onContinue={() => {}} />);
  expect(screen.getByText('Combine a entrega com a loja')).toBeInTheDocument();
  expect(screen.queryByText(/código de entrega/)).toBeNull();
});

it('cartão: "Cartão aprovado"', () => {
  render(<OrderConfirmed order={{ ...base, paymentMethod: 'credit_card', cardChargedTotal: 251.07 }} onTrack={() => {}} onContinue={() => {}} />);
  expect(screen.getByText('Cartão aprovado')).toBeInTheDocument();
  expect(screen.getByText('R$ 251,07')).toBeInTheDocument();
});
