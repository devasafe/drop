import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveOrdersSection } from '../ActiveOrdersSection';

const orders = [
  { _id: 'aaaaaa111111', status: 'enviado', storeName: 'Loja A', products: [] },
  { _id: 'bbbbbb222222', status: 'pago', storeName: 'Loja B', products: [] },
];

test('sem pedidos não renderiza nada', () => {
  const { container } = render(<ActiveOrdersSection orders={[]} onOpen={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('renderiza um tracker por pedido e o clique abre o pedido', () => {
  const onOpen = jest.fn();
  render(<ActiveOrdersSection orders={orders} onOpen={onOpen} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(onOpen).toHaveBeenCalledWith('aaaaaa111111');
});
