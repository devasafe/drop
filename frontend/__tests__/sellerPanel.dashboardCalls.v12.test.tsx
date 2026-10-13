/**
 * V12 (B8/T12): dentro do painel da loja, /stores/dashboard é lido UMA vez (pelo SellerPanelProvider).
 * useMyStore, RealtimeNotifier e as telas que precisavam da loja leem do painel; fora do painel
 * cada um continua fazendo o próprio GET. Fail closed: com o painel carregando, ninguém assume a loja.
 */
import React, { ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

let mockQuery: Record<string, string> = {};
let mockPath = '/seller/products';
const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPath, query: mockQuery, asPath: mockPath, isReady: true, push: jest.fn(), replace: mockReplace, back: jest.fn() }),
}));
jest.mock('../hooks/useAutoRefetch', () => ({ useSocketListener: () => undefined, useAutoRefetch: () => undefined, useSocketToast: () => undefined }));
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: true, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
const mockEmit = jest.fn();
jest.mock('../contexts/SocketContext', () => ({
  SocketProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useSocket: () => ({ on: () => () => undefined, emit: mockEmit, isConnected: true }),
}));
jest.mock('../lib/notify', () => ({ notify: jest.fn(), primeAudio: jest.fn(), requestNotificationPermission: jest.fn() }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: { children?: ReactNode }) => <>{children}</> }));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }),
  loadSaasConfig: () => Promise.resolve({ settlementMode: 'direto' }),
}));
jest.mock('../components/ui/Toast', () => ({ ...jest.requireActual('../components/ui/Toast'), useToast: () => ({ show: jest.fn(), success: jest.fn(), error: jest.fn() }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../lib/analyticsApi', () => ({ storeAnalytics: { topProducts: () => Promise.resolve({ products: [] }) } }));
const mockGet = jest.fn();
const mockPut = jest.fn(() => Promise.resolve({ data: {} }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: (...a: any[]) => mockGet(...a), post: jest.fn(), put: (...a: any[]) => (mockPut as any)(...a) } }));

// eslint-disable-next-line import/first
import AuthContext from '../contexts/AuthContext';
// eslint-disable-next-line import/first
import { SellerPanelProvider } from '../components/seller/panel/SellerPanelProvider';
// eslint-disable-next-line import/first
import RealtimeNotifier from '../components/RealtimeNotifier';
// eslint-disable-next-line import/first
import { useMyStore } from '../hooks/useMyStore';
// eslint-disable-next-line import/first
import SellerProducts from '../pages/seller/products';
// eslint-disable-next-line import/first
import SellerAssinatura from '../pages/seller/assinatura';
// eslint-disable-next-line import/first
import SellerContaAsaas from '../pages/seller/conta-asaas';
// eslint-disable-next-line import/first
import SellerPagamentos from '../pages/seller/pagamentos';
// eslint-disable-next-line import/first
import SellerWallet from '../pages/seller/wallet';
// eslint-disable-next-line import/first
import SellerPedidosPage from '../pages/seller/pedidos';

const lojista = { _id: 'u1', role: 'lojista', activeRole: 'lojista', name: 'L' };
const dashboard = {
  store: { _id: 's1', name: 'Loja Teste' },
  products: [{ _id: 'p1', name: 'Bolo', price: 10, quantity: 9, isActive: true }],
  orders: [],
  history: [{ _id: 'h1', status: 'entregue', customerName: 'Júlia', createdAt: new Date().toISOString(), products: [], totalValue: 10 }],
  categories: [],
};
let resolveDashboard: ((v: any) => void) | null = null;
let holdDashboard = false;

const dashCalls = () => mockGet.mock.calls.filter(([url]) => url === '/stores/dashboard').length;
const withAuth = (ui: ReactNode) => render(<AuthContext.Provider value={{ user: lojista, can: () => true } as any}>{ui}</AuthContext.Provider>);
const inPanel = (ui: ReactNode) => withAuth(<SellerPanelProvider>{ui}</SellerPanelProvider>);

function StoreProbe({ id }: { id: string }) {
  const { store, products, loading } = useMyStore();
  return <p data-testid={id}>{loading ? 'carregando' : `${store?._id || 'sem loja'}:${products.length}`}</p>;
}

let logs: jest.SpyInstance[] = [];
beforeEach(() => {
  mockGet.mockReset();
  mockEmit.mockClear();
  mockReplace.mockClear();
  mockQuery = {};
  mockPath = '/seller/products';
  holdDashboard = false;
  resolveDashboard = null;
  mockGet.mockImplementation((url: string) => {
    if (url === '/stores/dashboard') {
      if (holdDashboard) return new Promise((r) => { resolveDashboard = r; });
      return Promise.resolve({ data: dashboard });
    }
    if (url === '/stores/s1/asaas') return Promise.resolve({ data: { data: { status: 'valid', checklist: {} } } });
    return Promise.reject(new Error('fora do teste'));
  });
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => { logs.forEach((s) => s.mockRestore()); });

describe('V12: uma leitura de /stores/dashboard por montagem do painel', () => {
  test('painel + RealtimeNotifier + Produtos + outro useMyStore: 1 chamada, e o notificador entra na sala da loja', async () => {
    inPanel(<><RealtimeNotifier /><SellerProducts /><StoreProbe id="probe" /></>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('s1:1'));
    expect(await screen.findByText('Bolo')).toBeInTheDocument();
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('join', { room: 'store:s1', storeId: 's1' }));
    expect(dashCalls()).toBe(1);
  });

  test('fail closed: com o painel carregando, useMyStore espera e o notificador não entra em sala nenhuma', async () => {
    holdDashboard = true;
    inPanel(<><RealtimeNotifier /><StoreProbe id="probe" /></>);
    expect(screen.getByTestId('probe')).toHaveTextContent('carregando');
    await new Promise((r) => setTimeout(r, 20));
    expect(mockEmit).not.toHaveBeenCalledWith('join', expect.anything());
    expect(dashCalls()).toBe(1);
    resolveDashboard!({ data: dashboard });
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('s1:1'));
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('join', { room: 'store:s1', storeId: 's1' }));
    expect(dashCalls()).toBe(1);
  });

  test('fora do painel nada muda: useMyStore e RealtimeNotifier fazem o próprio GET', async () => {
    withAuth(<><RealtimeNotifier /><StoreProbe id="probe" /></>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('s1:1'));
    await waitFor(() => expect(mockEmit).toHaveBeenCalledWith('join', { room: 'store:s1', storeId: 's1' }));
    expect(dashCalls()).toBe(2);
  });

  test('pausar um produto recarrega o painel (a próxima tela abre com o catálogo novo); a tela atual não pisca', async () => {
    inPanel(<SellerProducts />);
    expect(await screen.findByText('Bolo')).toBeInTheDocument();
    expect(dashCalls()).toBe(1);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/products/p1/active', { isActive: false }));
    await waitFor(() => expect(dashCalls()).toBe(2));
    expect(screen.getByText('Bolo')).toBeInTheDocument();
  });

  test('Assinatura no painel: lê a loja do painel e busca a assinatura dela', async () => {
    mockPath = '/seller/assinatura';
    inPanel(<SellerAssinatura />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/stores/s1/saas-billing'));
    expect(dashCalls()).toBe(1);
  });

  test('Conta Asaas no painel: lê a loja do painel', async () => {
    mockPath = '/seller/conta-asaas';
    inPanel(<SellerContaAsaas />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/stores/s1/asaas'));
    expect(dashCalls()).toBe(1);
  });

  test('Recebimentos (redireciona) no painel: lê a loja do painel', async () => {
    mockPath = '/seller/pagamentos';
    inPanel(<SellerPagamentos />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith('/stores/s1/asaas');
    expect(dashCalls()).toBe(1);
  });

  test('Carteira antiga no painel: lê a loja do painel', async () => {
    mockPath = '/seller/wallet';
    inPanel(<SellerWallet />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/wallets/store/s1'));
    expect(dashCalls()).toBe(1);
  });

  test('Pedidos > Concluídos no painel: usa o histórico do painel', async () => {
    mockPath = '/seller/pedidos';
    mockQuery = { seg: 'concluidos' };
    inPanel(<SellerPedidosPage />);
    expect(await screen.findByText(/Júlia/)).toBeInTheDocument();
    expect(dashCalls()).toBe(1);
  });
});
