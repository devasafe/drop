import { render, screen, waitFor } from '@testing-library/react';

const showToast = jest.fn();
const get = jest.fn();
jest.mock('../../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a) } }));

import { CartProvider, useCart } from '../../contexts/CartContext';
import { useCartRevalidation } from '../useCartRevalidation';
import { formatMoney } from '../../lib/money';

function Probe() {
  useCartRevalidation();
  const { cart } = useCart();
  return <span data-testid="cart">{JSON.stringify(cart)}</span>;
}
const cart = () => JSON.parse(screen.getByTestId('cart').textContent || '[]');
const seed = (items: any[]) => localStorage.setItem('cart', JSON.stringify(items));
const product = (over: any = {}) => ({ _id: 'p1', name: 'RedBull', price: 19, quantity: 5, isActive: true, image: 'redbull.jpg', storeId: 's1', ...over });

beforeEach(() => { localStorage.clear(); showToast.mockClear(); get.mockReset(); });

test('item com preço do pedido antigo: a sacola passa a usar preço, nome e foto atuais e avisa', async () => {
  seed([{ productId: 'p1', quantity: 2, name: 'Notebook', price: 27000, storeId: 's1', storeName: 'Loja', image: 'velha.jpg' }]);
  get.mockResolvedValue({ data: product() });
  render(<CartProvider><Probe /></CartProvider>);
  await waitFor(() => expect(cart()[0].price).toBe(19));
  expect(get).toHaveBeenCalledWith('/products/p1');
  expect(cart()[0]).toEqual(expect.objectContaining({ productId: 'p1', quantity: 2, name: 'RedBull', price: 19, image: 'redbull.jpg', storeId: 's1' }));
  expect(JSON.parse(localStorage.getItem('cart')!)[0].price).toBe(19);
  expect(showToast).toHaveBeenCalledWith(`O preço de RedBull mudou: agora ${formatMoney(19)}.`, 'info');
});

test('preço igual: não mexe na sacola nem avisa', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'RedBull', price: 19, storeId: 's1', image: 'redbull.jpg' }]);
  get.mockResolvedValue({ data: product() });
  render(<CartProvider><Probe /></CartProvider>);
  await waitFor(() => expect(get).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  expect(cart()[0].price).toBe(19);
  expect(showToast).not.toHaveBeenCalled();
});

test('produto removido (404), pausado ou esgotado: sai da sacola com aviso', async () => {
  seed([
    { productId: 'gone', quantity: 1, name: 'Sumiu', price: 5, storeId: 's1' },
    { productId: 'paused', quantity: 1, name: 'Pausado', price: 5, storeId: 's1' },
    { productId: 'empty', quantity: 1, name: 'Esgotado', price: 5, storeId: 's1' },
    { productId: 'ok', quantity: 1, name: 'Fica', price: 5, storeId: 's1' },
  ]);
  get.mockImplementation((url: string) => {
    if (url === '/products/gone') return Promise.reject({ response: { status: 404 } });
    if (url === '/products/paused') return Promise.resolve({ data: product({ _id: 'paused', name: 'Pausado', price: 5, isActive: false }) });
    if (url === '/products/empty') return Promise.resolve({ data: product({ _id: 'empty', name: 'Esgotado', price: 5, quantity: 0 }) });
    return Promise.resolve({ data: product({ _id: 'ok', name: 'Fica', price: 5 }) });
  });
  render(<CartProvider><Probe /></CartProvider>);
  await waitFor(() => expect(cart().map((i: any) => i.productId)).toEqual(['ok']));
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Sumiu'), 'info');
  expect(showToast.mock.calls[0][0]).toContain('Pausado');
  expect(showToast.mock.calls[0][0]).toContain('Esgotado');
});

test('erro de rede: a sacola fica como está', async () => {
  seed([{ productId: 'p1', quantity: 1, name: 'Notebook', price: 27000, storeId: 's1' }]);
  get.mockRejectedValue(new Error('Network Error'));
  render(<CartProvider><Probe /></CartProvider>);
  await waitFor(() => expect(get).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 0));
  expect(cart()[0].price).toBe(27000);
  expect(showToast).not.toHaveBeenCalled();
});
