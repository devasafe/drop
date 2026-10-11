import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { Input } from '../Input';
import { Select } from '../Select';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const css = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

it('Input com label é acessível pelo nome e mostra erro com aria-invalid', () => {
  render(<Input label="CPF" value="" onChange={() => {}} error="CPF inválido" />);
  const input = screen.getByLabelText('CPF');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('CPF inválido');
  expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
});
it('Input respeita id do chamador e mostra hint', () => {
  render(<Input id="meu" label="Nome" hint="Como no documento" value="" onChange={() => {}} />);
  expect(screen.getByLabelText('Nome')).toHaveAttribute('id', 'meu');
  expect(screen.getByText('Como no documento')).toBeInTheDocument();
});
it('Input sem label continua renderizando como antes', () => {
  const { container } = render(<Input value="" onChange={() => {}} placeholder="x" />);
  expect(container.querySelector('label')).toBeNull();
});
it('Select com label', () => {
  render(<Select label="Estado" value="SP" onChange={() => {}} options={[{ value: 'SP', label: 'São Paulo' }]} />);
  expect(screen.getByLabelText('Estado')).toBeInTheDocument();
});
it('Select com erro marca aria-invalid', () => {
  render(<Select label="Estado" error="Obrigatório" value="SP" onChange={() => {}} options={[{ value: 'SP', label: 'SP' }]} />);
  expect(screen.getByLabelText('Estado')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Obrigatório');
});
it('CSS dos campos só usa tokens semânticos e borda de input', () => {
  for (const f of ['Input.module.css', 'Select.module.css', 'RadioRow.module.css', 'SearchField.module.css']) {
    expect(cssViolations(css(f))).toEqual([]);
  }
  expect(css('Input.module.css')).toMatch(/--color-border-input/);
  expect(css('Select.module.css')).toMatch(/--color-border-input/);
});
