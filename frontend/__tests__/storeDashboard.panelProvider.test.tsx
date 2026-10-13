// D1/P5.4: a página não busca nem escuta o socket por conta própria quando o painel já está montado.
// Teste de estrutura da transição: a parte P6 apaga este arquivo quando substituir o store-dashboard.
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';

jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../components/OnboardingResumeBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/StoreBannerUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/OperatingHoursEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationList', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationDetail', () => ({ __esModule: true, default: () => null }));
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: false, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
const mockHandlers: Record<string, (data?: any) => any> = {};
jest.mock('../hooks/useAutoRefetch', () => ({
  useAutoRefetch: jest.fn(),
  useSocketListener: (event: string, handler: (data?: any) => any) => { mockHandlers[event] = handler; },
  useSocketToast: jest.fn(),
}));

let mockDashboard: any;
const mockGet = jest.fn();
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockGet(...a), post: jest.fn(() => Promise.resolve({ data: {} })), put: jest.fn(() => Promise.resolve({ data: {} })) },
}));
jest.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: jest.fn(), replace: jest.fn(), isReady: true }) }));

import AuthContext from '../contexts/AuthContext';
import StoreDashboard from '../pages/store-dashboard';
import { SellerPanelProvider } from '../components/seller/panel/SellerPanelProvider';

beforeEach(() => {
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  mockDashboard = { store: { _id: 'store1', name: 'Loja Teste', isOpen: true, plan: 1 }, orders: [], history: [], categories: [] };
  mockGet.mockReset();
  mockGet.mockImplementation((url: string) =>
    url === '/stores/dashboard' ? Promise.resolve({ data: mockDashboard }) : Promise.resolve({ data: {} }));
});

const renderInsidePanel = () => render(
  <AuthContext.Provider value={{ user: { _id: 'u1', activeRole: 'lojista' }, token: 'tok' } as any}>
    <SellerPanelProvider><StoreDashboard /></SellerPanelProvider>
  </AuthContext.Provider>,
);

test('dentro do painel, a página não busca /stores/dashboard de novo', async () => {
  renderInsidePanel();
  await waitFor(() => expect(screen.getByText('Faturamento hoje')).toBeInTheDocument());
  expect(mockGet.mock.calls.filter(([u]) => u === '/stores/dashboard')).toHaveLength(1);
});

test('pedido novo pelo socket do painel mostra o aviso na página', async () => {
  renderInsidePanel();
  await waitFor(() => expect(screen.getByText('Faturamento hoje')).toBeInTheDocument());
  mockDashboard = { ...mockDashboard, orders: [{ _id: 'o2', status: 'pago', products: [], totalValue: 10 }] };
  await act(async () => { await mockHandlers.new_order({ orderId: 'o2' }); });
  expect(screen.getByText(/Novo pedido recebido!/)).toBeInTheDocument();
});

test('aviso fechado não reaparece ao sair e voltar à página (provider continua montado)', async () => {
  const { rerender } = render(
    <AuthContext.Provider value={{ user: { _id: 'u1', activeRole: 'lojista' }, token: 'tok' } as any}>
      <SellerPanelProvider><StoreDashboard /></SellerPanelProvider>
    </AuthContext.Provider>,
  );
  await waitFor(() => expect(screen.getByText('Faturamento hoje')).toBeInTheDocument());
  mockDashboard = { ...mockDashboard, orders: [{ _id: 'o2', status: 'pago', products: [], totalValue: 10 }] };
  await act(async () => { await mockHandlers.new_order({ orderId: 'o2' }); });
  expect(screen.getByText(/Novo pedido recebido!/)).toBeInTheDocument();
  await act(async () => { screen.getByLabelText('Fechar notificação').click(); });
  expect(screen.queryByText(/Novo pedido recebido!/)).toBeNull();

  const wrap = (page: React.ReactNode) => (
    <AuthContext.Provider value={{ user: { _id: 'u1', activeRole: 'lojista' }, token: 'tok' } as any}>
      <SellerPanelProvider>{page}</SellerPanelProvider>
    </AuthContext.Provider>
  );
  rerender(wrap(<div>outra página</div>));
  rerender(wrap(<StoreDashboard />));
  await waitFor(() => expect(screen.getByText('Faturamento hoje')).toBeInTheDocument());
  expect(screen.queryByText(/Novo pedido recebido!/)).toBeNull();
});
