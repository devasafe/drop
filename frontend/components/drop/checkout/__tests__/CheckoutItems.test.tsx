import { render, screen, fireEvent } from '@testing-library/react';
import { CheckoutItems } from '../CheckoutItems';

test('lista itens com subtotal por linha', () => {
  render(<CheckoutItems items={[{ productId: 'p1', quantity: 2, name: 'Fone', price: 50 }]} />);
  expect(screen.getByText('Fone')).toBeInTheDocument();
  expect(screen.getByText(/100,00/)).toBeInTheDocument();
});

const items = [
  { productId: 'p1', name: 'Item A', price: 10, quantity: 1 },
  { productId: 'p2', name: 'Item B', price: 5, quantity: 3 },
];

describe('CheckoutItems interativo', () => {
  it('sem callbacks é só-leitura (sem botões de controle)', () => {
    render(<CheckoutItems items={items} />);
    expect(screen.queryByLabelText(/aumentar quantidade/i)).toBeNull();
    expect(screen.queryByLabelText(/remover/i)).toBeNull();
    expect(screen.getByText('× 3')).toBeInTheDocument();
  });
  it('+ chama onChangeQty com qtd+1', () => {
    const onChangeQty = jest.fn();
    render(<CheckoutItems items={items} onChangeQty={onChangeQty} onRemove={jest.fn()} />);
    fireEvent.click(screen.getAllByLabelText(/aumentar quantidade/i)[0]);
    expect(onChangeQty).toHaveBeenCalledWith('p1', 2);
  });
  it('− desabilitado em qtd 1 e ativo em qtd>1', () => {
    const onChangeQty = jest.fn();
    render(<CheckoutItems items={items} onChangeQty={onChangeQty} onRemove={jest.fn()} />);
    const minus = screen.getAllByLabelText(/diminuir quantidade/i);
    expect(minus[0]).toBeDisabled();          // p1 qtd 1
    fireEvent.click(minus[1]);                 // p2 qtd 3
    expect(onChangeQty).toHaveBeenCalledWith('p2', 2);
  });
  it('lixeira chama onRemove com o productId', () => {
    const onRemove = jest.fn();
    render(<CheckoutItems items={items} onChangeQty={jest.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getAllByLabelText(/remover/i)[1]);
    expect(onRemove).toHaveBeenCalledWith('p2');
  });
});
