/**
 * Modo SaaS (direto) não tem planos: o admin não mostra a coluna "Plano" (o servidor manda plan null),
 * as Configurações não mostram "Comissão das lojas" e a tela de trocas de plano não abre.
 */
import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminLojasPage from '../pages/admin/lojas';
import AdminSettings from '../pages/admin/settings';
import PlanApprovals from '../pages/admin/plan-approvals';
import { __resetSaasConfigCache } from '../hooks/useSaasConfig';
import { adminAuth, renderAdminPage } from './helpers/adminPage';

const mockReplace = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, query: {}, isReady: true, pathname: '/admin', asPath: '/admin' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
const get = api.get as jest.Mock;
const loja = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Eletro Center', ownerName: 'Renato', plan: null, mode: 'saas', rating90d: null,
  cancelRate30d: null, receiving: 'ok', situation: 'open', attention: false, nearbyCouriers: null, ...over,
});
const CONFIG = {
  commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5, motoboyCutPerDelivery: 5, motoboyCutPerKm: 1,
  motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10, motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10,
  cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, storeAcceptTimeoutMin: 10, poolTimeoutMin: 15,
  customerAbsentWaitMin: 15, lateCancellationFeePercent: 20, lateCancellationMotoboyShare: 50, cardFeePercent: 2.99,
  cardFeeFixed: 0.39, cardAnticipationMonthlyRate: 1.5, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5,
};

function routes(mode: 'direto' | 'custodia', items: unknown[] = [loja()]) {
  get.mockImplementation((url: string) => {
    if (url === '/settings/saas') return Promise.resolve({ data: { settlementMode: mode } });
    if (url.startsWith('/admin/stores')) return Promise.resolve({ data: { items, nextCursor: null, nearbyRadiusKm: 12 } });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { ...CONFIG, settlementMode: mode } });
    if (url === '/settings/pending-plan-changes') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => { jest.clearAllMocks(); __resetSaasConfigCache(); });

describe('admin no modo SaaS', () => {
  it('lista de lojas sem a coluna "Plano" quando o servidor manda plan null', async () => {
    routes('direto');
    renderAdminPage(<AdminLojasPage />, adminAuth('ceo', ['store:view_all']));
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(screen.queryByRole('columnheader', { name: 'Plano' })).not.toBeInTheDocument();
  });

  it('custódia: a coluna "Plano" continua', async () => {
    routes('custodia', [loja({ plan: 2, mode: 'custodia' })]);
    renderAdminPage(<AdminLojasPage />, adminAuth('ceo', ['store:view_all']));
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(screen.getByRole('columnheader', { name: 'Plano' })).toBeInTheDocument();
  });

  it('Configurações → Taxas sem "Comissão das lojas" no modo SaaS', async () => {
    routes('direto');
    renderAdminPage(<AdminSettings />, adminAuth('gerente_geral', ['settings:manage']));
    await screen.findByRole('region', { name: 'Entrega e motoboy' });
    expect(screen.queryByRole('region', { name: 'Comissão das lojas' })).not.toBeInTheDocument();
  });

  it('custódia: "Comissão das lojas" continua', async () => {
    routes('custodia');
    renderAdminPage(<AdminSettings />, adminAuth('gerente_geral', ['settings:manage']));
    expect(await screen.findByRole('region', { name: 'Comissão das lojas' })).toBeInTheDocument();
  });

  it('trocas de plano não abrem no modo SaaS (volta ao painel)', async () => {
    routes('direto');
    renderAdminPage(<PlanApprovals />, adminAuth('ceo'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(get).not.toHaveBeenCalledWith('/settings/pending-plan-changes');
  });
});
