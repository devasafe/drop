import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

test('renderiza filhos e dispara onClick', () => {
  const onClick = jest.fn();
  render(<Button onClick={onClick}>Peça agora</Button>);
  const btn = screen.getByRole('button', { name: 'Peça agora' });
  fireEvent.click(btn);
  expect(onClick).toHaveBeenCalledTimes(1);
});
test('loading desabilita e mostra estado de carregando', () => {
  render(<Button loading>Salvar</Button>);
  expect(screen.getByRole('button')).toBeDisabled();
});
test('variant aplica a classe correspondente', () => {
  const { container } = render(<Button variant="ghost">X</Button>);
  expect(container.firstChild).toHaveClass('ghost');
});
