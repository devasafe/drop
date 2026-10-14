import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

const get = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a) } }));

import { CartProvider, useCart } from '../../contexts/CartContext';
import { useCartRevalidation, __resetCartRevalidation } from '../useCartRevalidation';
import { formatMoney } from '../../lib/money';

let last: ReturnType<typeof useCartRevalidation>;
function Probe() {
  last = useCartRevalidation();
  const { cart, updateQuantity, removeItem } = useCart();
  return (
    <div>
      <span data-testid="cart">{JSON.stringify(cart)}</span>
      <span data-testid="status">{last.status}</span>
      <span data-testid="notice">{last.notice ?? ''}</span>
      <button onClick={() => updateQuantity(cart[0].productId, 5)}>qty</button>
      <button onClick={() => removeItem(cart[0].productId)}>remove</button>
    </div>
  );
}
const cart = () => JSON.parse(screen.getByTestId('cart').textContent || '[]');
const status = () => screen.getByTestId('status').textContent;
const notice = () => screen.getByTestId('notice').textContent;
const seed = (items: any[]) => localStorage.setItem('cart', JSON.stringify(items));
const product = (over: any = {}) => ({ _id: 'p1', name: 'RedBull', price: 19, quantity: 5, isActive: true, image: 'redbull.jpg', storeId: 's1', ...over });
const list = (...products: any[]) => Promise.resolve({ data: { products } });
const mount = () => render(<CartProvider><Probe /></CartProvider>);

beforeEach(() => { localStorage.clear(); get.mockReset(); __resetCartRevalidation(); });

test('preço do pedido antigo: 1 GET em lote, a sacola passa a usar preço, nome e foto atuais e avisa com aviso fixo', async () => {
  seed([{ productId: 'p1', quantity: 2, name: 'Notebook', price: 27000, storeId: 's1', storeName: 'Loja', image: 'velha.jpg' }]);
  get.mockReturnValue(list(product()));
  mount();
  await waitFor(() => expect(status()).toBe('ok'));
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/products?ids=p1');
  expect(cart()[0]).toEqual(expect.objectContaining({ productId: 'p1', quantity: 2, name: 'RedBull', price: 19, image: 'redbull.jpg', storeId: 's1' }));
  expect(JSON.parse(localStorage.getItem('cart')!)[0].price).toBe(19);
  expect(notice()).toBe(`O preço de RedBull mudou: agora ${formatMoney(19)}.`);
});

test('enquanto a conferência não volta, o status é "checking"', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1' }]);
  let resolve!: (v: any) => void;
  get.mockReturnValue(new Promise((r) => { resolve = r; }));
  mount();
  await waitFor(() => expect(cart()).toHaveLength(1));
  expect(status()).toBe('checking');
  await act(async () => { resolve({ data: { products: [product()] } }); });
  expect(status()).toBe('ok');
  expect(notice()).toBe('');
});

test('vários itens: um único GET com todos os ids; mudar quantidade não confere de novo', async () => {
  seed([
    { productId: 'b', quantity: 1, name: 'B', price: 5, storeId: 's1' },
    { productId: 'a', quantity: 1, name: 'A', price: 5, storeId: 's1' },
  ]);
  get.mockReturnValue(list(product({ _id: 'a', name: 'A', price: 5 }), product({ _id: 'b', name: 'B', price: 5 })));
  mount();
  await waitFor(() => expect(status()).toBe('ok'));
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/products?ids=a,b');
  fireEvent.click(screen.getByText('qty'));
  await act(async () => {});
  expect(get).toHaveBeenCalledTimes(1);
});

test('conferida há menos de 30 s e sacola igual: abrir de novo não refaz o GET', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1' }]);
  get.mockReturnValue(list(product()));
  const first = mount();
  await waitFor(() => expect(status()).toBe('ok'));
  first.unmount();
  mount();
  await waitFor(() => expect(cart()).toHaveLength(1));
  expect(status()).toBe('ok');
  expect(get).toHaveBeenCalledTimes(1);
});

test('conferência em voo é reaproveitada (duas telas montadas juntas = 1 GET)', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1' }]);
  get.mockReturnValue(list(product()));
  render(<CartProvider><Probe /><Probe /></CartProvider>);
  await waitFor(() => expect(screen.getAllByTestId('status').every((s) => s.textContent === 'ok')).toBe(true));
  expect(get).toHaveBeenCalledTimes(1);
});

test('ausente na resposta (removido/oculto) ou esgotado: sai da sacola com aviso no plural certo', async () => {
  seed([
    { productId: 'gone', quantity: 1, name: 'Sumiu', price: 5, storeId: 's1' },
    { productId: 'empty', quantity: 1, name: 'Esgotado', price: 5, storeId: 's1' },
    { productId: 'ok', quantity: 1, name: 'Fica', price: 5, storeId: 's1' },
  ]);
  get.mockReturnValue(list(product({ _id: 'empty', name: 'Esgotado', price: 5, quantity: 0 }), product({ _id: 'ok', name: 'Fica', price: 5 })));
  mount();
  await waitFor(() => expect(cart().map((i: any) => i.productId)).toEqual(['ok']));
  await waitFor(() => expect(status()).toBe('ok'));
  expect(notice()).toBe('Sumiu, Esgotado saíram da sacola: não estão mais disponíveis.');
  expect(get).toHaveBeenCalledTimes(1);
});

test('um item removido: singular', async () => {
  seed([{ productId: 'gone', quantity: 1, name: 'Sumiu', price: 5, storeId: 's1' }, { productId: 'ok', quantity: 1, name: 'Fica', price: 5, storeId: 's1' }]);
  get.mockReturnValue(list(product({ _id: 'ok', name: 'Fica', price: 5 })));
  mount();
  await waitFor(() => expect(notice()).toBe('Sumiu saiu da sacola: não está mais disponível.'));
});

test('falha (rede/429/5xx): status "failed", sacola intacta; "Tentar de novo" confere outra vez', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'Notebook', price: 27000, storeId: 's1' }]);
  get.mockRejectedValueOnce({ response: { status: 429 } });
  mount();
  await waitFor(() => expect(status()).toBe('failed'));
  expect(cart()[0].price).toBe(27000);
  get.mockReturnValue(list(product()));
  act(() => { last.retry(); });
  expect(status()).toBe('checking');
  await waitFor(() => expect(status()).toBe('ok'));
  expect(cart()[0].price).toBe(19);
  expect(get).toHaveBeenCalledTimes(2);
});

test('sacola vazia: nada a conferir', () => {
  mount();
  expect(status()).toBe('ok');
  expect(get).not.toHaveBeenCalled();
});

test('servidor que ignora ?ids= (devolve outros produtos): falha, sem tirar nada da sacola', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1' }]);
  get.mockReturnValue(list(product({ _id: 'outro', name: 'Outro' })));
  mount();
  await waitFor(() => expect(status()).toBe('failed'));
  expect(cart().map((i: any) => i.productId)).toEqual(['p1']);
});

test('retry depois de uma conferência ok e recente (409 PRICE_CHANGED): volta a "checking" e consulta de novo', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1' }]);
  get.mockReturnValue(list(product()));
  mount();
  await waitFor(() => expect(status()).toBe('ok'));
  get.mockReturnValue(list(product({ price: 25 })));
  act(() => { last.retry(); });
  expect(status()).toBe('checking');
  await waitFor(() => expect(cart()[0].price).toBe(25));
  await waitFor(() => expect(status()).toBe('ok'));
  expect(notice()).toBe(`O preço de RedBull mudou: agora ${formatMoney(25)}.`);
  expect(get).toHaveBeenCalledTimes(2);
});
