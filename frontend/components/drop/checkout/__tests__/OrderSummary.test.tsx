import { render, screen } from '@testing-library/react';
import { OrderSummary } from '../OrderSummary';

test('mostra total formatado', () => {
  render(<OrderSummary subtotal={100} deliveryFee={11} discount={0} total={111} isPlan1={false} />);
  expect(screen.getByText(/111,00/)).toBeInTheDocument();
});

test('plano 1 mostra frete como travessão', () => {
  render(<OrderSummary subtotal={100} deliveryFee={0} discount={0} total={100} isPlan1={true} />);
  expect(screen.getByTestId('fee-value').textContent).toContain('—');
});
