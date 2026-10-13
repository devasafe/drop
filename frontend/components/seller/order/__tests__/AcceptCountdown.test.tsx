import fs from 'fs';
import path from 'path';
import { render, screen, act } from '@testing-library/react';
import { AcceptCountdown } from '../AcceptCountdown';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const NOW = new Date('2026-10-12T12:00:00Z').getTime();

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
afterEach(() => { jest.useRealTimers(); });

test('conta a partir do acceptDeadline do servidor e anda a cada segundo', () => {
  render(<AcceptCountdown deadline={new Date(NOW + 252000).toISOString()} />);
  expect(screen.getByRole('timer')).toHaveTextContent('cancela em 4:12');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(screen.getByRole('timer')).toHaveTextContent('cancela em 4:11');
});

test('prazo de 10 min do servidor aparece como 10:00, nunca "5 min" fixo', () => {
  const { container } = render(<AcceptCountdown deadline={new Date(NOW + 600000).toISOString()} />);
  expect(screen.getByRole('timer')).toHaveTextContent('cancela em 10:00');
  expect(container.textContent).not.toMatch(/5 min/);
  expect(container.textContent).not.toMatch(/aceita sozinho/i);
});

test('ao vencer durante a contagem, troca para o aviso de cancelamento', () => {
  render(<AcceptCountdown deadline={new Date(NOW + 2000).toISOString()} />);
  expect(screen.getByRole('timer')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(2000); });
  expect(screen.getByText('Cancelado por falta de aceite')).toBeInTheDocument();
  expect(screen.queryByRole('timer')).toBeNull();
});

test('prazo vencido avisa que o pedido foi cancelado', () => {
  render(<AcceptCountdown deadline={new Date(NOW - 1000).toISOString()} />);
  expect(screen.getByText('Cancelado por falta de aceite')).toBeInTheDocument();
});

test('onExpire dispara uma vez quando o prazo vence', () => {
  const onExpire = jest.fn();
  render(<AcceptCountdown deadline={new Date(NOW + 2000).toISOString()} onExpire={onExpire} />);
  expect(onExpire).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(5000); });
  expect(onExpire).toHaveBeenCalledTimes(1);
});

test('onExpire dispara ao montar com prazo já vencido', () => {
  const onExpire = jest.fn();
  render(<AcceptCountdown deadline={new Date(NOW - 1000).toISOString()} onExpire={onExpire} />);
  expect(onExpire).toHaveBeenCalledTimes(1);
});

test('sem deadline (ou inválido) não mostra nada', () => {
  const a = render(<AcceptCountdown deadline={null} />);
  expect(a.container).toBeEmptyDOMElement();
  a.unmount();
  const b = render(<AcceptCountdown deadline="lixo" />);
  expect(b.container).toBeEmptyDOMElement();
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'AcceptCountdown.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
