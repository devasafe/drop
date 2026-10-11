import { render, screen, fireEvent, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ToastProvider, useToast } from '../Toast';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

function Fire() {
  const { showToast } = useToast() as any;
  return <button onClick={() => showToast('Item removido', 'info', { action: { label: 'Desfazer', onClick: (globalThis as any).__undo } })}>go</button>;
}

it('toast com ação chama o callback', () => {
  (globalThis as any).__undo = jest.fn();
  render(<ToastProvider><Fire /></ToastProvider>);
  fireEvent.click(screen.getByText('go'));
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  expect((globalThis as any).__undo).toHaveBeenCalled();
  expect(screen.queryByText('Item removido')).toBeNull();
});

it('assinatura antiga continua valendo', () => {
  function Old() { const { showToast } = useToast() as any; return <button onClick={() => showToast('Salvo', 'success')}>old</button>; }
  jest.useFakeTimers();
  render(<ToastProvider><Old /></ToastProvider>);
  fireEvent.click(screen.getByText('old'));
  expect(screen.getByText('Salvo')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(5000); });
  expect(screen.queryByText('Salvo')).toBeNull();
  jest.useRealTimers();
});

it('com ação dura 6 s; durationMs sobrescreve', () => {
  jest.useFakeTimers();
  function Two() {
    const { showToast } = useToast();
    return (
      <>
        <button onClick={() => showToast('A', 'info', { action: { label: 'x', onClick: () => {} } })}>a</button>
        <button onClick={() => showToast('B', 'info', { durationMs: 1000 })}>b</button>
      </>
    );
  }
  render(<ToastProvider><Two /></ToastProvider>);
  fireEvent.click(screen.getByText('a'));
  fireEvent.click(screen.getByText('b'));
  act(() => { jest.advanceTimersByTime(1500); });
  expect(screen.queryByText('B')).toBeNull();
  expect(screen.getByText('A')).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(4600); });
  expect(screen.queryByText('A')).toBeNull();
  jest.useRealTimers();
});

it('a11y: container polite e erro com role alert', () => {
  function Err() { const { showToast } = useToast(); return <button onClick={() => showToast('Falhou', 'error')}>e</button>; }
  const { container } = render(<ToastProvider><Err /></ToastProvider>);
  expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  fireEvent.click(screen.getByText('e'));
  expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
});

it('CSS sem token antigo, hex ou gradiente', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'Toast.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
