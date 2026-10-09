import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SellerAssinatura from '../pages/seller/assinatura';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/x' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', storeId: 's1' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const billing = (over: any = {}) => ({
  status: 'trialing', trialEndsAt: '2026-11-20T12:00:00.000Z', paidUntil: null, fee: 49.9,
  nextPayment: null, blocked: false, pendingReason: null, ...over,
});
const mockBilling = (data: any) =>
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/saas-billing') return Promise.resolve({ data: { success: true, data } });
    return Promise.resolve({ data: {} });
  });

beforeEach(() => { jest.resetAllMocks(); });

describe('F6 — fatura pendente do documento do dono', () => {
  test('pendingReason owner_document → aviso com link para /verificacao', async () => {
    mockBilling(billing({ pendingReason: 'owner_document' }));
    render(<SellerAssinatura />);
    expect(await screen.findByText('Para gerar sua fatura, conclua a verificação do seu documento')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /verifica/i });
    expect(link).toHaveAttribute('href', '/verificacao');
  });

  test('sem pendingReason → sem aviso', async () => {
    mockBilling(billing());
    render(<SellerAssinatura />);
    expect(await screen.findByText('Teste grátis até 20/11/2026')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/conclua a verificação/)).not.toBeInTheDocument());
  });
});
