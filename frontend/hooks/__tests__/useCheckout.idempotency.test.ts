import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

// Ruling F-I4: idempotentKey estável por tentativa. O backend devolve o pedido já criado para
// a mesma (cliente, chave) — orderController "Verificar idempotência" — e apaga o pedido quando
// a cobrança falha (compensateFailedOrder), então repetir a chave depois de erro é seguro.
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
const addr = { _id: 'a1', isDefault: true, cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', latitude: '-22.91', longitude: '-43.21' };
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 2, latitude: '-22.9', longitude: '-43.2', isOpen: true }], loading: false }),
  useAddresses: () => ({ addresses: [addr], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 10, storeId: 's1' }], clear: jest.fn() }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }) }));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;
const quote = { storeId: 's1', inArea: true, deliveryFee: 6, distanceKm: 1, etaMinutes: [20, 30], fee: 6, freeDelivery: false, open: true, source: 'route' };
let orderResults: Array<'timeout' | 'ok'> = [];

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') return Promise.resolve({ data: quote });
    const next = orderResults.shift() ?? 'ok';
    return next === 'timeout'
      ? Promise.reject(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))
      : Promise.resolve({ data: { _id: 'o1' } });
  }) as any);
});

const keys = () => mockedApi.post.mock.calls.filter(([u]) => u === '/orders').map(([, b]) => (b as { idempotentKey: string }).idempotentKey);
async function mount() {
  const r = renderHook(() => useCheckout());
  await act(async () => {}); await act(async () => {});
  return r;
}

test('retry depois de timeout reaproveita a mesma chave (o servidor devolve o mesmo pedido)', async () => {
  orderResults = ['timeout', 'ok'];
  const { result } = await mount();
  await act(async () => { await result.current.placeOrder(); });
  await act(async () => { await result.current.placeOrder(); });
  const k = keys();
  expect(k).toHaveLength(2);
  expect(k[0]).toBeTruthy();
  expect(k[1]).toBe(k[0]);
});

test('trocar o método (ou o valor) gera chave nova', async () => {
  orderResults = ['timeout', 'timeout'];
  const { result } = await mount();
  await act(async () => { await result.current.placeOrder(); });
  act(() => { result.current.setUseWallet(true); });
  await act(async () => { await result.current.placeOrder(); });
  const k = keys();
  expect(k[1]).not.toBe(k[0]);
});

test('depois de um pedido criado com sucesso, a próxima tentativa usa chave nova', async () => {
  orderResults = ['ok', 'ok'];
  const { result } = await mount();
  await act(async () => { await result.current.placeOrder(); });
  await act(async () => { await result.current.placeOrder(); });
  const k = keys();
  expect(k[1]).not.toBe(k[0]);
});
