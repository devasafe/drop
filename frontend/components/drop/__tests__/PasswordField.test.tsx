import { render, screen, fireEvent } from '@testing-library/react';
import { PasswordField } from '../PasswordField';

it('mostra e esconde a senha pelo olho, com nome acessível', () => {
  render(<PasswordField label="Senha" value="segredo12" onChange={() => {}} autoComplete="current-password" />);
  const input = screen.getByLabelText('Senha') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
  expect(input.type).toBe('text');
  expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');
});
