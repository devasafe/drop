import { render, screen, fireEvent } from '@testing-library/react';
import { RatingForm } from '../RatingForm';

test('submete rating e comentário', () => {
  const onSubmit = jest.fn();
  render(<RatingForm title="Avaliar motoboy" onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /5 estrelas|avaliar com 5/i }));
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(onSubmit).toHaveBeenCalledWith(5, expect.any(String));
});

test('inclui o texto do comentário no envio', () => {
  const onSubmit = jest.fn();
  render(<RatingForm title="Avaliar loja" onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole('button', { name: /3 estrelas/i }));
  fireEvent.change(screen.getByLabelText(/coment[aá]rio/i), { target: { value: 'Entrega rápida!' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
  expect(onSubmit).toHaveBeenCalledWith(3, 'Entrega rápida!');
});

test('botão de envio começa desabilitado sem estrela selecionada', () => {
  render(<RatingForm title="Avaliar motoboy" onSubmit={jest.fn()} />);
  expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
});

test('mostra confirmação em vez do formulário quando submitted', () => {
  render(<RatingForm title="Avaliar motoboy" onSubmit={jest.fn()} submitted />);
  expect(screen.queryByRole('button', { name: /enviar/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /5 estrelas/i })).not.toBeInTheDocument();
});

test('usa o título recebido', () => {
  render(<RatingForm title="Avaliar loja" onSubmit={jest.fn()} />);
  expect(screen.getByText('Avaliar loja')).toBeInTheDocument();
});
