import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentSelector } from '../PaymentSelector';

test('clicar troca método', () => {
  const onChange = jest.fn();
  render(<PaymentSelector value="pix" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /cart[aã]o/i }));
  expect(onChange).toHaveBeenCalledWith('credit_card');
});

test('renderiza só os métodos passados, na ordem', () => {
  render(<PaymentSelector value="pix" onChange={jest.fn()} methods={['pix', 'credit_card', 'money']} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(3);
  expect(buttons[0]).toHaveAccessibleName(/pix/i);
  expect(buttons[1]).toHaveAccessibleName(/cart[aã]o/i);
  expect(buttons[2]).toHaveAccessibleName(/dinheiro/i);
});

test('nunca renderiza cash_on_delivery mesmo se não filtrado por methods', () => {
  render(<PaymentSelector value="pix" onChange={jest.fn()} methods={['pix', 'credit_card', 'money']} />);
  expect(screen.queryByText(/entrega/i)).not.toBeInTheDocument();
});

test('marca o método ativo com aria-pressed', () => {
  render(<PaymentSelector value="credit_card" onChange={jest.fn()} />);
  expect(screen.getByRole('button', { name: /pix/i })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: /cart[aã]o/i })).toHaveAttribute('aria-pressed', 'true');
});
