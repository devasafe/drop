import fs from 'fs';
import path from 'path';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PinBoxes } from '../PinBoxes';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

function Harness(props: { error?: boolean; disabled?: boolean }) {
  const [v, setV] = useState('');
  return <PinBoxes value={v} onChange={setV} {...props} />;
}

test('só dígitos, no máximo 5, e cada dígito numa caixa', () => {
  const { container } = render(<Harness />);
  const input = screen.getByLabelText('Código do cliente');
  fireEvent.change(input, { target: { value: '7a3-9 12345' } });
  expect(input).toHaveValue('73912');
  const boxes = container.querySelectorAll('[data-pin-box]');
  expect(boxes).toHaveLength(5);
  expect(Array.from(boxes).map((b) => b.textContent)).toEqual(['7', '3', '9', '1', '2']);
});

test('erro marca aria-invalid e as caixas', () => {
  const { container } = render(<Harness error />);
  expect(screen.getByLabelText('Código do cliente')).toHaveAttribute('aria-invalid', 'true');
  expect(container.querySelector('[data-pin-box][data-error="true"]')).not.toBeNull();
});

test('desabilitado não aceita digitação', () => {
  render(<Harness disabled />);
  expect(screen.getByLabelText('Código do cliente')).toBeDisabled();
});

test('teclado numérico e autocomplete de código', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Código do cliente');
  expect(input).toHaveAttribute('inputmode', 'numeric');
  expect(input).toHaveAttribute('autocomplete', 'one-time-code');
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'PinBoxes.module.css'), 'utf8'))).toEqual([]);
});

test('colar um PIN de 5 dígitos preenche tudo e apagar volta uma caixa', () => {
  const { container } = render(<Harness />);
  const input = screen.getByLabelText('Código do cliente');
  fireEvent.change(input, { target: { value: '48 201' } });
  expect(Array.from(container.querySelectorAll('[data-pin-box]')).map((b) => b.textContent)).toEqual(['4', '8', '2', '0', '1']);
  fireEvent.change(input, { target: { value: '4820' } });
  expect(Array.from(container.querySelectorAll('[data-pin-box]')).map((b) => b.textContent)).toEqual(['4', '8', '2', '0', '']);
});
