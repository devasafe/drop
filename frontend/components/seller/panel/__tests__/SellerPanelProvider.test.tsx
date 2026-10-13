// frontend/components/seller/panel/__tests__/SellerPanelProvider.test.tsx
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockHandlers: Record<string, (data?: any) => any> = {};
jest.mock('../../../../hooks/useAutoRefetch', () => ({
  useSocketListener: (event: string, handler: (data?: any) => any) => { mockHandlers[event] = handler; },
  useAutoRefetch: jest.fn(),
  useSocketToast: jest.fn(),
}));
const mockEmit = jest.fn();
jest.mock('../../../../lib/socket', () => ({
  connectSocket: () => ({ connected: true, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: (...a: any[]) => mockEmit(...a) }),
  getSocket: () => null,
}));
const mockGet = jest.fn();
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => mockGet(...a) } }));

import AuthContext from '../../../../contexts/AuthContext';
import { SellerPanelProvider, useSellerPanel } from '../SellerPanelProvider';
import { pendingReturnsFromOrders, mergeReturns, upsertReturn } from '../sellerPanelState';

let mockDashboard: any;
const order = (id: string, extra: any = {}) => ({ _id: id, status: 'pago', products: [], totalValue: 10, ...extra });

function Probe() {
  const p = useSellerPanel();
  return (
    <div>
      <span data-testid="store">{p.store?.name || 'sem loja'}</span>
      <span data-testid="orders">{p.orders.length}</span>
      <span data-testid="history">{p.history.length}</span>
      <span data-testid="novos">{p.newOrderCount}</span>
      <span data-testid="devolucoes">{p.returnRequests.length}</span>
      <span data-testid="erro">{p.error || ''}</span>
    </div>
  );
}

const lojista = { _id: 'u1', activeRole: 'lojista' };
const renderPanel = (children: React.ReactNode = <SellerPanelProvider><Probe /></SellerPanelProvider>) =>
  render(<AuthContext.Provider value={{ user: lojista } as any}>{children}</AuthContext.Provider>);

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  mockEmit.mockClear();
  mockDashboard = { store: { _id: 's1', name: 'Loja Teste' }, orders: [order('o1')], history: [], categories: [] };
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) =>
    url === '/stores/dashboard' ? Promise.resolve({ data: mockDashboard }) : Promise.resolve({ data: {} }));
});

describe('SellerPanelProvider', () => {
  test('carrega a loja e os pedidos e entra na sala da loja', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('store')).toHaveTextContent('Loja Teste'));
    expect(screen.getByTestId('orders')).toHaveTextContent('1');
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('join', { room: 'store:s1', storeId: 's1' }));
  });

  test('pedido novo pelo socket: recarrega e conta uma vez por pedido', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('1'));
    mockDashboard = { ...mockDashboard, orders: [order('o2'), order('o1')] };
    await act(async () => { await mockHandlers.new_order({ orderId: 'o2' }); });
    expect(screen.getByTestId('orders')).toHaveTextContent('2');
    expect(screen.getByTestId('novos')).toHaveTextContent('1');
    await act(async () => { await mockHandlers.new_order({ orderId: 'o2' }); });
    expect(screen.getByTestId('novos')).toHaveTextContent('1');
  });

  test('não escuta order:created (o backend manda junto com new_order)', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('1'));
    expect(mockHandlers['order:created']).toBeUndefined();
  });

  test('pedido cancelado sai dos ativos e entra no histórico', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('1'));
    act(() => { mockHandlers['order:cancelled']({ orderId: 'o1' }); });
    expect(screen.getByTestId('orders')).toHaveTextContent('0');
    expect(screen.getByTestId('history')).toHaveTextContent('1');
  });

  test('devolução pedida pelo socket aparece sem trocar de tela', async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('1'));
    act(() => {
      mockHandlers['delivery:return_requested']({
        deliveryId: 'd1', orderId: 'o1', motoboyId: 'm1', message: 'x', pinRequired: true, returnedAt: '2026-10-12T10:00:00Z',
      });
    });
    expect(screen.getByTestId('devolucoes')).toHaveTextContent('1');
  });

  test('lojista ainda sem loja (404): sem erro na tela', async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });
    renderPanel();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(screen.getByTestId('store')).toHaveTextContent('sem loja');
    expect(screen.getByTestId('erro')).toHaveTextContent('');
  });

  test('falha de rede vira mensagem legível', async () => {
    mockGet.mockRejectedValue(new Error('500'));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('erro')).toHaveTextContent('Não foi possível carregar o painel'));
  });

  test('provider dentro de provider não duplica a carga nem o socket', async () => {
    renderPanel(<SellerPanelProvider><SellerPanelProvider><Probe /></SellerPanelProvider></SellerPanelProvider>);
    await waitFor(() => expect(screen.getByTestId('orders')).toHaveTextContent('1'));
    expect(mockGet.mock.calls.filter(([u]) => u === '/stores/dashboard')).toHaveLength(1);
  });

  test('useSellerPanel fora do provider devolve estado vazio', () => {
    render(<Probe />);
    expect(screen.getByTestId('store')).toHaveTextContent('sem loja');
    expect(screen.getByTestId('orders')).toHaveTextContent('0');
    expect(screen.getByTestId('novos')).toHaveTextContent('0');
  });
});

describe('estado das devoluções', () => {
  const comDevolucao = order('o1', { delivery: { _id: 'd1', statusDevolucao: 'aguardando_confirmacao', motoboyName: 'Rui', updatedAt: '2026-10-12T10:00:00Z' } });

  test('pendingReturnsFromOrders lê as devoluções já pendentes', () => {
    expect(pendingReturnsFromOrders([comDevolucao, order('o2')])).toEqual([
      { deliveryId: 'd1', orderId: 'o1', motoboyId: 'Rui', message: 'Motoboy solicitou devolução do produto', pinRequired: true, returnedAt: '2026-10-12T10:00:00Z' },
    ]);
  });

  test('mergeReturns mantém a do socket enquanto o pedido segue ativo e larga quando ele sai', () => {
    const doSocket = { deliveryId: 'd9', orderId: 'o2', motoboyId: 'm', message: 'x', pinRequired: true, returnedAt: 't' };
    expect(mergeReturns([doSocket], [], [order('o2')])).toEqual([doSocket]);
    expect(mergeReturns([doSocket], [], [order('o1')])).toEqual([]);
  });

  test('upsertReturn troca a mesma entrega e põe a nova no topo', () => {
    const a = { deliveryId: 'd1', orderId: 'o1', motoboyId: 'm', message: 'x', pinRequired: true, returnedAt: 't' };
    expect(upsertReturn([a], { ...a, message: 'y' })).toEqual([{ ...a, message: 'y' }]);
    expect(upsertReturn([a], { ...a, deliveryId: 'd2' }).map((r) => r.deliveryId)).toEqual(['d2', 'd1']);
  });
});
