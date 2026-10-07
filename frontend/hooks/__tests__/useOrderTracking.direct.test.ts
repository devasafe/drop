import { useState } from 'react';
import { renderHook } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

// Revisão final da Fase 1 (I3): pedido do modo direto (asaas_loja) nunca mostra
// "Confirmar recebimento" — é entregue por motoboy e o backend recusa /deliver.

jest.mock('../../lib/api');
const mockUseOrder = jest.fn();
jest.mock('../useSync', () => ({
  useOrder: (...args: unknown[]) => mockUseOrder(...args),
  useDelivery: () => ({ delivery: null, loading: false, setDelivery: jest.fn() }),
}));
jest.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({ on: () => () => undefined, off: jest.fn(), emit: jest.fn() }),
}));

import { useOrderTracking } from '../useOrderTracking';
const mockedApi = api as jest.Mocked<typeof api>;

function stubOrder(order: any) {
  mockUseOrder.mockImplementation(() => {
    const [o, setOrder] = useState(order);
    return { order: o, loading: false, setOrder };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.get.mockResolvedValue({ data: {} } as unknown as AxiosResponse);
});

test('pedido asaas_loja pago, sem entrega e sem taxa: não oferece confirmar recebimento', () => {
  stubOrder({ _id: 'o1', status: 'pago', deliveryFee: 0, paymentProvider: 'asaas_loja', storeId: { name: 'LJ' } });
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.canConfirmReceived).toBe(false);
});

test('pedido da custódia Plano 1 (sem taxa) continua oferecendo confirmar recebimento', () => {
  stubOrder({ _id: 'o1', status: 'pago', deliveryFee: 0, paymentProvider: 'asaas', storeId: { name: 'LJ' } });
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.canConfirmReceived).toBe(true);
});
