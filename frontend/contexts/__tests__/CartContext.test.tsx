import { render, screen, act } from '@testing-library/react';
import { CartProvider, useCart } from '../CartContext';

function Probe() {
  const { cart, add, updateQuantity, removeItem } = useCart();
  return (
    <div>
      <span data-testid="cart">{JSON.stringify(cart)}</span>
      <button onClick={() => add({ productId: 'p1', name: 'A', price: 10, quantity: 1 })}>add-p1</button>
      <button onClick={() => add({ productId: 'p2', name: 'B', price: 5, quantity: 2 })}>add-p2</button>
      <button onClick={() => updateQuantity('p1', 4)}>set-p1-4</button>
      <button onClick={() => updateQuantity('p1', 0)}>set-p1-0</button>
      <button onClick={() => updateQuantity('zzz', 9)}>set-missing</button>
      <button onClick={() => removeItem('p1')}>rm-p1</button>
    </div>
  );
}
const setup = () => { localStorage.clear(); return render(<CartProvider><Probe /></CartProvider>); };
const cart = () => JSON.parse(screen.getByTestId('cart').textContent || '[]');

describe('CartContext mutations', () => {
  it('updateQuantity muda a qtd e persiste', () => {
    setup();
    act(() => screen.getByText('add-p1').click());
    act(() => screen.getByText('set-p1-4').click());
    expect(cart().find((x: any) => x.productId === 'p1').quantity).toBe(4);
    expect(JSON.parse(localStorage.getItem('cart')!)[0].quantity).toBe(4);
  });
  it('updateQuantity clampa em 1 (0/negativo → 1)', () => {
    setup();
    act(() => screen.getByText('add-p1').click());
    act(() => screen.getByText('set-p1-0').click());
    expect(cart().find((x: any) => x.productId === 'p1').quantity).toBe(1);
  });
  it('updateQuantity de id inexistente é no-op', () => {
    setup();
    act(() => screen.getByText('add-p1').click());
    act(() => screen.getByText('set-missing').click());
    expect(cart()).toHaveLength(1);
    expect(cart()[0].quantity).toBe(1);
  });
  it('removeItem remove a linha certa e persiste', () => {
    setup();
    act(() => screen.getByText('add-p1').click());
    act(() => screen.getByText('add-p2').click());
    act(() => screen.getByText('rm-p1').click());
    expect(cart().map((x: any) => x.productId)).toEqual(['p2']);
    expect(JSON.parse(localStorage.getItem('cart')!).map((x: any) => x.productId)).toEqual(['p2']);
  });
});
