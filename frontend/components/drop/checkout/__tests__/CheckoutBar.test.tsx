import { render, screen, fireEvent } from '@testing-library/react';
import { CheckoutBar } from '../CheckoutBar';

test('desabilitado não confirma e mostra hint', () => {
  const onConfirm = jest.fn();
  render(<CheckoutBar total={100} onConfirm={onConfirm} disabled hint="Confirme o endereço no mapa" />);
  fireEvent.click(screen.getByRole('button'));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText(/Confirme o endereço/)).toBeInTheDocument();
});

test('habilitado confirma', () => {
  const onConfirm = jest.fn();
  render(<CheckoutBar total={100} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button'));
  expect(onConfirm).toHaveBeenCalled();
});

test('mostra total formatado', () => {
  render(<CheckoutBar total={111} onConfirm={jest.fn()} />);
  expect(screen.getByText(/111,00/)).toBeInTheDocument();
});

test('loading mostra "Processando…" e desabilita', () => {
  const onConfirm = jest.fn();
  render(<CheckoutBar total={100} onConfirm={onConfirm} loading />);
  expect(screen.getByText('Processando…')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(onConfirm).not.toHaveBeenCalled();
});

test('sem hint não renderiza texto de dica', () => {
  render(<CheckoutBar total={100} onConfirm={jest.fn()} />);
  expect(screen.queryByText(/Confirme o endereço/)).not.toBeInTheDocument();
});
