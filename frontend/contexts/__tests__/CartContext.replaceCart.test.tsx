import { render, screen, act } from '@testing-library/react';
import { CartProvider, useCart } from '../CartContext';

function Probe() {
  const { cart, add, replaceCart } = useCart();
  return (
    <div>
      <span data-testid="cart">{JSON.stringify(cart)}</span>
      <button onClick={() => add({ productId: 'old', name: 'Velho', price: 1, quantity: 1, storeId: 'loja-b' })}>add-old</button>
      <button onClick={() => replaceCart('loja-a', [
        { productId: 'p1', quantity: 1, name: 'A', price: 10 },
        { productId: 'p2', quantity: 2, name: 'B', price: 20 },
        { productId: 'p3', quantity: 3, name: 'C', price: 30 },
      ])}>replace</button>
    </div>
  );
}
const cart = () => JSON.parse(screen.getByTestId('cart').textContent || '[]');

describe('CartContext.replaceCart', () => {
  beforeEach(() => localStorage.clear());

  it('com 3 itens deixa os 3, todos da loja informada, e persiste', () => {
    render(<CartProvider><Probe /></CartProvider>);
    act(() => screen.getByText('replace').click());
    expect(cart().map((i: any) => [i.productId, i.quantity, i.storeId])).toEqual([['p1', 1, 'loja-a'], ['p2', 2, 'loja-a'], ['p3', 3, 'loja-a']]);
    expect(JSON.parse(localStorage.getItem('cart')!)).toHaveLength(3);
  });

  it('descarta o que havia de outra loja (uma loja por sacola)', () => {
    render(<CartProvider><Probe /></CartProvider>);
    act(() => screen.getByText('add-old').click());
    act(() => screen.getByText('replace').click());
    expect(cart().some((i: any) => i.productId === 'old')).toBe(false);
    expect(new Set(cart().map((i: any) => i.storeId))).toEqual(new Set(['loja-a']));
  });
});
