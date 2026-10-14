import { renderHook, waitFor, act } from '@testing-library/react';

const reconnects: Array<() => void> = [];
const mockSocket = {
  on: () => () => undefined,
  onReconnect: (cb: () => void) => {
    reconnects.push(cb);
    return () => {
      const i = reconnects.indexOf(cb);
      if (i >= 0) reconnects.splice(i, 1);
    };
  },
  isConnected: true,
};
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
const mockGet = jest.fn((_url: string): Promise<any> => Promise.resolve({ data: { deliveries: [{ _id: 'd1' }] } }));
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (url: string) => mockGet(url) } }));
// eslint-disable-next-line import/first
import { useDeliveries, useOngoingDeliveries } from '../useSync';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation(() => Promise.resolve({ data: { deliveries: [{ _id: 'd1' }] } }));
  reconnects.length = 0;
  mockSocket.isConnected = true;
});

test.each([
  ['useDeliveries', useDeliveries, '/deliveries/available'],
  ['useOngoingDeliveries', useOngoingDeliveries, '/deliveries/ongoing'],
])('%s relê pelo onReconnect, uma vez por reconexão', async (_n, hook, url) => {
  const { result, unmount } = renderHook(() => (hook as any)());
  await waitFor(() => expect(result.current.deliveries).toEqual([{ _id: 'd1' }]));
  const before = mockGet.mock.calls.filter(([u]) => u === url).length;
  expect(reconnects).toHaveLength(1);
  act(() => { reconnects[0](); });
  await waitFor(() => expect(mockGet.mock.calls.filter(([u]) => u === url).length).toBe(before + 1));
  unmount();
  expect(reconnects).toHaveLength(0);
});

test('isConnected mudando não dispara leitura', async () => {
  const { rerender } = renderHook(() => useDeliveries());
  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
  mockSocket.isConnected = false;
  rerender();
  mockSocket.isConnected = true;
  rerender();
  await new Promise((r) => setTimeout(r, 0));
  expect(mockGet).toHaveBeenCalledTimes(1);
});

test('re-render não dispara GET novo nem reinscreve o onReconnect', async () => {
  const { rerender, result } = renderHook(() => useOngoingDeliveries());
  await waitFor(() => expect(result.current.loading).toBe(false));
  rerender();
  rerender();
  await new Promise((r) => setTimeout(r, 0));
  expect(mockGet).toHaveBeenCalledTimes(1);
  expect(reconnects).toHaveLength(1);
});

describe('requiresVerification (K3)', () => {
  test('true só quando a resposta traz true', async () => {
    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { deliveries: [], requiresVerification: true } }),
    );
    const { result } = renderHook(() => useDeliveries());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requiresVerification).toBe(true);
    expect(result.current.deliveries).toEqual([]);
  });

  test('false quando a resposta não traz a flag', async () => {
    const { result } = renderHook(() => useDeliveries());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requiresVerification).toBe(false);
  });

  test('null enquanto não leu e null quando a leitura falha', async () => {
    mockGet.mockImplementation(() => Promise.reject(new Error('boom')));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useDeliveries());
    expect(result.current.requiresVerification).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.requiresVerification).toBeNull();
    spy.mockRestore();
  });

  test('volta a false depois que a flag some numa releitura', async () => {
    mockGet.mockImplementationOnce(() =>
      Promise.resolve({ data: { deliveries: [], requiresVerification: true } }),
    );
    const { result } = renderHook(() => useDeliveries());
    await waitFor(() => expect(result.current.requiresVerification).toBe(true));
    act(() => { reconnects[0](); });
    await waitFor(() => expect(result.current.requiresVerification).toBe(false));
  });
});
