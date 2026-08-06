import { render, screen, fireEvent } from '@testing-library/react';
import { CardForm } from '../CardForm';

test('emite valid=false com número curto e valid=true quando completo', () => {
  const onChange = jest.fn();
  render(<CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '24971563792', postalCode: '01310000', addressNumber: '10', phone: '11999999999' }} />);
  fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '4111' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ valid: false }));
});

test('valid=true quando número, nome, validade e CVV completos e válidos (Luhn)', () => {
  const onChange = jest.fn();
  render(<CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '24971563792', postalCode: '01310000', addressNumber: '10', phone: '11999999999' }} />);
  fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '4111111111111111' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Fulano de Tal' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '1230' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    valid: true,
    card: expect.objectContaining({ number: '4111111111111111', holderName: 'Fulano de Tal', expiryMonth: '12', expiryYear: '2030', ccv: '123' }),
    cardHolder: expect.objectContaining({ cpfCnpj: '24971563792' }),
  }));
});
