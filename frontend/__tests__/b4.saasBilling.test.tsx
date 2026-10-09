import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerAssinatura from '../pages/seller/assinatura';
import AdminFreios from '../pages/admin/freios';
import AdminLojasAsaas from '../pages/admin/lojas-asaas';
import SaasBillingBanner from '../components/drop/SaasBillingBanner';
import { getNavItems } from '../lib/navConfig';
import api from '../lib/api';

let mockRole = 'lojista';
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/x' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: mockRole, role: mockRole, storeId: 's1' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/drop/settlement/SettlementSwitchCard', () => ({ SettlementSwitchCard: () => null }));
jest.mock('../components/drop/asaas/AsaasConnectCard', () => ({ AsaasConnectCard: () => null }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ loading: false, hasLeftover: false }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const billing = (over: any = {}) => ({
  status: 'trialing', trialEndsAt: '2026-11-20T12:00:00.000Z', paidUntil: null, fee: 49.9,
  nextPayment: null, blocked: false, ...over,
});
const mockBilling = (data: any) =>
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/saas-billing') return Promise.resolve({ data: { success: true, data } });
    return Promise.resolve({ data: {} });
  });

beforeEach(() => { jest.resetAllMocks(); mockRole = 'lojista'; });

describe('seller/assinatura', () => {
  test('trialing', async () => {
    mockBilling(billing());
    render(<SellerAssinatura />);
    expect(await screen.findByText('Teste grátis até 20/11/2026')).toBeInTheDocument();
    expect(screen.getByText('R$ 49,90')).toBeInTheDocument();
    expect(screen.queryByText('Pagar fatura')).not.toBeInTheDocument();
  });
  test('active', async () => {
    mockBilling(billing({ status: 'active', paidUntil: '2026-12-05T12:00:00.000Z' }));
    render(<SellerAssinatura />);
    expect(await screen.findByText('Em dia — pago até 05/12/2026')).toBeInTheDocument();
  });
  test('past_due mostra Pagar fatura com a invoiceUrl', async () => {
    mockBilling(billing({ status: 'past_due', nextPayment: { dueDate: '2026-11-10T12:00:00.000Z', value: 49.9, invoiceUrl: 'https://asaas.test/i/1', status: 'OVERDUE' } }));
    render(<SellerAssinatura />);
    const link = await screen.findByText('Pagar fatura');
    expect(link.closest('a')).toHaveAttribute('href', 'https://asaas.test/i/1');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/Pagamento atrasado/)).toBeInTheDocument();
    expect(screen.getByText('10/11/2026')).toBeInTheDocument();
  });
  test('paused', async () => {
    mockBilling(billing({ status: 'paused', blocked: true }));
    render(<SellerAssinatura />);
    expect(await screen.findByText(/Loja pausada — pague para voltar a receber pedidos/)).toBeInTheDocument();
  });
});

describe('banner do painel', () => {
  test('past_due mostra aviso com link; trialing não; erro é silencioso', async () => {
    mockBilling(billing({ status: 'past_due' }));
    const { unmount } = render(<SaasBillingBanner storeId="s1" />);
    const a = await screen.findByText(/Ver assinatura/);
    expect(a.closest('a')).toHaveAttribute('href', '/seller/assinatura');
    unmount();
    mockBilling(billing());
    const r2 = render(<SaasBillingBanner storeId="s1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(r2.container).toBeEmptyDOMElement();
    r2.unmount();
    (api.get as jest.Mock).mockRejectedValue(new Error('x'));
    const r3 = render(<SaasBillingBanner storeId="s1" />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(r3.container).toBeEmptyDOMElement();
  });
});

describe('navConfig', () => {
  const labels = (mode: string) => getNavItems('lojista', () => true, false, { settlementMode: mode } as any).map((i) => i.label);
  test('Assinatura só no modo direto', () => {
    expect(labels('direto')).toContain('Assinatura');
    expect(labels('custodia')).not.toContain('Assinatura');
  });
});

describe('admin/freios — Mensalidade SaaS', () => {
  const sw = { rankingPrizesEnabled: false, benefitsRedeemEnabled: false, gamificationPointsEnabled: false, settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false };
  beforeEach(() => {
    (api.get as jest.Mock).mockResolvedValue({ data: sw });
    (api.put as jest.Mock).mockResolvedValue({ data: { ...sw, saasMonthlyFee: 59.9, saasTrialDays: 7, saasGraceDays: 3, directTransfersEnabled: true } });
  });
  test('CEO salva os 4 campos', async () => {
    mockRole = 'ceo';
    render(<AdminFreios />);
    fireEvent.change(await screen.findByLabelText('Valor padrão (R$)'), { target: { value: '59,90' } });
    fireEvent.change(screen.getByLabelText('Dias de teste'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Dias de tolerância'), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText('Pix automático ao motoboy'));
    fireEvent.click(screen.getByText('Salvar mensalidade'));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', {
      saasMonthlyFee: 59.9, saasTrialDays: 7, saasGraceDays: 3, directTransfersEnabled: true,
    }));
  });
  test('não-CEO não vê o card', async () => {
    mockRole = 'admin';
    render(<AdminFreios />);
    await screen.findByText('Freios da plataforma');
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText('Mensalidade SaaS')).not.toBeInTheDocument();
  });
});

describe('admin/lojas-asaas — valor especial', () => {
  const lojas = [{ storeId: 's1', name: 'Loja Um', status: 'valid', environment: 'sandbox', apiKeyLast4: '3456', lastCheckedAt: null }];
  const sb = [{ storeId: 's1', storeName: 'Loja Um', status: 'past_due', trialEndsAt: null, paidUntil: '2026-12-05T12:00:00.000Z', customFee: null, fee: 49.9, hasSubscription: true, blocked: false }];
  beforeEach(() => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/admin/stores/asaas') return Promise.resolve({ data: { success: true, data: lojas } });
      if (url === '/admin/stores/saas-billing') return Promise.resolve({ data: { success: true, data: sb } });
      return Promise.resolve({ data: {} });
    });
    (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { storeId: 's1', customFee: 20, fee: 20, hasSubscription: true } } });
  });
  test('CEO vê status e edita valor especial', async () => {
    mockRole = 'ceo';
    render(<ToastProvider><AdminLojasAsaas /></ToastProvider>);
    expect(await screen.findByText(/Mensalidade: Atrasada/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 49,90/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Valor especial de Loja Um'), { target: { value: '20' } });
    fireEvent.click(screen.getByText('Salvar valor'));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/stores/s1/saas-billing', { customFee: 20 }));
  });
  test('campo vazio envia customFee null; erro do backend aparece', async () => {
    mockRole = 'ceo';
    (api.put as jest.Mock).mockRejectedValue({ response: { data: { error: 'Asaas recusou' } } });
    render(<ToastProvider><AdminLojasAsaas /></ToastProvider>);
    fireEvent.change(await screen.findByLabelText('Valor especial de Loja Um'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Valor especial de Loja Um'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Salvar valor'));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/stores/s1/saas-billing', { customFee: null }));
    expect(await screen.findByText('Asaas recusou')).toBeInTheDocument();
  });
  test('não-CEO não vê o campo', async () => {
    mockRole = 'admin';
    render(<ToastProvider><AdminLojasAsaas /></ToastProvider>);
    await screen.findByText(/Mensalidade: Atrasada/);
    expect(screen.queryByLabelText('Valor especial de Loja Um')).not.toBeInTheDocument();
  });
});
