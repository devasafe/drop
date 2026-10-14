/**
 * V16 fix 1 · depois de uma queda do socket, quem pode ter perdido eventos relê UMA vez:
 * painel da loja (/stores/dashboard), notificações, badges, pedido aberto e entrega aberta.
 * - 1ª conexão não relê;
 * - disconnect + connect relê 1× cada fonte (notificações e badges: 1 leitura para todas as instâncias);
 * - socket oscilando: no máximo 1 releitura a cada 30 s (a imediata + uma agendada);
 * - desmontar cancela a agendada.
 */
import { act, render } from '@testing-library/react';

type Handler = (...args: any[]) => void;
const makeFakeSocket = () => {
  const handlers = new Map<string, Set<Handler>>();
  return {
    connected: false,
    on(event: string, h: Handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(h);
      return this;
    },
    off(event: string, h: Handler) {
      handlers.get(event)?.delete(h);
      return this;
    },
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    fire(event: string, ...args: any[]) {
      Array.from(handlers.get(event) || []).forEach((h) => h(...args));
    },
  };
};

let mockSocket: ReturnType<typeof makeFakeSocket> | null = null;
jest.mock('../lib/socket', () => ({
  connectSocket: () => {
    if (!mockSocket) mockSocket = makeFakeSocket();
    return mockSocket;
  },
  disconnectSocket: jest.fn(),
  getSocket: () => mockSocket,
}));

const mockGet = jest.fn((url: string) => {
  if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' }, orders: [], products: [] } });
  if (url === '/notifications') return Promise.resolve({ data: [] });
  if (url === '/badges') return Promise.resolve({ data: { verifications: 0, storeOrders: 0, deliveries: 0 } });
  return Promise.resolve({ data: { _id: url.split('/').pop() } });
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (url: string) => mockGet(url), post: jest.fn() } }));

// eslint-disable-next-line import/first
import AuthContext from '../contexts/AuthContext';
// eslint-disable-next-line import/first
import { SocketProvider } from '../contexts/SocketContext';
// eslint-disable-next-line import/first
import { useBadgeCounts, useNotifications, useOrder, useDelivery, resetBadgeCountsCache } from '../hooks/useSync';
// eslint-disable-next-line import/first
import { SellerPanelProvider } from '../components/seller/panel/SellerPanelProvider';

const SOURCES = ['/stores/dashboard', '/notifications', '/badges', '/orders/o1', '/deliveries/d1'];
const calls = () =>
  Object.fromEntries(SOURCES.map((u) => [u, mockGet.mock.calls.filter(([x]) => x === u).length]));
const plus = (base: Record<string, number>, n: number) => Object.fromEntries(SOURCES.map((u) => [u, base[u] + n]));

const Badge = () => { useBadgeCounts(); return null; };
const Bell = () => { useNotifications(); return null; };
const Order = () => { useOrder('o1'); return null; };
const Delivery = () => { useDelivery('d1'); return null; };

const user = { _id: 'u1', role: 'lojista', activeRole: 'lojista' };
const Tree = () => (
  <AuthContext.Provider value={{ user, loading: false } as any}>
    <SocketProvider enabled>
      <SellerPanelProvider>
        <Badge />
        <Badge />
        <Badge />
        <Bell />
        <Bell />
        <Order />
        <Delivery />
      </SellerPanelProvider>
    </SocketProvider>
  </AuthContext.Provider>
);

const flush = () => act(async () => {});
const connect = () => act(() => { mockSocket!.connected = true; mockSocket!.fire('connect'); });
const disconnect = () => act(() => { mockSocket!.connected = false; mockSocket!.fire('disconnect', 'transport close'); });
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  mockSocket = null;
  resetBadgeCountsCache();
  mockGet.mockClear();
  localStorage.setItem('user', JSON.stringify(user));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  localStorage.clear();
  jest.restoreAllMocks();
});

const mountConnected = async () => {
  const r = render(<Tree />);
  await flush();
  connect(); // 1ª conexão
  await flush();
  return r;
};

describe('releitura por reconexão (V16 fix 1)', () => {
  it('a 1ª conexão não relê nada; cada fonte leu 1 vez na montagem', async () => {
    await mountConnected();
    await advance(60_000);
    expect(calls()).toEqual({ '/stores/dashboard': 1, '/notifications': 1, '/badges': 1, '/orders/o1': 1, '/deliveries/d1': 1 });
  });

  it('disconnect + connect relê 1 vez cada fonte', async () => {
    await mountConnected();
    const base = calls();
    disconnect();
    connect();
    await flush();
    expect(calls()).toEqual(plus(base, 1));
    await advance(60_000);
    expect(calls()).toEqual(plus(base, 1));
  });

  it('5 reconexões em 10 s: a releitura imediata + uma agendada para os 30 s', async () => {
    await mountConnected();
    const base = calls();
    for (let i = 0; i < 5; i++) {
      disconnect();
      connect();
      await flush();
      await advance(2_000);
    }
    expect(calls()).toEqual(plus(base, 1));
    await advance(20_000); // completa os 30 s desde a 1ª releitura
    expect(calls()).toEqual(plus(base, 2));
    await advance(120_000);
    expect(calls()).toEqual(plus(base, 2));
  });

  it('desmontar cancela a releitura agendada', async () => {
    const { unmount } = await mountConnected();
    disconnect();
    connect();
    await flush();
    disconnect();
    connect();
    await flush();
    const before = calls();
    unmount();
    await advance(60_000);
    expect(calls()).toEqual(before);
  });
});
