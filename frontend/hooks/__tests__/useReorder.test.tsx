import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useReorder } from '../useReorder';
import { CartProvider, useCart } from '../../contexts/CartContext';
import api from '../../lib/api';

jest.mock('../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

const item = (over: any) => ({
  productId: 'p', name: 'N', image: null, price: 10, previousPrice: 10, quantity: 1,
  requestedQuantity: 1, available: true, priceChanged: false, reason: null, ...over,
});

const wrapper = ({ children }: any) => <CartProvider>{children}</CartProvider>;
const setup = () => renderHook(() => ({ r: useReorder(), c: useCart() }), { wrapper });

beforeEach(() => { localStorage.clear(); jest.resetAllMocks(); });

test('ignora os indisponíveis, põe o resto na sacola e devolve os avisos', async () => {
  const items = [
    item({ productId: 'a', name: 'A', price: 10 }),
    item({ productId: 'b', name: 'B', price: 25, previousPrice: 20, quantity: 2, requestedQuantity: 3, priceChanged: true }),
    item({ productId: 'c', name: 'C', available: false, reason: 'DELETED', quantity: 0 }),
  ];
  mockedApi.get.mockResolvedValueOnce({ data: { success: true, data: { storeId: 's1', storeName: 'L', storeAvailable: true, items } } } as any);
  const { result } = setup();
  let out: any;
  await act(async () => { out = await result.current.r.reorder('o1'); });

  expect(mockedApi.get).toHaveBeenCalledWith('/orders/o1/reorder');
  expect(out.added).toBe(2);
  expect(out.skipped.map((i: any) => i.productId)).toEqual(['c']);
  expect(out.priceChanged.map((i: any) => i.productId)).toEqual(['b']);
  const cart = result.current.c.cart;
  expect(cart.map((i: any) => [i.productId, i.quantity, i.price, i.storeId])).toEqual([['a', 1, 10, 's1'], ['b', 2, 25, 's1']]);
});

test('loja indisponível: nada entra na sacola e a sacola atual fica intacta', async () => {
  const items = [item({ productId: 'a', available: false, reason: 'STORE_UNAVAILABLE', quantity: 0 })];
  mockedApi.get.mockResolvedValueOnce({ data: { success: true, data: { storeId: 's1', storeName: 'L', storeAvailable: false, items } } } as any);
  const { result } = setup();
  act(() => result.current.c.add({ productId: 'x', name: 'X', price: 1, quantity: 1, storeId: 's9' }));
  let out: any;
  await act(async () => { out = await result.current.r.reorder('o1'); });
  expect(out.added).toBe(0);
  expect(out.skipped).toHaveLength(1);
  expect(result.current.c.cart.map((i: any) => i.productId)).toEqual(['x']);
});
