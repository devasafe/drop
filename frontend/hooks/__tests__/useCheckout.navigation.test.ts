import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';
import { pedidoHref } from '../../lib/routes';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
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

function setup(orderResponse: unknown) {
  mockedApi.get.mockResolvedValue({ data: { balance: 1000 } } as unknown as AxiosResponse);
  mockedApi.post.mockImplementation(((url: string) => Promise.resolve({ data: url === '/orders/quote'
    ? { storeId: 's1', inArea: true, deliveryFee: 6, distanceKm: 1, etaMinutes: [20, 30], fee: 6, freeDelivery: false, open: true, source: 'route' }
    : orderResponse })) as any);
}

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); });

test('resposta do Asaas sem Pix ({ order, card }) navega para o pedido', async () => {
  setup({ order: { _id: 'ord-card' }, card: { status: 'CONFIRMED', approved: true } });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  act(() => { result.current.setPaymentMethod('credit_card'); });
  act(() => { result.current.setCardPayload({ valid: true, card: { holderName: 'F', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' }, cardHolder: { name: 'F', email: 'f@x', cpfCnpj: '39053344705', postalCode: '20000000', addressNumber: '10', phone: '21999999999' } }); });
  await act(async () => { await result.current.placeOrder(); });
  expect(push).toHaveBeenCalledWith(pedidoHref('ord-card'));
});

test('resposta legada (o próprio pedido) navega para o pedido', async () => {
  setup({ _id: 'ord-legado' });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  act(() => { result.current.setPaymentMethod('wallet'); });
  await act(async () => { await result.current.placeOrder(); });
  expect(push).toHaveBeenCalledWith(pedidoHref('ord-legado'));
});

test('expõe a loja, aberta e o horário de abertura da cotação', async () => {
  setup({});
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.store).toMatchObject({ _id: 's1' });
  expect(result.current.storeOpen).toBe(true);
});
