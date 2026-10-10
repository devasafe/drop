import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';
import { __resetSaasConfigCache } from '../useSaasConfig';
import { useStoreQuotes, __resetStoreQuotesCache } from '../useStoreQuotes';

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace }) }));
jest.mock('../../lib/api');

let mockStorePlan = 2;
const savedAddress = {
  _id: 'a1', cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro',
  city: 'Rio de Janeiro', state: 'RJ', latitude: '-22.91', longitude: '-43.21',
};
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: mockStorePlan, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => ({ addresses: [savedAddress], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ cart: [{ productId: 'p1', quantity: 2, price: 50, storeId: 's1' }], add: jest.fn(), clear: jest.fn() }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

const baseQuote = {
  storeId: 's1', inArea: true, distanceKm: 4.4, etaMinutes: [25, 35], fee: 9.4,
  freeDelivery: false, open: true, source: 'route', deliveryFee: 9.4,
};

function mockQuote(quote: Record<string, unknown>, orders?: () => Promise<unknown>) {
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') return Promise.resolve({ data: quote });
    if (url === '/orders' && orders) return orders();
    return Promise.resolve({ data: {} });
  }) as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  __resetSaasConfigCache();
  __resetStoreQuotesCache();
  mockStorePlan = 2;
});

describe('useStoreQuotes', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const quotesFor = (ids: string[]) => ({
    data: { success: true, data: ids.map(id => ({ ...baseQuote, storeId: id })) },
  });

  test('agrupa N lojas numa chamada, com debounce de 300 ms', async () => {
    mockedApi.post.mockImplementation(((_u: string, body: { storeIds: string[] }) => Promise.resolve(quotesFor(body.storeIds))) as any);
    const point = { lat: -22.91, lng: -43.21 };
    const { result } = renderHook(() => useStoreQuotes(['a', 'b', 'c'], point));
    expect(mockedApi.post).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(299); });
    expect(mockedApi.post).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    expect(mockedApi.post).toHaveBeenCalledWith('/stores/quotes', { latitude: -22.91, longitude: -43.21, storeIds: ['a', 'b', 'c'] });
    expect(Object.keys(result.current.quotes).sort()).toEqual(['a', 'b', 'c']);
    expect(result.current.loading).toBe(false);
  });

  test('não repete a chamada com o mesmo ponto (arredondado a 4 casas)', async () => {
    mockedApi.post.mockImplementation(((_u: string, body: { storeIds: string[] }) => Promise.resolve(quotesFor(body.storeIds))) as any);
    const first = renderHook(() => useStoreQuotes(['a', 'b'], { lat: -22.91, lng: -43.21 }));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useStoreQuotes(['a', 'b'], { lat: -22.910001, lng: -43.210002 }));
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    expect(Object.keys(second.result.current.quotes).sort()).toEqual(['a', 'b']);
  });

  test('sem ponto não chama e devolve {}', async () => {
    const { result } = renderHook(() => useStoreQuotes(['a'], null));
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(mockedApi.post).not.toHaveBeenCalled();
    expect(result.current.quotes).toEqual({});
  });
});

describe('useCheckout com a cotação do servidor', () => {
  test('mostra a taxa do servidor (9.4), não a recalculada no cliente', async () => {
    mockQuote(baseQuote);
    const { result } = renderHook(() => useCheckout());
    await act(async () => {});
    act(() => { result.current.address.selectAddress(0); });
    await act(async () => {});
    expect(result.current.deliveryFee).toBe(9.4);
    expect(result.current.total).toBeCloseTo(109.4);
    expect(result.current.etaMinutes).toEqual([25, 35]);
    expect(result.current.outOfArea).toBe(false);
    expect(result.current.canPlace).toBe(true);
  });

  test('fora da área: outOfArea true e canPlace false', async () => {
    mockQuote({ ...baseQuote, inArea: false, reason: 'OUT_OF_AREA', fee: null, deliveryFee: null, etaMinutes: null });
    const { result } = renderHook(() => useCheckout());
    await act(async () => {});
    act(() => { result.current.address.selectAddress(0); });
    await act(async () => {});
    expect(result.current.outOfArea).toBe(true);
    expect(result.current.canPlace).toBe(false);
    expect(result.current.deliveryFee).toBe(0);
    let r: { ok: boolean; error?: string } = { ok: true };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r).toEqual({ ok: false, error: 'Esta loja não entrega nesse endereço.' });
    expect(mockedApi.post.mock.calls.some(c => c[0] === '/orders')).toBe(false);
  });

  test('rota falhou (inArea null, ROUTE_FAILED): bloqueia sem marcar fora da área', async () => {
    mockQuote({ ...baseQuote, inArea: null, reason: 'ROUTE_FAILED', fee: null, deliveryFee: null });
    const { result } = renderHook(() => useCheckout());
    await act(async () => {});
    act(() => { result.current.address.selectAddress(0); });
    await act(async () => {});
    expect(result.current.canPlace).toBe(false);
    expect(result.current.outOfArea).toBe(false);
  });

  test('POST /orders recusa com 409 OUT_OF_AREA: mostra a mensagem do servidor e destrava a tela', async () => {
    mockQuote(baseQuote, () => Promise.reject({
      response: { status: 409, data: { error: 'Esta loja não entrega nesse endereço.', code: 'OUT_OF_AREA' } },
    }));
    const { result } = renderHook(() => useCheckout());
    await act(async () => {});
    act(() => { result.current.address.selectAddress(0); });
    await act(async () => {});
    let r: { ok: boolean; error?: string } = { ok: true };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r).toEqual({ ok: false, error: 'Esta loja não entrega nesse endereço.' });
    expect(result.current.placing).toBe(false);
    expect(result.current.pixData).toBeNull();
  });

  test('Plano 1 na custódia (sem cotação): 400 NO_ADDRESS mostra a mensagem do servidor e não quebra a tela', async () => {
    mockStorePlan = 1;
    mockedApi.get.mockImplementation(((url: string) =>
      Promise.resolve({ data: url === '/settings/saas' ? { settlementMode: 'custodia', directCardEnabled: false } : { balance: 0 } } as unknown as AxiosResponse)) as any);
    mockedApi.post.mockImplementation(((url: string) => {
      if (url === '/orders') return Promise.reject({ response: { status: 400, data: { error: 'Informe o endereço de entrega.', code: 'NO_ADDRESS' } } });
      return Promise.resolve({ data: {} });
    }) as any);
    const { result } = renderHook(() => useCheckout());
    await act(async () => {});
    await act(async () => {});
    act(() => { result.current.address.selectAddress(0); });
    await act(async () => {});
    expect(result.current.isPlan1).toBe(true);
    expect(mockedApi.post.mock.calls.some(c => c[0] === '/orders/quote')).toBe(false);
    let r: { ok: boolean; error?: string } = { ok: true };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r).toEqual({ ok: false, error: 'Informe o endereço de entrega.' });
    expect(result.current.placing).toBe(false);
    expect(result.current.deliveryFee).toBe(0);
  });
});
