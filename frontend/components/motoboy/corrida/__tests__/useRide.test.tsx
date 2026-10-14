import { renderHook, waitFor, act } from '@testing-library/react';
import api from '../../../../lib/api';

// K19: o socket do mock é um objeto FIXO do módulo (o `on` real é estável). Funções novas a cada
// render fariam o efeito do hook rodar em laço.
const mockHandlers: Record<string, (d: any) => void> = {};
let mockReconnectCb: (() => void) | null = null;
const mockSocket = {
  on: (ev: string, fn: any) => { mockHandlers[ev] = fn; return () => { if (mockHandlers[ev] === fn) delete mockHandlers[ev]; }; },
  onReconnect: (cb: any) => { mockReconnectCb = cb; return () => { if (mockReconnectCb === cb) mockReconnectCb = null; }; },
  emit: jest.fn(),
  isConnected: true,
  isReconnecting: false,
};
jest.mock('../../../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
import { useRide } from '../useRide';
const get = api.get as jest.Mock;

const assigned = { _id: 'd1', orderId: 'o1', status: 'assigned', pinRetirada: '48213' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  get.mockReset();
  mockReconnectCb = null;
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
});

test('lê a corrida', async () => {
  get.mockResolvedValue({ data: assigned });
  const { result } = renderHook(() => useRide('d1'));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
  expect(get).toHaveBeenCalledWith('/deliveries/d1');
  expect(get).toHaveBeenCalledTimes(1);
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeNull();
});

test('loja validou: muda para picked na hora, mesmo se o GET de releitura ainda vier atrasado', async () => {
  get.mockResolvedValue({ data: assigned });
  const { result } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
  act(() => mockHandlers['delivery:pin_validated']({ deliveryId: 'd1' }));
  expect(result.current.ride.status).toBe('picked');
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.ride.status).toBe('picked');
});

test('GET em voo que volta DEPOIS da validação não leva a tela de volta para "retirar"', async () => {
  const first = deferred<any>();
  const second = deferred<any>();
  get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useRide('d1'));
  // a validação chega antes da 1ª leitura voltar (ride ainda null)
  act(() => mockHandlers['delivery:pin_validated']({ deliveryId: 'd1' }));
  await act(async () => { first.resolve({ data: assigned }); await first.promise; });
  await act(async () => { second.resolve({ data: assigned }); await second.promise; });
  expect(result.current.ride?.status).toBe('picked');
  expect(result.current.loading).toBe(false);
});

test('leitura atrasada depois da validação, com a corrida já na tela, mantém "entregar"', async () => {
  get.mockResolvedValueOnce({ data: assigned });
  const { result } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
  const late = deferred<any>();
  get.mockReturnValueOnce(late.promise);
  act(() => mockHandlers['delivery:picked']({ deliveryId: 'd1' }));
  expect(result.current.ride.status).toBe('picked');
  await act(async () => { late.resolve({ data: { ...assigned, pickedAt: null } }); await late.promise; });
  expect(result.current.ride.status).toBe('picked');
});

test('evento de outra corrida é ignorado', async () => {
  get.mockResolvedValue({ data: assigned });
  const { result } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
  act(() => mockHandlers['delivery:status_changed']({ _id: 'd2', deliveryId: 'd2', status: 'picked' }));
  act(() => mockHandlers['delivery:pin_validated']({ deliveryId: 'd2' }));
  act(() => mockHandlers['delivery:cancelled']({ deliveryId: 'd2', status: 'cancelled', reason: 'x' }));
  expect(result.current.ride.status).toBe('assigned');
  expect(result.current.cancelInfo).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
});

test('cada evento da corrida relê o servidor', async () => {
  get.mockResolvedValue({ data: assigned });
  renderHook(() => useRide('d1'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  const events = ['delivery:status_changed', 'delivery:completed', 'delivery:return_initiated', 'delivery:updated'];
  for (const ev of events) act(() => mockHandlers[ev]({ deliveryId: 'd1' }));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1 + events.length));
});

test('reconexão relê pelo onReconnect', async () => {
  get.mockResolvedValue({ data: assigned });
  renderHook(() => useRide('d1'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(mockReconnectCb).not.toBeNull();
  act(() => { mockReconnectCb?.(); }); // bloco: o load devolve promessa e o act não pode virar async
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
});

test('cancelamento guarda motivo e compensação do evento e relê', async () => {
  get.mockResolvedValueOnce({ data: assigned }).mockResolvedValue({ data: { ...assigned, status: 'cancelled', cancellationCompensation: 2.84 } });
  const { result } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
  act(() => mockHandlers['delivery:cancelled']({ deliveryId: 'd1', status: 'cancelled', reason: 'Comprei errado', cancellationCompensation: 2.84 }));
  expect(result.current.cancelInfo).toEqual({ reason: 'Comprei errado', compensation: 2.84 });
  await waitFor(() => expect(result.current.ride.status).toBe('cancelled'));
});

describe('K20: delivery:cancelled chega duas vezes (sala do motoboy e sala "motoboys")', () => {
  const full = { deliveryId: 'd1', status: 'cancelled', reason: 'Comprei errado', cancellationCompensation: 2.84 };
  const bare = { deliveryId: 'd1', status: 'cancelled' };
  const cancelledRead = { ...assigned, status: 'cancelled', cancellationCompensation: 2.84 };

  test('completo e depois o só-status: motivo e compensação ficam', async () => {
    get.mockResolvedValueOnce({ data: assigned }).mockResolvedValue({ data: cancelledRead });
    const { result } = renderHook(() => useRide('d1'));
    await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
    act(() => mockHandlers['delivery:cancelled'](full));
    act(() => mockHandlers['delivery:cancelled'](bare));
    expect(result.current.cancelInfo).toEqual({ reason: 'Comprei errado', compensation: 2.84 });
    await waitFor(() => expect(result.current.ride.status).toBe('cancelled'));
    expect(result.current.cancelInfo).toEqual({ reason: 'Comprei errado', compensation: 2.84 });
  });

  test('só-status e depois o completo: motivo e compensação chegam', async () => {
    get.mockResolvedValueOnce({ data: assigned }).mockResolvedValue({ data: cancelledRead });
    const { result } = renderHook(() => useRide('d1'));
    await waitFor(() => expect(result.current.ride?.status).toBe('assigned'));
    act(() => mockHandlers['delivery:cancelled'](bare));
    expect(result.current.cancelInfo).toEqual({ reason: null, compensation: null });
    act(() => mockHandlers['delivery:cancelled'](full));
    expect(result.current.cancelInfo).toEqual({ reason: 'Comprei errado', compensation: 2.84 });
    await waitFor(() => expect(result.current.ride.status).toBe('cancelled'));
    expect(result.current.cancelInfo).toEqual({ reason: 'Comprei errado', compensation: 2.84 });
  });
});

test('devolução confirmada marca a flag sem reler (a corrida deixa de ser do motoboy)', async () => {
  get.mockResolvedValue({ data: { ...assigned, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500' } });
  const { result } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(result.current.ride?.status).toBe('picked'));
  act(() => mockHandlers['delivery:return_confirmed']({ deliveryId: 'd1', statusDevolucao: 'confirmado' }));
  expect(result.current.returnConfirmed).toBe(true);
  expect(get).toHaveBeenCalledTimes(1);
});

test('403 e 404 viram "gone"; falha de rede vira "network"', async () => {
  get.mockRejectedValueOnce({ response: { status: 403, data: { error: 'Forbidden' } } });
  const a = renderHook(() => useRide('d1'));
  await waitFor(() => expect(a.result.current.error).toBe('gone'));
  expect(a.result.current.loading).toBe(false);
  a.unmount();
  get.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Not found' } } });
  const c = renderHook(() => useRide('d3'));
  await waitFor(() => expect(c.result.current.error).toBe('gone'));
  c.unmount();
  get.mockRejectedValueOnce(new Error('offline'));
  const b = renderHook(() => useRide('d2'));
  await waitFor(() => expect(b.result.current.error).toBe('network'));
});

test('sem id não lê e não fica carregando', () => {
  const { result } = renderHook(() => useRide(undefined));
  expect(get).not.toHaveBeenCalled();
  expect(result.current.loading).toBe(false);
});

test('desmontar solta as inscrições', async () => {
  get.mockResolvedValue({ data: assigned });
  const { unmount } = renderHook(() => useRide('d1'));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  unmount();
  expect(Object.keys(mockHandlers)).toEqual([]);
  expect(mockReconnectCb).toBeNull();
});
