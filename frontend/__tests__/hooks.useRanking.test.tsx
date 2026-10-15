import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../lib/api';

const mockSocket = { on: () => () => {}, onReconnect: () => () => {} };
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import { useRanking } from '../hooks/useSync';
const get = api.get as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('falha liga error; reload refaz o GET, limpa o erro e traz os dados', async () => {
  get.mockRejectedValueOnce(new Error('rede'));
  get.mockResolvedValueOnce({ data: [{ user_id: 'a', name: 'Ana', pontosMes: 5 }] });
  const { result } = renderHook(() => useRanking());

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe(true);
  expect(result.current.ranking).toEqual([]);

  act(() => { result.current.reload(); });
  await waitFor(() => expect(result.current.ranking).toHaveLength(1));
  expect(result.current.error).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenCalledWith('/gamification/ranking-mensal');
});
