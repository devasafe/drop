// frontend/hooks/__tests__/useMotoboyMoney.test.tsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMotoboyMoney, MONEY_MAX_PAGES } from '../useMotoboyMoney';
import { moneyFor } from '../../lib/motoboyMoney';
import api from '../../lib/api';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
let mockSaas: any;
jest.mock('../useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockLeftover: any;
jest.mock('../useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));
let reconnectCbs: Array<() => void> = [];
const mockSocket = {
  isConnected: true,
  on: jest.fn(() => () => {}),
  onReconnect: jest.fn((cb: () => void) => { reconnectCbs.push(cb); return () => { reconnectCbs = reconnectCbs.filter((c) => c !== cb); }; }),
};
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));

const get = api.get as jest.Mock;
const urls = () => get.mock.calls.map((c) => String(c[0]));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  get.mockReset();
  reconnectCbs = [];
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockLeftover = { hasLeftover: false, loading: false };
  get.mockImplementation((u: string) => {
    if (u === '/payouts/my') return Promise.resolve({ data: { payouts: [{ _id: 'p1', deliveryId: 'd1', orderId: 'o1', amount: 9.6, status: 'pending' }], total: 1 } });
    if (u === '/motoboy/transfers') return Promise.resolve({ data: { success: true, data: [{ id: 't1', orderId: 'o2', amount: 12, status: 'done' }], nextCursor: null } });
    return Promise.reject(new Error('n/a'));
  });
});

test('custódia: lê só os repasses (limit 200)', async () => {
  const { result } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(get).toHaveBeenCalledWith('/payouts/my', { params: { limit: 200 } });
  expect(urls()).not.toContain('/motoboy/transfers');
  expect(moneyFor(result.current.index, { _id: 'd1' })!.amount).toBe(9.6);
  expect(result.current.coveredFrom).toBeNull();
  expect(result.current.moneyOf({ _id: 'd1' })!.amount).toBe(9.6);
});

test('direto sem saldo antigo: só os Pix das lojas, nada da custódia', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  const { result } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(urls()).toEqual(['/motoboy/transfers']);
  expect(moneyFor(result.current.index, { _id: 'x', orderId: 'o2' })!.status).toBe('done');
});

test('direto com saldo antigo: Pix e repasses', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockLeftover = { hasLeftover: true, loading: false };
  const { result } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(urls().sort()).toEqual(['/motoboy/transfers', '/payouts/my']);
});

test('modo com erro: error, nenhuma leitura; reload pede o modo de novo', async () => {
  mockSaas = { ...mockSaas, error: true };
  const { result } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(get).not.toHaveBeenCalled();
  act(() => result.current.reload());
  expect(mockSaas.retry).toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});

test('modo com erro e settlementMode no padrão custódia: nunca lê os repasses', async () => {
  mockSaas = { settlementMode: 'custodia', loading: false, error: true, retry: jest.fn() };
  const { result } = renderHook(() => useMotoboyMoney());
  await flush();
  expect(result.current.status).toBe('error');
  expect(result.current.moneyOf({ _id: 'd1' })).toBeNull();
  expect(get).not.toHaveBeenCalled();
});

test('modo carregando ou saldo antigo em voo: loading, sem leitura', () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockLeftover = { hasLeftover: false, loading: true };
  const { result } = renderHook(() => useMotoboyMoney());
  expect(result.current.status).toBe('loading');
  expect(get).not.toHaveBeenCalled();
});

test('falha na leitura: error e índice vazio (sem badge presumido)', async () => {
  get.mockRejectedValue(new Error('rede'));
  const { result } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(moneyFor(result.current.index, { _id: 'd1' })).toBeNull();
});

test('reload tem identidade estável', () => {
  const { result, rerender } = renderHook(() => useMotoboyMoney());
  const first = result.current.reload;
  rerender();
  expect(result.current.reload).toBe(first);
});

test('re-render não refaz o GET (sem laço)', async () => {
  const { result, rerender } = renderHook(() => useMotoboyMoney({ since: ago(DAY) }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  rerender();
  rerender();
  await flush();
  expect(get).toHaveBeenCalledTimes(1);
});

test('saque dividido: pedaço novo na 1ª página, original na 2ª → soma só depois de carregar a 2ª', async () => {
  const since = ago(3 * DAY);
  let releasePage2!: () => void;
  const page2 = new Promise<void>((r) => { releasePage2 = r; });
  get.mockImplementation((u: string, cfg: any) => {
    if (u !== '/payouts/my') return Promise.reject(new Error('n/a'));
    const page = cfg?.params?.page ?? 1;
    if (page === 1) {
      return Promise.resolve({ data: { total: 600, payouts: [{ _id: 'split', deliveryId: 'd1', orderId: 'o1', amount: 3, status: 'requested', createdAt: ago(HOUR) }] } });
    }
    if (page === 2) {
      return page2.then(() => ({ data: { total: 600, payouts: [
        { _id: 'p2', deliveryId: 'd2', orderId: 'o2', amount: 5, status: 'pending', createdAt: ago(DAY) },
        { _id: 'orig', deliveryId: 'd1', orderId: 'o1', amount: 6.6, status: 'released', createdAt: ago(2 * DAY) },
      ] } }));
    }
    return Promise.resolve({ data: { total: 600, payouts: [{ _id: 'old', deliveryId: 'd9', orderId: 'o9', amount: 7, status: 'paid', createdAt: ago(5 * DAY) }] } });
  });
  const { result } = renderHook(() => useMotoboyMoney({ since }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  // 2ª página em voo: nada de número (nunca o pedaço de R$ 3,00 como se fosse a corrida)
  expect(result.current.status).toBe('loading');
  expect(result.current.moneyOf({ _id: 'd1', deliveredAt: ago(2 * DAY) })).toBeNull();
  await act(async () => { releasePage2(); });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(get).toHaveBeenNthCalledWith(2, '/payouts/my', { params: { limit: 200, page: 2 } });
  expect(get).toHaveBeenNthCalledWith(3, '/payouts/my', { params: { limit: 200, page: 3 } });
  expect(get).toHaveBeenCalledTimes(3); // a 3ª já passou da janela: para
  expect(result.current.moneyOf({ _id: 'd1', deliveredAt: ago(2 * DAY) })!.amount).toBe(9.6);
  expect(moneyFor(result.current.index, { _id: 'd1' })!.amount).toBe(9.6);
});

test('teto de páginas sem cobrir a janela: corridas fora da cobertura sem número, sem laço', async () => {
  let n = 0;
  get.mockImplementation((u: string) => {
    if (u !== '/payouts/my') return Promise.reject(new Error('n/a'));
    n += 1;
    // uma hora por página e sempre há mais: 10 páginas nunca cobrem a janela de 30 dias
    return Promise.resolve({ data: { total: 99999, payouts: [{ _id: `p${n}`, deliveryId: `d${n}`, orderId: `o${n}`, amount: 1, status: 'pending', createdAt: ago(n * HOUR) }] } });
  });
  const { result } = renderHook(() => useMotoboyMoney({ since: ago(30 * DAY) }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  await flush();
  expect(get).toHaveBeenCalledTimes(MONEY_MAX_PAGES);
  expect(MONEY_MAX_PAGES).toBe(10);
  expect(result.current.coveredFrom).not.toBeNull();
  // corrida antiga (fora do que foi lido) fica sem número
  expect(result.current.moneyOf({ _id: 'd1', deliveredAt: ago(10 * DAY) })).toBeNull();
  // corrida recente, depois da fronteira lida, mantém o número
  expect(result.current.moneyOf({ _id: 'd1', deliveredAt: ago(30 * 1000) })!.amount).toBe(1);
  // sem data: não dá para saber se está coberta → sem número
  expect(result.current.moneyOf({ _id: 'd1' })).toBeNull();
});

test('direto: Pix por cursor até cobrir a janela', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  get.mockImplementation((u: string, cfg: any) => {
    if (u !== '/motoboy/transfers') return Promise.reject(new Error('n/a'));
    if (!cfg?.params?.cursor) {
      return Promise.resolve({ data: { success: true, data: [{ id: 't1', orderId: 'o1', amount: 10, status: 'done', createdAt: ago(HOUR) }], nextCursor: 'c1' } });
    }
    return Promise.resolve({ data: { success: true, data: [{ id: 't2', orderId: 'o2', amount: 8, status: 'pending', createdAt: ago(4 * DAY) }], nextCursor: 'c2' } });
  });
  const { result } = renderHook(() => useMotoboyMoney({ since: ago(2 * DAY) }));
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(get.mock.calls).toEqual([
    ['/motoboy/transfers', { params: { limit: 200 } }],
    ['/motoboy/transfers', { params: { limit: 200, cursor: 'c1' } }],
  ]);
  expect(result.current.moneyOf({ _id: 'x', orderId: 'o2', deliveredAt: ago(DAY) })!.amount).toBe(8);
});

test('reconexão do socket relê; desmontar cancela a inscrição', async () => {
  const { result, unmount } = renderHook(() => useMotoboyMoney());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(get).toHaveBeenCalledTimes(1);
  expect(reconnectCbs).toHaveLength(1);
  await act(async () => { reconnectCbs[0](); });
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  unmount();
  expect(reconnectCbs).toHaveLength(0);
});
