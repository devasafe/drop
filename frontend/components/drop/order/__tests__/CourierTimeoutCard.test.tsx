import { render, screen, fireEvent } from '@testing-library/react';
import { CourierTimeoutCard } from '../CourierTimeoutCard';

const props = { storeName: 'Pet Bom', searchingMin: 15, refundAmount: 189.8, paymentMethod: 'pix', onWait: jest.fn(), onCancel: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('diz o que aconteceu e oferece as duas saídas, com o valor no botão de cancelar', () => {
  render(<CourierTimeoutCard {...props} />);
  expect(screen.getByRole('heading', { name: 'Nenhum motoboy aceitou ainda' })).toBeInTheDocument();
  expect(screen.getByText(/Procuramos por 15 min perto da Pet Bom/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continuar esperando/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cancelar e receber R\$\s?189,80/ })).toBeInTheDocument();
  expect(screen.getByText(/Sem taxa: o valor volta inteiro pelo Pix/)).toBeInTheDocument();
});

test('cartão: o reembolso volta no cartão', () => {
  render(<CourierTimeoutCard {...props} paymentMethod="credit_card" />);
  expect(screen.getByText(/volta inteiro no cartão/)).toBeInTheDocument();
});

test('sem tempo conhecido não inventa minutos', () => {
  render(<CourierTimeoutCard {...props} searchingMin={null} />);
  expect(screen.queryByText(/Procuramos por \d+ min/)).not.toBeInTheDocument();
  expect(screen.getByText(/perto da Pet Bom/)).toBeInTheDocument();
});

test('cada botão chama a sua ação; enquanto envia, os dois travam', () => {
  const { rerender } = render(<CourierTimeoutCard {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Continuar esperando/ }));
  expect(props.onWait).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Cancelar e receber/ }));
  expect(props.onCancel).toHaveBeenCalledTimes(1);
  rerender(<CourierTimeoutCard {...props} busy />);
  expect(screen.getByRole('button', { name: /Continuar esperando/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Cancelar e receber/ })).toBeDisabled();
});
