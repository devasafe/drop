import { render, screen, fireEvent } from '@testing-library/react';
import { ChatHeader } from '../ChatHeader';

test('mostra título/subtítulo e dispara os botões', () => {
  const onMinimize = jest.fn(); const onClose = jest.fn();
  render(<ChatHeader title="Fulano" subtitle="Loja" onMinimize={onMinimize} onClose={onClose} />);
  expect(screen.getByText('Fulano')).toBeInTheDocument();
  expect(screen.getByText('Loja')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /minimizar/i }));
  fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
  expect(onMinimize).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test('sem onClose, não há botão de fechar', () => {
  const noop = () => {};
  render(<ChatHeader title="Fulano" subtitle="Loja" onMinimize={noop} />);
  expect(screen.getByText('Fulano')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /minimizar/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /fechar/i })).not.toBeInTheDocument();
});

test('onBack só renderiza quando passado', () => {
  const noop = () => {};
  const { rerender } = render(<ChatHeader title="Conversas" onMinimize={noop} />);
  expect(screen.queryByRole('button', { name: /voltar/i })).not.toBeInTheDocument();

  const onBack = jest.fn();
  rerender(<ChatHeader title="Conversas" onMinimize={noop} onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: /voltar/i }));
  expect(onBack).toHaveBeenCalled();
});
