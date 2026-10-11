/**
 * Lote final F6 — cotação com prazo de validade e mensagem certa quando a rota falha.
 *  - useStoreQuotes: o cache expira em 2 minutos (abre/fecha e taxa não ficam velhos).
 *  - useCheckout: ROUTE_FAILED ou erro de rede → quoteError + retryQuote(); o placeOrder usa a mensagem.
 *  - useCheckout: com saldo cobrindo o total (useWallet), o CPF não é pedido.
 */
import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';
import { __resetSaasConfigCache } from '../useSaasConfig';
import { useStoreQuotes, __resetStoreQuotesCache } from '../useStoreQuotes';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
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
  useCart: () => ({ cart: [{ productId: 'p1', quantity: 2, price: 50, storeId: 's1' }], add: jest.fn(), clear: jest.fn() }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

const ROUTE_MSG = 'Não conseguimos calcular a entrega agora.';
const baseQuote = {
  storeId: 's1', inArea: true, distanceKm: 4.4, etaMinutes: [25, 35], fee: 9.4,
  freeDelivery: false, open: true, source: 'route', deliveryFee: 9.4,
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  __resetSaasConfigCache();
  __resetStoreQuotesCache();
});

describe('useStoreQuotes — validade do cache', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('reaproveita até 2 min; depois cota de novo', async () => {
    mockedApi.post.mockImplementation(((_u: string, body: { storeIds: string[] }) =>
      Promise.resolve({ data: { success: true, data: body.storeIds.map((id) => ({ ...baseQuote, storeId: id })) } })) as any);
    const point = { lat: -22.91, lng: -43.21 };

    const first = renderHook(() => useStoreQuotes(['a'], point));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    first.unmount();

    await act(async () => { jest.advanceTimersByTime(100_000); });
    const second = renderHook(() => useStoreQuotes(['a'], point));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    expect(Object.keys(second.result.current.quotes)).toEqual(['a']);
    second.unmount();

    await act(async () => { jest.advanceTimersByTime(20_000); }); // 120,6 s desde a 1ª cotação
    const third = renderHook(() => useStoreQuotes(['a'], point));
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(mockedApi.post).toHaveBeenCalledTimes(2);
    expect(Object.keys(third.result.current.quotes)).toEqual(['a']);
  });
});

async function mountCheckout() {
  const hook = renderHook(() => useCheckout());
  await act(async () => {});
  act(() => { hook.result.current.address.selectAddress(0); });
  await act(async () => {});
  return hook;
}

const quoteCalls = () => mockedApi.post.mock.calls.filter((c) => c[0] === '/orders/quote');
const orderCalls = () => mockedApi.post.mock.calls.filter((c) => c[0] === '/orders');

describe('useCheckout — falha na cotação', () => {
  function mockQuoteSequence(results: Array<() => Promise<unknown>>) {
    mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
    let i = 0;
    mockedApi.post.mockImplementation(((url: string) => {
      if (url === '/orders/quote') return results[Math.min(i++, results.length - 1)]();
      return Promise.resolve({ data: {} });
    }) as any);
  }

  test('ROUTE_FAILED: quoteError, placeOrder usa a mensagem, retryQuote cota de novo', async () => {
    mockQuoteSequence([
      () => Promise.resolve({ data: { ...baseQuote, inArea: null, reason: 'ROUTE_FAILED', fee: null, deliveryFee: null } }),
      () => Promise.resolve({ data: baseQuote }),
    ]);
    const { result } = await mountCheckout();
    expect(result.current.quoteError).toBe(ROUTE_MSG);
    expect(result.current.canPlace).toBe(false);

    let r: { ok: boolean; error?: string } = { ok: true };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r).toEqual({ ok: false, error: ROUTE_MSG });
    expect(orderCalls()).toHaveLength(0);

    await act(async () => { result.current.retryQuote(); });
    await act(async () => {});
    expect(quoteCalls()).toHaveLength(2);
    expect(result.current.quoteError).toBeNull();
    expect(result.current.canPlace).toBe(true);
  });

  test('erro de rede na cotação: mesma mensagem e retry', async () => {
    mockQuoteSequence([
      () => Promise.reject(new Error('Network Error')),
      () => Promise.resolve({ data: baseQuote }),
    ]);
    const { result } = await mountCheckout();
    expect(result.current.quoteError).toBe(ROUTE_MSG);
    let r: { ok: boolean; error?: string } = { ok: true };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r).toEqual({ ok: false, error: ROUTE_MSG });

    await act(async () => { result.current.retryQuote(); });
    await act(async () => {});
    expect(quoteCalls()).toHaveLength(2);
    expect(result.current.quoteError).toBeNull();
  });

  test('cotação ok: sem quoteError', async () => {
    mockQuoteSequence([() => Promise.resolve({ data: baseQuote })]);
    const { result } = await mountCheckout();
    expect(result.current.quoteError).toBeNull();
  });
});

describe('useCheckout — CPF com saldo cobrindo o total', () => {
  function mockWallet(balance: number) {
    mockedApi.get.mockImplementation(((url: string) => {
      if (url === '/user/me') return Promise.resolve({ data: { cpf: '', telefone: '', cpfStatus: 'missing' } });
      return Promise.resolve({ data: { balance } });
    }) as any);
    mockedApi.post.mockImplementation(((url: string) => {
      if (url === '/orders/quote') return Promise.resolve({ data: baseQuote });
      if (url === '/orders') return Promise.resolve({ data: { order: { _id: 'o1' } } });
      return Promise.resolve({ data: {} });
    }) as any);
  }

  test('useWallet e saldo >= total: não pede CPF e envia sem cpf', async () => {
    mockWallet(200);
    const { result } = await mountCheckout();
    expect(result.current.cpfRequired).toBe(true); // sem usar o saldo, o Pix exige CPF
    act(() => { result.current.setUseWallet(true); });
    expect(result.current.cpfRequired).toBe(false);

    let r: { ok: boolean; error?: string } = { ok: false };
    await act(async () => { r = await result.current.placeOrder(); });
    expect(r.ok).toBe(true);
    const body = orderCalls()[0][1] as Record<string, unknown>;
    expect(body.cpf).toBeUndefined();
    expect(body.useWalletBalance).toBe(true);
  });

  test('useWallet com saldo menor que o total: continua pedindo CPF', async () => {
    mockWallet(50);
    const { result } = await mountCheckout();
    act(() => { result.current.setUseWallet(true); });
    expect(result.current.cpfRequired).toBe(true);
  });
});
