/**
 * V16 · avalanche de 429: `on`/`emit` do SocketContext não podem mudar a cada conexão/queda do
 * socket. Antes, cada connect/disconnect refazia os GETs de quem se inscreve por `on`
 * (useBadgeCounts ×3 + useNotifications na moldura do painel) → ~88 pedidos/min com o socket instável.
 */
import { act, render, screen, waitFor } from '@testing-library/react';

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
    /** dispara um evento "vindo do servidor" para os listeners locais */
    fire(event: string, ...args: any[]) {
      handlers.get(event)?.forEach((h) => h(...args));
    },
    count(event: string) {
      return handlers.get(event)?.size ?? 0;
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

const mockGet = jest.fn((_url: string) => Promise.resolve({ data: {} }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (url: string) => mockGet(url) } }));

// eslint-disable-next-line import/first
import { SocketProvider, useSocket } from '../contexts/SocketContext';
// eslint-disable-next-line import/first
import { useBadgeCounts, useNotifications, resetBadgeCountsCache } from '../hooks/useSync';

const calls = (url: string) => mockGet.mock.calls.filter(([u]) => u === url).length;

const Badge = () => {
  useBadgeCounts();
  return null;
};
const Bell = () => {
  const { unreadCount } = useNotifications();
  return <p data-testid="unread">{unreadCount}</p>;
};
const Probe = () => (
  <>
    <Badge />
    <Badge />
    <Badge />
    <Bell />
  </>
);

const flapSocket = (times: number) => {
  for (let i = 0; i < times; i++) {
    act(() => {
      mockSocket!.connected = true;
      mockSocket!.fire('connect');
    });
    act(() => {
      mockSocket!.connected = false;
      mockSocket!.fire('disconnect', 'transport close');
    });
  }
  act(() => {
    mockSocket!.connected = true;
    mockSocket!.fire('connect');
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockSocket = null;
  resetBadgeCountsCache();
  mockGet.mockClear();
  localStorage.setItem('user', JSON.stringify({ _id: 'u1', role: 'lojista' }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('SocketContext · on estável entre conexões (V16)', () => {
  it('quedas e voltas do socket não refazem /badges nem /notifications por troca de `on`', async () => {
    render(
      <SocketProvider enabled>
        <Probe />
      </SocketProvider>,
    );
    await act(async () => {});
    flapSocket(2); // connect, disconnect, connect, disconnect, connect
    await act(async () => {});

    // montagem: 1 (as 3 instâncias de useBadgeCounts dividem a leitura) + 1 releitura pela 1ª volta
    // do socket (fix 1). A 2ª volta, < 30 s depois, só agenda (socketReconnectRefresh.v16 cobre o resto).
    expect(calls('/badges')).toBe(2);
    expect(calls('/notifications')).toBe(2);
  });

  it('quem se inscreveu antes de o socket existir recebe os eventos depois da conexão', async () => {
    render(
      <SocketProvider enabled>
        <Bell />
      </SocketProvider>,
    );
    await act(async () => {});
    flapSocket(1);

    act(() => {
      mockSocket!.fire('notification:received', { _id: 'n1', read: false });
    });
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('1'));
    // um único listener (sem duplicar a cada reconexão)
    expect(mockSocket!.count('notification:received')).toBe(1);
  });

  it('emit envia só com o socket conectado, sem depender de re-render', async () => {
    let emitRef: ((e: string, ...a: any[]) => void) | null = null;
    const Emitter = () => {
      emitRef = useSocket().emit;
      return null;
    };
    render(
      <SocketProvider enabled>
        <Emitter />
      </SocketProvider>,
    );
    await act(async () => {});
    const first = emitRef!;
    first('ping');
    expect(mockSocket!.emit).not.toHaveBeenCalled();
    flapSocket(1);
    expect(emitRef).toBe(first);
    first('ping', 1);
    expect(mockSocket!.emit).toHaveBeenCalledWith('ping', 1);
  });
});
