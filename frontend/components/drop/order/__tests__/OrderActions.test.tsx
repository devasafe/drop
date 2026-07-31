import { render, screen, fireEvent } from '@testing-library/react';
import { OrderActions } from '../OrderActions';

test('mostra e dispara Cancelar quando canCancel', () => {
  const onCancel = jest.fn();
  render(<OrderActions canCancel canConfirmReceived={false} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
  expect(onCancel).toHaveBeenCalled();
});

test('mostra e dispara Confirmar recebimento quando canConfirmReceived', () => {
  const onConfirmReceived = jest.fn();
  render(
    <OrderActions canCancel={false} canConfirmReceived onConfirmReceived={onConfirmReceived} />
  );
  fireEvent.click(screen.getByRole('button', { name: /confirmar recebimento/i }));
  expect(onConfirmReceived).toHaveBeenCalled();
});

test('não mostra nenhum botão quando nada é permitido', () => {
  render(<OrderActions canCancel={false} canConfirmReceived={false} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('botão de confirmar desabilitado durante confirming não dispara callback', () => {
  const onConfirmReceived = jest.fn();
  render(
    <OrderActions
      canCancel={false}
      canConfirmReceived
      onConfirmReceived={onConfirmReceived}
      confirming
    />
  );
  const button = screen.getByRole('button', { name: /confirmar recebimento/i });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onConfirmReceived).not.toHaveBeenCalled();
});

test('não quebra ao clicar sem callback definido', () => {
  render(<OrderActions canCancel canConfirmReceived />);
  expect(() => {
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar recebimento/i }));
  }).not.toThrow();
});
