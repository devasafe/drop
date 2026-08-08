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

test('mostra forma de pagamento humanizada e parcelas quando informado', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 1, price: 100 }]} subtotal={100} deliveryFee={0} discount={0} total={100} paymentMethod="credit_card" installmentCount={3} />);
  expect(screen.getByText('Cartão de crédito · 3x')).toBeInTheDocument();
});

test('1x não mostra sufixo de parcelas e exibe saldo da carteira usado', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 1, price: 100 }]} subtotal={100} deliveryFee={0} discount={0} total={100} paymentMethod="pix" installmentCount={1} walletApplied={20} />);
  expect(screen.getByText('PIX')).toBeInTheDocument();
  expect(screen.getByText('Saldo da carteira usado')).toBeInTheDocument();
});

test('sem paymentMethod não renderiza o bloco de pagamento (compat)', () => {
  render(<OrderItemsSummary items={[{ name: 'Fone', quantity: 1, price: 100 }]} subtotal={100} deliveryFee={0} discount={0} total={100} />);
  expect(screen.queryByText('Forma de pagamento')).toBeNull();
});
