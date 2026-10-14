import { renderHook, waitFor, act } from '@testing-library/react';
import api from '../../../../lib/api';

let reconnectCb: (() => void) | null = null;
let handlers: Record<string, (d: any) => void> = {};
const mockSocket = {
  on: (ev: string, fn: any) => { handlers[ev] = fn; return () => undefined; },
  onReconnect: (cb: any) => { reconnectCb = cb; return () => undefined; },
};
jest.mock('../../../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import { useCorridasSummary } from '../useCorridasSummary';
const get = api.get as jest.Mock;
const OK = { data: { today: { earnings: 1, count: 1 }, week: { earnings: 2, count: 2 } } };

beforeEach(() => { jest.resetAllMocks(); reconnectCb = null; handlers = {}; });

test('lê o resumo do servidor', async () => {
  get.mockResolvedValue({ data: { today: { earnings: 86.4, count: 9 }, week: { earnings: 412.8, count: 43 } } });
  const { result } = renderHook(() => useCorridasSummary());
  await waitFor(() => expect(result.current.summary).toEqual({ today: { earnings: 86.4, count: 9 }, week: { earnings: 412.8, count: 43 } }));
  expect(result.current.error).toBe(false);
  expect(get).toHaveBeenCalledWith('/deliveries/summary');
  expect(get).toHaveBeenCalledTimes(1);
});

test('erro não vira zero: summary null e error true; retry relê', async () => {
  get.mockRejectedValueOnce(new Error('x')).mockResolvedValue(OK);
  const { result } = renderHook(() => useCorridasSummary());
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.summary).toBeNull();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.summary?.week.count).toBe(2));
  expect(result.current.error).toBe(false);
});

test('corpo malformado conta como erro e não vira zero', async () => {
  get.mockResolvedValue({ data: { today: { earnings: 'x' } } });
  const { result } = renderHook(() => useCorridasSummary());
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.summary).toBeNull();
});

test('relê na reconexão e quando uma entrega é concluída', async () => {
  get.mockResolvedValue(OK);
  renderHook(() => useCorridasSummary());
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(reconnectCb).not.toBeNull();
  act(() => reconnectCb?.());
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  act(() => handlers['delivery:completed']({ deliveryId: 'd1' }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
});

test('falha depois de sucesso derruba o resumo (não mantém número velho como se fosse atual)', async () => {
  get.mockResolvedValueOnce(OK).mockRejectedValueOnce(new Error('x'));
  const { result } = renderHook(() => useCorridasSummary());
  await waitFor(() => expect(result.current.summary).not.toBeNull());
  act(() => reconnectCb?.());
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.summary).toBeNull();
});
