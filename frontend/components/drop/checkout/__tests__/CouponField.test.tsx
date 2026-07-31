import { render, screen, fireEvent } from '@testing-library/react';
import { CouponField } from '../CouponField';

test('aplicar dispara onApply', () => {
  const onApply = jest.fn();
  render(<CouponField code="PROMO" onCodeChange={() => {}} onApply={onApply} onRemove={() => {}} message={null} validating={false} applied={false} />);
  fireEvent.click(screen.getByRole('button', { name: /aplicar/i }));
  expect(onApply).toHaveBeenCalled();
});

test('mensagem de erro aparece', () => {
  render(<CouponField code="X" onCodeChange={() => {}} onApply={() => {}} onRemove={() => {}} message={{ type: 'error', text: 'Cupom inválido' }} validating={false} applied={false} />);
  expect(screen.getByText('Cupom inválido')).toBeInTheDocument();
});

test('remover dispara onRemove quando aplicado', () => {
  const onRemove = jest.fn();
  render(<CouponField code="PROMO" onCodeChange={() => {}} onApply={() => {}} onRemove={onRemove} message={null} validating={false} applied={true} />);
  fireEvent.click(screen.getByRole('button', { name: /remover/i }));
  expect(onRemove).toHaveBeenCalled();
});

test('digitar chama onCodeChange', () => {
  const onCodeChange = jest.fn();
  render(<CouponField code="" onCodeChange={onCodeChange} onApply={() => {}} onRemove={() => {}} message={null} validating={false} applied={false} />);
  fireEvent.change(screen.getByLabelText(/cupom/i), { target: { value: 'ABC' } });
  expect(onCodeChange).toHaveBeenCalledWith('ABC');
});

test('mensagem de sucesso aparece', () => {
  render(<CouponField code="PROMO" onCodeChange={() => {}} onApply={() => {}} onRemove={() => {}} message={{ type: 'ok', text: 'Cupom aplicado!' }} validating={false} applied={true} />);
  expect(screen.getByText('Cupom aplicado!')).toBeInTheDocument();
});

test('botão fica em loading durante validação', () => {
  render(<CouponField code="PROMO" onCodeChange={() => {}} onApply={() => {}} onRemove={() => {}} message={null} validating={true} applied={false} />);
  expect(screen.getByRole('button', { name: /aplicar/i })).toHaveAttribute('aria-busy', 'true');
});

test('label associado ao input', () => {
  render(<CouponField code="" onCodeChange={() => {}} onApply={() => {}} onRemove={() => {}} message={null} validating={false} applied={false} />);
  expect(screen.getByLabelText(/cupom/i)).toBeInTheDocument();
});
