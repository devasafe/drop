import { render, screen, act, fireEvent } from '@testing-library/react';
import { CartProvider, useCart } from '../CartContext';

let ret: string | null = null;
const onAdded = jest.fn();
function Probe() {
  const { add } = useCart();
  return (
    <>
      <button onClick={() => { ret = add({ productId: 'a1', name: 'Fone', price: 200, quantity: 1, storeId: 'A', storeName: 'Eletro Center' }); }}>a1</button>
      <button onClick={() => { ret = add({ productId: 'a2', name: 'Cabo', price: 40, quantity: 1, storeId: 'A', storeName: 'Eletro Center' }); }}>a2</button>
      <button onClick={() => { ret = add({ productId: 'b1', name: 'Ração Golden', price: 90, quantity: 1, storeId: 'B' }, { onAdded }); }}>b1</button>
    </>
  );
}

beforeEach(() => { localStorage.clear(); ret = null; onAdded.mockClear(); });

test('add devolve "added" e, de outra loja, "swap" com sheet que diz a loja e quantos itens', () => {
  render(<CartProvider><Probe /></CartProvider>);
  act(() => screen.getByText('a1').click());
  expect(ret).toBe('added');
  act(() => screen.getByText('a2').click());
  act(() => screen.getByText('b1').click());
  expect(ret).toBe('swap');
  const dialog = screen.getByRole('dialog', { name: 'Trocar de loja?' });
  // confirmação destrutiva (esvazia a sacola): center, spec §6.3
  expect(dialog.className).toMatch(/center/);
  expect(dialog).toHaveTextContent('Sua sacola tem 2 itens da Eletro Center');
  expect(dialog).toHaveTextContent('"Ração Golden"');
  expect(onAdded).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Esvaziar e adicionar' }));
  expect(onAdded).toHaveBeenCalledTimes(1);
});

test('"Manter minha sacola" não chama onAdded', () => {
  render(<CartProvider><Probe /></CartProvider>);
  act(() => screen.getByText('a1').click());
  act(() => screen.getByText('b1').click());
  fireEvent.click(screen.getByRole('button', { name: 'Manter minha sacola' }));
  expect(onAdded).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});
