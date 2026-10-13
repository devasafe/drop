import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockHandlers: Record<string, (data?: any) => any> = {};
jest.mock('../../../../hooks/useAutoRefetch', () => ({
  useSocketListener: (event: string, handler: (data?: any) => any) => { mockHandlers[event] = handler; },
  useAutoRefetch: jest.fn(),
  useSocketToast: jest.fn(),
}));
jest.mock('../../../../lib/socket', () => ({
  connectSocket: () => ({ connected: true, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
const mockGet = jest.fn();
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => mockGet(...a) } }));

import AuthContext from '../../../../contexts/AuthContext';
import { SellerPanelGate } from '../SellerPanelGate';
import { useSellerPanelOptional } from '../SellerPanelProvider';

let mockDashboard: any;
const order = (id: string) => ({ _id: id, status: 'pago', products: [], totalValue: 10 });

/** Faz o papel de uma tela qualquer do painel (ex.: a aba Produtos). */
function Probe() {
  const p = useSellerPanelOptional();
  return <span data-testid="probe">{p ? `pedidos:${p.orders.length} novos:${p.newOrderCount}` : 'sem painel'}</span>;
}

const renderAt = (pathname: string, enabled = true) => render(
  <AuthContext.Provider value={{ user: { _id: 'u1', activeRole: 'lojista' } } as any}>
    <SellerPanelGate pathname={pathname} enabled={enabled}><Probe /></SellerPanelGate>
  </AuthContext.Provider>,
);

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  mockDashboard = { store: { _id: 's1', name: 'Loja' }, orders: [order('o1')], history: [], categories: [] };
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) =>
    url === '/stores/dashboard' ? Promise.resolve({ data: mockDashboard }) : Promise.resolve({ data: {} }));
});

test('em /seller/products o pedido novo chega pelo socket (a aba Produtos não perde o aviso)', async () => {
  renderAt('/seller/products');
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('pedidos:1 novos:0'));
  mockDashboard = { ...mockDashboard, orders: [order('o2'), order('o1')] };
  await act(async () => { await mockHandlers.new_order({ orderId: 'o2' }); });
  expect(screen.getByTestId('probe')).toHaveTextContent('pedidos:2 novos:1');
});

test.each(['/seller/dashboard', '/seller/pedidos', '/seller/pedido/[id]', '/seller/dinheiro', '/seller/loja', '/store-dashboard'])(
  '%s monta o painel', async (pathname) => {
    renderAt(pathname);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('pedidos:1'));
  },
);

test.each(['/inicio', '/motoboy', '/admin/dashboard', '/notifications'])('%s não monta o painel da loja', (pathname) => {
  renderAt(pathname);
  expect(screen.getByTestId('probe')).toHaveTextContent('sem painel');
  expect(mockGet).not.toHaveBeenCalled();
});

test('sem usuário logado não monta', () => {
  renderAt('/seller/products', false);
  expect(screen.getByTestId('probe')).toHaveTextContent('sem painel');
  expect(mockGet).not.toHaveBeenCalled();
});
