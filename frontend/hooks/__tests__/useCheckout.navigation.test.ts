import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';
import { pedidoHref } from '../../lib/routes';

const push = jest.fn();
let mockPlan = 2;
let mockIsOpen = true;
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('../../lib/api');
const addr = { _id: 'a1', isDefault: true, cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', latitude: '-22.91', longitude: '-43.21' };
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: mockPlan, latitude: '-22.9', longitude: '-43.2', isOpen: mockIsOpen }], loading: false }),
  useAddresses: () => ({ addresses: [addr], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 10, storeId: 's1' }], clear: jest.fn() }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }) }));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

function setup(orderResponse: unknown, quoteOver: Record<string, unknown> = {}) {
  mockedApi.get.mockResolvedValue({ data: { balance: 1000 } } as unknown as AxiosResponse);
  mockedApi.post.mockImplementation(((url: string) => Promise.resolve({ data: url === '/orders/quote'
    ? { storeId: 's1', inArea: true, deliveryFee: 6, distanceKm: 1, etaMinutes: [20, 30], fee: 6, freeDelivery: false, open: true, source: 'route', ...quoteOver }
    : orderResponse })) as any);
}

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); mockPlan = 2; mockIsOpen = true; });

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

// Porte fiel do checkout-vitrine-navigation (loja Plano 1): {order, pix} e resposta legada.
const orderCalls = () => mockedApi.post.mock.calls.filter(([u]) => u === '/orders');

test('Plano 1: resposta do Asaas ({ order, pix }) expõe o Pix do pedido e closePix navega para ele', async () => {
  mockPlan = 1;
  setup({ order: { _id: 'ord-asaas', totalValue: 10, walletApplied: 0 }, pix: { paymentId: 'pay_1', qrCodePayload: 'abc' } });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.isPlan1).toBe(true);
  await act(async () => { await result.current.placeOrder(); });
  expect(result.current.pixData?.orderId).toBe('ord-asaas');
  expect(result.current.pixData?.amount).toBe(10);
  expect(orderCalls()[0][1]).toMatchObject({ deliveryDistanceKm: 0 });
  act(() => { result.current.closePix(); });
  expect(push).toHaveBeenCalledWith(pedidoHref('ord-asaas'));
});

test('Plano 1: resposta legada (o próprio pedido) continua navegando', async () => {
  mockPlan = 1;
  setup({ _id: 'ord-legado' });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  await act(async () => { await result.current.placeOrder(); });
  expect(push).toHaveBeenCalledWith(pedidoHref('ord-legado'));
});

test('valor do Pix = total do pedido no servidor menos o saldo usado', async () => {
  setup({ order: { _id: 'o2', totalValue: '100.00', walletApplied: '18.20' }, pix: { paymentId: 'p', qrCodePayload: 'x' } });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  await act(async () => { await result.current.placeOrder(); });
  expect(result.current.pixData?.amount).toBe(81.8);
});

test('loja fechada: a cotação traz open=false e o horário de abertura', async () => {
  setup({}, { open: false, opensAt: '09:00' });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.storeOpen).toBe(false);
  expect(result.current.opensAt).toBe('09:00');
});

test('Plano 1 sem cotação: vale Store.isOpen', async () => {
  mockPlan = 1; mockIsOpen = false;
  setup({});
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.storeOpen).toBe(false);
  expect(result.current.opensAt).toBeNull();
});

test('STORE_NO_LOCATION não é "fora da área": tem motivo próprio e continua sem poder pagar', async () => {
  setup({}, { inArea: false, reason: 'STORE_NO_LOCATION', deliveryFee: null, distanceKm: null, etaMinutes: null });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.outOfArea).toBe(false);
  expect(result.current.deliveryIssue).toBe('STORE_NO_LOCATION');
  expect(result.current.canPlace).toBe(false);
});

test('NO_ADDRESS vindo da cotação vira motivo próprio e bloqueia', async () => {
  setup({}, { inArea: null, reason: 'NO_ADDRESS', deliveryFee: null, distanceKm: null, etaMinutes: null });
  const { result } = renderHook(() => useCheckout({ redirectPlan1: false }));
  await act(async () => {}); await act(async () => {});
  expect(result.current.deliveryIssue).toBe('NO_ADDRESS');
  expect(result.current.canPlace).toBe(false);
});
