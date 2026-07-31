import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
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

// `on` registra handlers por evento (capturados em `handlers`) e devolve um
// unsubscribe real, pra podermos testar tanto o disparo quanto o cleanup.
const handlers: Record<string, (data: unknown) => void> = {};
const mockOn = jest.fn((event: string, handler: (data: unknown) => void) => {
  handlers[event] = handler;
  return () => { delete handlers[event]; };
});
jest.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({ on: (...args: [string, (data: unknown) => void]) => mockOn(...args), off: jest.fn(), emit: jest.fn() }),
}));

import { useOrderTracking } from '../useOrderTracking';

const baseOrder = { _id: 'o1', status: 'pago', storeId: { name: 'LJ' }, deliveryId: 'd1' };
const baseDelivery = { _id: 'd1', status: 'assigned', pin: '1234' };

function stubOrder(initial: any) {
  mockUseOrder.mockImplementation(() => {
    const [order, setOrder] = useState(initial);
    return { order, loading: false, setOrder };
  });
}

function stubDelivery(initial: any) {
  mockUseDelivery.mockImplementation(() => {
    const [delivery, setDelivery] = useState(initial);
    return { delivery, loading: false, setDelivery };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(handlers).forEach((k) => delete handlers[k]);
  mockedApi.get.mockResolvedValue({ data: {} } as unknown as AxiosResponse);
  mockedApi.post.mockResolvedValue({ data: {} } as unknown as AxiosResponse);
  stubOrder(baseOrder);
  stubDelivery(baseDelivery);
});

test('mostra mapa e PIN quando o motoboy foi atribuído', () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.showMap).toBe(true);
  expect(result.current.showPin).toBe(true);
});

test('deriva steps com "aceito" concluído no status pago+assigned', () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  const aceito = result.current.steps.find((s) => /aceito|preparando/i.test(s.label));
  expect(aceito?.done).toBe(true);
  expect(result.current.progress).toBeGreaterThan(0);
});

test('não mostra mapa/PIN sem entrega atribuída (delivery pending)', () => {
  stubDelivery({ _id: 'd1', status: 'pending' });
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.showMap).toBe(false);
  expect(result.current.showPin).toBe(false);
});

test('statusTone e statusLabel refletem entrega concluída', () => {
  stubDelivery({ _id: 'd1', status: 'delivered' });
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.statusTone).toBe('success');
  expect(result.current.statusLabel).toBe('Seu pedido foi entregue!');
});

test('statusTone é "danger" quando o pedido foi rejeitado', () => {
  stubOrder({ ...baseOrder, status: 'rejeitado' });
  stubDelivery(null);
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.statusTone).toBe('danger');
  expect(result.current.statusLabel).toBe('Seu pedido foi rejeitado pela loja');
});

test('canConfirmReceived: true só pago, sem entrega e sem taxa (Plano 1)', () => {
  stubOrder({ _id: 'o1', status: 'pago', deliveryFee: 0 });
  stubDelivery(null);
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.canConfirmReceived).toBe(true);
});

test('canConfirmReceived: false quando já existe entrega atribuída', () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.canConfirmReceived).toBe(false);
});

test('confirmReceived faz POST /orders/:id/deliver e atualiza status para "entregue"', async () => {
  stubOrder({ _id: 'o1', status: 'pago', deliveryFee: 0 });
  stubDelivery(null);
  const { result } = renderHook(() => useOrderTracking('o1'));

  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.confirmReceived(); });

  expect(mockedApi.post).toHaveBeenCalledWith('/orders/o1/deliver');
  expect(response?.ok).toBe(true);
  expect(result.current.order.status).toBe('entregue');
});

test('confirmReceived retorna erro amigável quando a API falha', async () => {
  stubOrder({ _id: 'o1', status: 'pago', deliveryFee: 0 });
  stubDelivery(null);
  mockedApi.post.mockRejectedValueOnce({ response: { data: { error: 'Pedido não encontrado' } } });
  const { result } = renderHook(() => useOrderTracking('o1'));

  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.confirmReceived(); });

  expect(response).toEqual({ ok: false, error: 'Pedido não encontrado' });
});

test('submitMotoboyRating exige nota antes de enviar', async () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.submitMotoboyRating(0, ''); });
  expect(response?.ok).toBe(false);
  expect(mockedApi.post).not.toHaveBeenCalled();
});

test('submitMotoboyRating envia avaliação e atualiza a entrega localmente', async () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.submitMotoboyRating(5, 'Ótimo!'); });

  expect(mockedApi.post).toHaveBeenCalledWith('/deliveries/d1/avaliar', { rating: 5, comment: 'Ótimo!' });
  expect(response?.ok).toBe(true);
  expect(result.current.delivery.rating).toBe(5);
});

test('submitStoreRating envia avaliação da loja e atualiza o pedido localmente', async () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.submitStoreRating(4, 'Boa loja'); });

  expect(mockedApi.post).toHaveBeenCalledWith('/orders/o1/evaluate-store', { storeRating: 4, storeComment: 'Boa loja' });
  expect(response?.ok).toBe(true);
  expect(result.current.order.storeRating).toBe(4);
});

test('evento socket order:accepted_by_store atualiza o pedido e refaz a busca da entrega', async () => {
  stubOrder({ _id: 'o1', status: 'criado', deliveryId: undefined });
  stubDelivery(null);
  mockedApi.get.mockResolvedValue({ data: { _id: 'd9', status: 'assigned' } } as unknown as AxiosResponse);
  const { result } = renderHook(() => useOrderTracking('o1'));

  await act(async () => {
    handlers['order:accepted_by_store']({ orderId: 'o1', deliveryId: 'd9' });
  });

  expect(result.current.order.status).toBe('pago');
  expect(mockedApi.get).toHaveBeenCalledWith('/deliveries/d9');
});

test('evento socket ignorado quando é de outro pedido', () => {
  const { result } = renderHook(() => useOrderTracking('o1'));
  act(() => {
    handlers['order:rejected_by_store']({ orderId: 'outro-pedido' });
  });
  expect(result.current.order.status).toBe('pago');
});

test('desinscreve todos os listeners de socket ao desmontar', () => {
  const { unmount } = renderHook(() => useOrderTracking('o1'));
  expect(Object.keys(handlers).length).toBeGreaterThan(0);
  unmount();
  expect(Object.keys(handlers).length).toBe(0);
});

test('NÃO busca PIX pendente automaticamente no mount — é sob demanda', async () => {
  stubOrder({ _id: 'o1', status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending', asaasPaymentId: 'pay_1' });
  stubDelivery(null);

  renderHook(() => useOrderTracking('o1'));
  await act(async () => {});

  expect(mockedApi.get).not.toHaveBeenCalledWith('/orders/o1/pix');
});

test('openPix() busca o PIX pendente e popula pixData sob demanda', async () => {
  stubOrder({ _id: 'o1', status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending', asaasPaymentId: 'pay_1' });
  stubDelivery(null);
  mockedApi.get.mockResolvedValue({ data: { qrCodePayload: 'copia-e-cola', paid: false } } as unknown as AxiosResponse);

  const { result } = renderHook(() => useOrderTracking('o1'));
  expect(result.current.pixData).toBeNull();

  let response: { ok: boolean; error?: string } | undefined;
  await act(async () => { response = await result.current.openPix(); });

  expect(mockedApi.get).toHaveBeenCalledWith('/orders/o1/pix');
  expect(response?.ok).toBe(true);
  expect(result.current.pixData?.qrCodePayload).toBe('copia-e-cola');

  act(() => { result.current.closePix(); });
  expect(result.current.pixData).toBeNull();
});

test('openPix() marca o pedido como pago quando o PIX já foi confirmado', async () => {
  stubOrder({ _id: 'o1', status: 'criado', paymentMethod: 'pix', paymentStatus: 'pending', asaasPaymentId: 'pay_1' });
  stubDelivery(null);
  mockedApi.get.mockResolvedValue({ data: { paid: true } } as unknown as AxiosResponse);

  const { result } = renderHook(() => useOrderTracking('o1'));
  await act(async () => { await result.current.openPix(); });

  expect(result.current.order.paymentStatus).toBe('paid');
  expect(result.current.pixData).toBeNull();
});
