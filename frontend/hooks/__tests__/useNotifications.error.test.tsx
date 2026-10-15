import { renderHook, waitFor, act } from '@testing-library/react';

const mockGet = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (u: string) => mockGet(u) } }));
const mockSocket = { on: () => () => undefined, onReconnect: () => () => undefined };
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
import { useNotifications } from '../useSync';

beforeEach(() => {
  mockGet.mockReset();
  localStorage.setItem('user', '{}');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

test('falha na leitura expõe error; reload lê de novo e limpa', async () => {
  mockGet.mockRejectedValueOnce(new Error('rede'));
  const { result } = renderHook(() => useNotifications());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe(true);
  mockGet.mockResolvedValueOnce({ data: [{ _id: 'a', read: false }] });
  await act(async () => { await result.current.reload(); });
  expect(result.current.error).toBe(false);
  expect(result.current.notifications).toHaveLength(1);
});
