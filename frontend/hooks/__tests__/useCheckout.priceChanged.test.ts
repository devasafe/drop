import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

// O app manda o preço que MOSTROU (expectedPrice) de cada item; se o servidor tiver outro preço,
// responde 409 PRICE_CHANGED antes de cobrar e a sacola passa a mostrar os preços dele.
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
const addr = { _id: 'a1', isDefault: true, cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', latitude: '-22.91', longitude: '-43.21' };
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 2, latitude: '-22.9', longitude: '-43.2', isOpen: true }], loading: false }),
  useAddresses: () => ({ addresses: [addr], loading: false, setAddresses: jest.fn() }),
}));
const syncItems = jest.fn();
const clear = jest.fn();
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({
  cart: [{ productId: 'p1', quantity: 2, price: 19, storeId: 's1' }, { productId: 'p2', quantity: 1, price: 5, storeId: 's1' }],
  clear, syncItems,
}) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }) }));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;
const quote = { storeId: 's1', inArea: true, deliveryFee: 6, distanceKm: 1, etaMinutes: [20, 30], fee: 6, freeDelivery: false, open: true, source: 'route' };
let orderReply: () => Promise<any>;

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
  orderReply = () => Promise.resolve({ data: { _id: 'o1' } });
  mockedApi.post.mockImplementation(((url: string) => (url === '/orders/quote' ? Promise.resolve({ data: quote }) : orderReply())) as any);
});

async function mount() {
  const r = renderHook(() => useCheckout());
  await act(async () => {}); await act(async () => {});
  return r;
}
const orderBody = () => mockedApi.post.mock.calls.find(([u]) => u === '/orders')?.[1] as any;

test('o pedido leva o preço mostrado de cada item (expectedPrice)', async () => {
  const { result } = await mount();
  await act(async () => { await result.current.placeOrder(); });
  expect(orderBody().products).toEqual([
    expect.objectContaining({ productId: 'p1', quantity: 2, expectedPrice: 19 }),
    expect.objectContaining({ productId: 'p2', quantity: 1, expectedPrice: 5 }),
  ]);
});

test('409 PRICE_CHANGED: a sacola recebe os preços do servidor, nada é limpo e o pedido não segue', async () => {
  orderReply = () => Promise.reject({ response: { status: 409, data: { error: 'Os preços mudaram. Confira a sacola.', code: 'PRICE_CHANGED', items: [{ productId: 'p1', price: 25 }] } } });
  const { result } = await mount();
  let r: any;
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r).toEqual({ ok: false, code: 'PRICE_CHANGED', error: 'Os preços mudaram. Confira a sacola.' });
  expect(syncItems).toHaveBeenCalledWith({ p1: { price: 25 } });
  expect(clear).not.toHaveBeenCalled();
});
