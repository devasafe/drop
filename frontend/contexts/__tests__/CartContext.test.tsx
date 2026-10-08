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
      <button onClick={() => add({ productId: 'a1', name: 'Fone', price: 200, quantity: 1, storeId: 'loja-a' })}>add-a1</button>
      <button onClick={() => add({ productId: 'a2', name: 'Cabo', price: 40, quantity: 1, storeId: 'loja-a' })}>add-a2</button>
      <button onClick={() => add({ productId: 'b1', name: 'Ração', price: 90, quantity: 1, storeId: 'loja-b' })}>add-b1</button>
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

// Regressão (2026-10-07): a sacola misturava lojas e o pedido saía com a loja do
// primeiro item. Cada pedido é de uma loja só: item de outra loja pede confirmação.
describe('CartContext — uma loja por sacola', () => {
  const ids = () => cart().map((x: any) => x.productId);

  it('itens da mesma loja somam normalmente, sem perguntar', () => {
    setup();
    act(() => screen.getByText('add-a1').click());
    act(() => screen.getByText('add-a2').click());
    expect(ids()).toEqual(['a1', 'a2']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('item de outra loja não entra direto: pergunta antes', () => {
    setup();
    act(() => screen.getByText('add-a1').click());
    act(() => screen.getByText('add-b1').click());
    expect(ids()).toEqual(['a1']);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirmar a troca esvazia a sacola e deixa só o item novo', () => {
    setup();
    act(() => screen.getByText('add-a1').click());
    act(() => screen.getByText('add-a2').click());
    act(() => screen.getByText('add-b1').click());
    act(() => screen.getByRole('button', { name: 'Esvaziar e adicionar' }).click());
    expect(ids()).toEqual(['b1']);
    expect(JSON.parse(localStorage.getItem('cart')!).map((x: any) => x.productId)).toEqual(['b1']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('manter a sacola descarta o item novo', () => {
    setup();
    act(() => screen.getByText('add-a1').click());
    act(() => screen.getByText('add-b1').click());
    act(() => screen.getByRole('button', { name: 'Manter minha sacola' }).click());
    expect(ids()).toEqual(['a1']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
