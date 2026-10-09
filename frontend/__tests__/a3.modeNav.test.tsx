/**
 * A3: motoboy no modo direto vê "Repasses recebidos" (e não "Ganhos e saques");
 * /motoboy/wallet no direto mostra só os Pix da loja e não chama carteira/payout/saque;
 * dashboard do admin esconde cards custodyOnly no direto.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { getNavItems } from '../lib/navConfig';
import MotoboyWalletPage from '../pages/motoboy/wallet';
import AdminDashboard from '../pages/admin/dashboard';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
let mockRole = 'motoboy';
let mockMode = 'direto';
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', activeRole: mockRole },
    can: () => true,
  }),
}));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false }),
}));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

beforeEach(() => {
  mockMode = 'direto';
  (api.get as jest.Mock).mockReset();
});

describe('navConfig motoboy', () => {
  const labels = (mode: string) => getNavItems('motoboy', () => true, false, { settlementMode: mode }).map((i) => i.label);
  test('direto tem "Repasses recebidos" e não "Ganhos e saques"', () => {
    expect(labels('direto')).toContain('Repasses recebidos');
    expect(labels('direto')).not.toContain('Ganhos e saques');
  });
  test('custódia não tem "Repasses recebidos"', () => {
    expect(labels('custodia')).not.toContain('Repasses recebidos');
    expect(labels('custodia')).toContain('Ganhos e saques');
  });
});

describe('motoboy/wallet no modo direto', () => {
  test('só Pix recebidos: sem botão de saque e sem rotas de carteira/payout/saque', async () => {
    mockRole = 'motoboy';
    (api.get as jest.Mock).mockImplementation((u: string) => {
      if (u === '/motoboy/transfers') {
        return Promise.resolve({ data: { data: [{ id: 't1', orderId: 'ord123456', amount: 9, status: 'done', createdAt: '2026-10-08T10:00:00Z' }], nextCursor: null } });
      }
      return Promise.reject({ response: { status: 404 } });
    });
    render(<MotoboyWalletPage />);
    await waitFor(() => expect(screen.getByText('Recebido')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Repasses recebidos' })).toBeInTheDocument();
    expect(screen.queryByText(/Sacar para meu PIX/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Disponível para saque/i)).not.toBeInTheDocument();
    const urls = (api.get as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.startsWith('/wallets') || u.startsWith('/payouts') || u.startsWith('/withdrawals'))).toBe(false);
    expect(urls).toContain('/motoboy/transfers');
  });

  test('custódia: página como sempre (saldo e saque)', async () => {
    mockMode = 'custodia';
    (api.get as jest.Mock).mockImplementation((u: string) => {
      if (u.startsWith('/wallets/motoboy')) return Promise.resolve({ data: { balance: 0, availableBalance: 30 } });
      return Promise.reject({ response: { status: 404 } });
    });
    render(<MotoboyWalletPage />);
    await waitFor(() => expect(screen.getByText(/Sacar para meu PIX/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Ganhos e saques' })).toBeInTheDocument();
  });
});

describe('admin/dashboard no modo direto', () => {
  test('não mostra cards custodyOnly (Carteiras, Caixa, Planos) mas mostra os directOnly', async () => {
    mockRole = 'ceo';
    (api.get as jest.Mock).mockResolvedValue({ data: { totalBalance: 0, totalIncome: 0, totalUsers: 0, totalStores: 0, totalMotoboys: 0, history: [] } });
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText('Estornos')).toBeInTheDocument());
    for (const l of ['Carteiras', 'Caixa', 'Planos']) {
      expect(screen.queryByText(l)).not.toBeInTheDocument();
    }
  });
});

describe('OverviewTab atalho Financeiro', () => {
  const OverviewTab = require('../components/seller/OverviewTab').default;
  const props = {
    store: { _id: 's1', name: 'L', isOpen: true }, orders: [], history: [], returnRequests: [],
    metrics: { totalSales: 0, delivered: 0, ongoing: 0, revenue: 0 },
    onGoToTab: jest.fn(), onToggleOpen: jest.fn(), onQuickAction: jest.fn(),
  };
  test('showFinanceiro=false esconde o atalho; por padrão aparece', () => {
    const { unmount } = render(<OverviewTab {...props} showFinanceiro={false} />);
    expect(screen.queryByText('Financeiro')).not.toBeInTheDocument();
    unmount();
    render(<OverviewTab {...props} />);
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });
});
