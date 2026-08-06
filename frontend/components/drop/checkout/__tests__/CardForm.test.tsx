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

// Regressão do bug crítico da revisão: cpfCnpj/phone vinham SEMPRE vazios de
// AuthContext (sem cpf/telefone), então cardHolder era mandado pro backend
// com esses campos vazios e todo pedido de cartão caía em 400 (Zod exige
// cpfCnpj com 11/14 dígitos e phone com 10/11 — validation/schemas.ts).
test('valid permanece false quando holderDefaults chega sem cpfCnpj/phone (perfil incompleto), mesmo com o resto do cartão completo', () => {
  const onChange = jest.fn();
  render(<CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '', postalCode: '01310000', addressNumber: '10', phone: '' }} />);
  fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '4111111111111111' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Fulano de Tal' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '1230' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    valid: false,
    cardHolder: expect.objectContaining({ cpfCnpj: '', phone: '' }),
  }));
});

test('cpfCnpj/phone preenchidos manualmente (rede de segurança) tornam o cartão válido e vão pro cardHolder emitido', () => {
  const onChange = jest.fn();
  render(<CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '', postalCode: '01310000', addressNumber: '10', phone: '' }} />);
  fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '4111111111111111' } });
  fireEvent.change(screen.getByLabelText(/nome no cartão/i), { target: { value: 'Fulano de Tal' } });
  fireEvent.change(screen.getByLabelText(/validade/i), { target: { value: '1230' } });
  fireEvent.change(screen.getByLabelText(/cvv/i), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText(/cpf ou cnpj/i), { target: { value: '249.715.637-92' } });
  fireEvent.change(screen.getByLabelText(/telefone do titular/i), { target: { value: '(11) 99999-9999' } });

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    valid: true,
    cardHolder: expect.objectContaining({ cpfCnpj: '24971563792', phone: '11999999999' }),
  }));
  const last = onChange.mock.calls[onChange.mock.calls.length - 1][0];
  expect(last.cardHolder.cpfCnpj).toMatch(/^\d{11}$|^\d{14}$/);
  expect(last.cardHolder.phone).toMatch(/^\d{10,11}$/);
});

test('faz prefill de cpfCnpj/phone quando holderDefaults chega depois (fetch assíncrono de /user/me), sem sobrescrever edição manual', () => {
  const onChange = jest.fn();
  const { rerender } = render(
    <CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '', postalCode: '01310000', addressNumber: '10', phone: '' }} />
  );
  // Simula a resposta de GET /user/me chegando depois do primeiro render.
  rerender(
    <CardForm onChange={onChange} holderDefaults={{ name: 'A', email: 'a@b.com', cpfCnpj: '24971563792', postalCode: '01310000', addressNumber: '10', phone: '11999999999' }} />
  );
  const cpfInput = screen.getByLabelText(/cpf ou cnpj/i) as HTMLInputElement;
  const phoneInput = screen.getByLabelText(/telefone do titular/i) as HTMLInputElement;
  expect(cpfInput.value).toBe('24971563792');
  expect(phoneInput.value).toBe('11999999999');
});
