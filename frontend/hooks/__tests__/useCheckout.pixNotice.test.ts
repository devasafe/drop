/**
 * Aviso do Asaas no Pix (pedido direto, na conta da loja): o useCheckout guarda o
 * provedor do pedido e o nome da loja para o PixPaymentSheet mostrar
 * "Pix processado pelo Asaas. Recebedor: <loja>".
 */
import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
const savedAddress = {
  _id: 'a1', cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro',
  city: 'Rio de Janeiro', state: 'RJ', latitude: '-22.91', longitude: '-43.21',
};
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', name: 'Pizzaria Boa', plan: 2, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => ({ addresses: [savedAddress], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 50, storeId: 's1' }], add: jest.fn(), clear: jest.fn() }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

function mockOrder(order: Record<string, unknown>) {
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') return Promise.resolve({ data: { distanceKm: 1.5 } });
    if (url === '/orders') return Promise.resolve({ data: { order, pix: { qrCodePayload: 'x' } } });
    return Promise.resolve({ data: {} });
  }) as any);
}

async function placePix() {
  const { result } = renderHook(() => useCheckout());
  await act(async () => {});
  act(() => { result.current.address.selectAddress(0); });
  await act(async () => {});
  await act(async () => { await result.current.placeOrder(); });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
});

test('antes de pedir, o aviso começa vazio (nunca undefined)', async () => {
  mockOrder({ _id: 'o0' });
  const { result } = renderHook(() => useCheckout());
  await act(async () => {});
  expect(result.current.pixNotice).toEqual({ paymentProvider: null, recipientName: null });
});

test('pedido direto (asaas_loja): pixNotice leva o provedor e o nome da loja', async () => {
  mockOrder({ _id: 'o1', paymentProvider: 'asaas_loja' });
  const result = await placePix();
  expect(result.current.pixData?.orderId).toBe('o1');
  expect(result.current.pixNotice).toEqual({ paymentProvider: 'asaas_loja', recipientName: 'Pizzaria Boa' });
});

test('pedido de custódia (sem provedor direto): sem aviso do Asaas da loja', async () => {
  mockOrder({ _id: 'o2', paymentProvider: 'asaas' });
  const result = await placePix();
  expect(result.current.pixNotice.paymentProvider).toBe('asaas');
  mockOrder({ _id: 'o3' });
  const r2 = await placePix();
  expect(r2.current.pixNotice).toEqual({ paymentProvider: null, recipientName: 'Pizzaria Boa' });
});
