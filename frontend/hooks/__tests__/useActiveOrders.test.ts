// frontend/hooks/__tests__/useActiveOrders.test.ts
import { renderHook } from '@testing-library/react';

const refetch = jest.fn();
jest.mock('../useSync', () => ({
  useOrders: () => ({
    orders: [
      { _id: 'a', status: 'pago', createdAt: '2026-08-01T10:00:00' },
      { _id: 'b', status: 'entregue', createdAt: '2026-08-02T10:00:00' },
    ],
    loading: false,
    refetch,
  }),
}));

const handlers: Record<string, () => void> = {};
jest.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({
    on: (event: string, cb: () => void) => { handlers[event] = cb; return () => { delete handlers[event]; }; },
  }),
}));

import { useActiveOrders } from '../useActiveOrders';

beforeEach(() => { refetch.mockClear(); });

test('retorna só os pedidos ativos', () => {
  const { result } = renderHook(() => useActiveOrders());
  expect(result.current.activeOrders.map((o: any) => o._id)).toEqual(['a']);
});

test('um evento delivery dispara refetch', () => {
  renderHook(() => useActiveOrders());
  expect(typeof handlers['delivery:picked']).toBe('function');
  handlers['delivery:picked']();
  expect(refetch).toHaveBeenCalled();
});
