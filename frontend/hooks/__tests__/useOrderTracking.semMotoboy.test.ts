import { useState } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

jest.mock('../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

const mockUseOrder = jest.fn();
const mockUseDelivery = jest.fn();
jest.mock('../useSync', () => ({
  useOrder: (...args: unknown[]) => mockUseOrder(...args),
  useDelivery: (...args: unknown[]) => mockUseDelivery(...args),
}));

const handlers: Record<string, (data: unknown) => void> = {};
jest.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({
    on: (event: string, handler: (data: unknown) => void) => { handlers[event] = handler; return () => { delete handlers[event]; }; },
    off: jest.fn(), emit: jest.fn(),
  }),
}));

import { useOrderTracking } from '../useOrderTracking';

const order = { _id: 'o1', status: 'aguardando_motoboy', deliveryId: 'd1', awaitingCustomerPoolDecision: true };

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  mockedApi.get.mockResolvedValue({ data: {} } as unknown as AxiosResponse);
  mockedApi.post.mockResolvedValue({ data: { success: true } } as unknown as AxiosResponse);
  mockUseOrder.mockImplementation(() => {
    const [o, setOrder] = useState<any>(order);
    return { order: o, loading: false, setOrder };
  });
  mockUseDelivery.mockImplementation(() => {
    const [d, setDelivery] = useState<any>({ _id: 'd1', status: 'pending' });
    return { delivery: d, loading: false, setDelivery };
  });
});

/** Os avisos de "sem motoboy" e da devolução atualizam a tela do pedido na hora. */
test.each([
  'order:pool_timeout',
  'order:pool_timeout_resolved',
  'order:aguardando_decisao_devolucao',
  'order:reentrega_escolhida',
  'order:reassigning',
])('%s do próprio pedido rebusca pedido e entrega', async (event) => {
  renderHook(() => useOrderTracking('o1'));
  mockedApi.get.mockClear();
  act(() => handlers[event]({ orderId: 'o1', deliveryId: 'd1' }));
  await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/orders/o1'));
  expect(mockedApi.get).toHaveBeenCalledWith('/deliveries/d1');
});

test('evento de outro pedido é ignorado', () => {
  renderHook(() => useOrderTracking('o1'));
  mockedApi.get.mockClear();
  act(() => handlers['order:pool_timeout']({ orderId: 'outro' }));
  expect(mockedApi.get).not.toHaveBeenCalledWith('/orders/o1');
});

test('decidePoolTimeout("seguir") envia a escolha e tira a pergunta da tela', async () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  let r: any;
  await act(async () => { r = await result.current.decidePoolTimeout('seguir'); });
  expect(mockedApi.post).toHaveBeenCalledWith('/orders/o1/pool-timeout', { escolha: 'seguir' });
  expect(r).toEqual({ ok: true });
  expect(result.current.order.awaitingCustomerPoolDecision).toBe(false);
});

test('decidePoolTimeout: decisão já tomada em outro aparelho (409) recarrega sem erro', async () => {
  mockedApi.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Não há decisão' } } });
  const { result } = renderHook(() => useOrderTracking('o1'));
  mockedApi.get.mockClear();
  let r: any;
  await act(async () => { r = await result.current.decidePoolTimeout('cancelar'); });
  expect(r).toEqual({ ok: true });
  expect(mockedApi.get).toHaveBeenCalledWith('/orders/o1');
});

test('decideReturn("reentrega") envia a escolha e marca a nova entrega', async () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  let r: any;
  await act(async () => { r = await result.current.decideReturn('reentrega'); });
  expect(mockedApi.post).toHaveBeenCalledWith('/orders/o1/pos-devolucao', { escolha: 'reentrega' });
  expect(r).toEqual({ ok: true });
  expect(result.current.delivery.pendingReturnAction).toBe('reassign');
});

test('decideReturn: erro do servidor volta com a mensagem', async () => {
  mockedApi.post.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Falhou' } } });
  const { result } = renderHook(() => useOrderTracking('o1'));
  let r: any;
  await act(async () => { r = await result.current.decideReturn('reembolso'); });
  expect(r).toEqual({ ok: false, error: 'Falhou' });
});
