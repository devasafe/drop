import { render, screen } from '@testing-library/react';
import { OrderItemsSummary } from '../OrderItemsSummary';

test('mostra total formatado', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 2, price: 50 }]} subtotal={100} deliveryFee={10} discount={0} total={110} />);
  expect(screen.getByText(/110,00/)).toBeInTheDocument();
});

test('lista itens com nome, quantidade e subtotal por linha', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 2, price: 50 }]} subtotal={100} deliveryFee={0} discount={0} total={100} />);
  expect(screen.getByText('Fone')).toBeInTheDocument();
  expect(screen.getByText(/2/)).toBeInTheDocument();
});

test('mostra desconto quando maior que zero', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 1, price: 100 }]} subtotal={100} deliveryFee={10} discount={20} total={90} />);
  expect(screen.getByText(/-R\$ 20,00/)).toBeInTheDocument();
});
