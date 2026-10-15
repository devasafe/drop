/**
 * D2 · P4.11 fix 1 — useCustodyLeftoverState expõe a falha (K29: o saldo do modo anterior nunca
 * some calado) e `retry` relê sem guardar a falha no cache. O valor de sucesso continua em cache.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import api from '../../lib/api';
import { useCustodyLeftoverState, __resetCustodyLeftoverCache } from '../useCustodyLeftoverState';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'm1', id: 'm1' } }) }));
jest.mock('../useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', loading: false, error: false }) }));

const get = api.get as jest.Mock;
const leftoverCalls = () => get.mock.calls.filter(([u]) => u === '/settings/custody-leftover').length;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCustodyLeftoverCache();
});

test('leitura com erro: error=true, hasLeftover=false, sem loading', async () => {
  get.mockRejectedValue(new Error('rede'));
  const { result } = renderHook(() => useCustodyLeftoverState());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe(true);
  expect(result.current.hasLeftover).toBe(false);
});

test('retry relê (a falha não fica em cache) e o sucesso limpa o erro', async () => {
  get.mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ data: { hasLeftover: true } });
  const { result } = renderHook(() => useCustodyLeftoverState());
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(leftoverCalls()).toBe(1);
  act(() => { result.current.retry(); });
  await waitFor(() => expect(result.current.hasLeftover).toBe(true));
  expect(result.current.error).toBe(false);
  expect(leftoverCalls()).toBe(2);
  // nova montagem com o mesmo usuário: o sucesso está em cache, sem nova leitura
  const again = renderHook(() => useCustodyLeftoverState());
  expect(again.result.current.hasLeftover).toBe(true);
  expect(again.result.current.error).toBe(false);
  expect(leftoverCalls()).toBe(2);
});

test('falha seguida de nova montagem: relê (falha nunca é cacheada)', async () => {
  get.mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ data: { hasLeftover: false } });
  const first = renderHook(() => useCustodyLeftoverState());
  await waitFor(() => expect(first.result.current.error).toBe(true));
  first.unmount();
  const second = renderHook(() => useCustodyLeftoverState());
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.error).toBe(false);
  expect(leftoverCalls()).toBe(2);
});
