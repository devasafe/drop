import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push, replace }),
}));
jest.mock('../../lib/api');
const savedAddress = {
  _id: 'a1', cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro',
  city: 'Rio de Janeiro', state: 'RJ', latitude: '-22.91', longitude: '-43.21',
};

jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 2, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => ({ addresses: [savedAddress], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({
    cart: [{ productId: 'p1', quantity: 2, price: 50, storeId: 's1' }],
    add: jest.fn(), clear: jest.fn(),
  }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
});

test('total = subtotal + frete - desconto', async () => {
  const { result } = renderHook(() => useCheckout());
  // subtotal = 2*50 = 100; sem frete/desconto ainda
  expect(result.current.subtotal).toBe(100);
  expect(result.current.total).toBe(100);
  // flush do fetch de carteira/config (assíncrono) antes do teste terminar
  await act(async () => {});
});

test('placeOrder envia payload com idempotentKey e abre pix', async () => {
  // Loja é Plano 2 (entrega integrada) -> canPlace exige distanceKm >= 0.1,
  // que só é calculado via Google Directions após um endereço ser selecionado.
  (window as unknown as { google: unknown }).google = {
    maps: {
      DirectionsService: class {
        route(_req: unknown, cb: (res: { routes: { legs: { distance: { value: number } }[] }[] }, status: string) => void) {
          cb({ routes: [{ legs: [{ distance: { value: 1500 } }] }] }, 'OK');
        }
      },
      TravelMode: { DRIVING: 'DRIVING' },
    },
  };
  mockedApi.post.mockResolvedValueOnce({ data: { order: { _id: 'o1' }, pix: { qrCodePayload: 'x', orderId: 'o1' } } } as unknown as AxiosResponse);
  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush do fetch de carteira/config

  act(() => { result.current.address.selectAddress(0); });
  expect(result.current.distanceKm).toBe(1.5);
  expect(result.current.canPlace).toBe(true);

  await act(async () => { await result.current.placeOrder(); });
  const payload = mockedApi.post.mock.calls.find(c => c[0] === '/orders')?.[1] as Record<string, unknown> | undefined;
  expect(payload?.storeId).toBe('s1');
  expect(payload?.idempotentKey).toBeTruthy();
  expect(payload?.products).toEqual([{ productId: 'p1', quantity: 2, price: 50 }]);
  expect(result.current.pixData?.orderId).toBe('o1');
});
