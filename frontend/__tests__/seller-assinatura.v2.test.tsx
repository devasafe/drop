// frontend/__tests__/seller-assinatura.v2.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import SellerAssinatura from '../pages/seller/assinatura';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/assinatura' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', storeId: 's1' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ loading: false, hasLeftover: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const billing = (over: any = {}) => ({
  status: 'active', trialEndsAt: null, paidUntil: '2026-11-17T12:00:00.000Z', fee: 149,
  nextPayment: null, blocked: false, pendingReason: null, payments: [], blockAt: null, ...over,
});
const mockBilling = (data: any) =>
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/saas-billing') return Promise.resolve({ data: { success: true, data } });
    return Promise.resolve({ data: {} });
  });

beforeEach(() => jest.resetAllMocks());

test('faturas pagas com mês, data do pagamento e recibo', async () => {
  mockBilling(billing({ payments: [{ id: 'p1', value: 149, dueDate: '2026-09-17T12:00:00.000Z', paidAt: '2026-09-15T12:00:00.000Z', invoiceUrl: 'https://asaas.test/r/1' }] }));
  render(<SellerAssinatura />);
  expect(await screen.findByText('Setembro de 2026')).toBeInTheDocument();
  expect(screen.getByText('Paga em 15/09/2026')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Recibo' })).toHaveAttribute('href', 'https://asaas.test/r/1');
});

test('atrasada: data-limite da pausa vinda do servidor (blockAt)', async () => {
  mockBilling(billing({
    status: 'past_due', blockAt: '2026-11-15T12:00:00.000Z',
    nextPayment: { dueDate: '2026-11-10T12:00:00.000Z', value: 149, invoiceUrl: 'https://asaas.test/i/1', status: 'OVERDUE' },
  }));
  render(<SellerAssinatura />);
  expect(await screen.findByText(/Pague até 15\/11\/2026 para a sua loja não ser pausada/)).toBeInTheDocument();
  expect(screen.getByText('Pagar fatura').closest('a')).toHaveAttribute('href', 'https://asaas.test/i/1');
});

test('teste grátis: dias que faltam', async () => {
  mockBilling(billing({ status: 'trialing', paidUntil: null, trialEndsAt: new Date(Date.now() + 9 * 86400000).toISOString() }));
  render(<SellerAssinatura />);
  expect(await screen.findByText('Faltam 9 dias')).toBeInTheDocument();
});

test('isenta: sem mensalidade', async () => {
  mockBilling(billing({ fee: 0 }));
  render(<SellerAssinatura />);
  expect(await screen.findByText('Sua loja não paga mensalidade')).toBeInTheDocument();
});

test('sem style inline', () => {
  const src = fs.readFileSync(path.join(__dirname, '../pages/seller/assinatura.tsx'), 'utf8');
  expect(src).not.toMatch(/style=\{\{/);
});
