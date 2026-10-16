/**
 * D3a · P3.3 · caracterização de /admin/plan-approvals: as leituras e os corpos de aprovar e recusar.
 * Escrito contra a página antiga e mantido SEM mudança na nova. Os nomes que mudaram de propósito
 * ("Rejeitar" → "Recusar com motivo", "Confirmar Rejeição" → "Recusar") vão como alternativa.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlanApprovals from '../pages/admin/plan-approvals';
import api from '../lib/api';

const mockMe = { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' };

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/plan-approvals', asPath: '/admin/plan-approvals' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, token: null, loading: false, permissionsLoading: false, can: () => true }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const PEDIDO = {
  _id: 'sub1', storeName: 'Papelaria Central', currentPlan: 'plan1', requestedPlan: 'plan2',
  planChangeStatus: 'pending', requestedAt: '2026-10-13T12:00:00.000Z', commissionRate: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation(() => Promise.resolve({ data: [PEDIDO] }));
  (api.post as jest.Mock).mockResolvedValue({ data: { subscription: { ...PEDIDO, planChangeStatus: 'none' } } });
});

test('lê os pedidos pendentes e todas as assinaturas', async () => {
  render(<PlanApprovals />);
  await screen.findAllByText(/Papelaria Central/);
  expect((api.get as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual([
    '/settings/all-store-subscriptions',
    '/settings/pending-plan-changes',
  ]);
});

test('aprovar: POST /settings/approve-plan-change { subscriptionId }', async () => {
  render(<PlanApprovals />);
  fireEvent.click(await screen.findByRole('button', { name: /^Aprovar/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/approve-plan-change', { subscriptionId: 'sub1' }));
});

test('recusar: POST /settings/reject-plan-change { subscriptionId, reason }', async () => {
  render(<PlanApprovals />);
  fireEvent.click(await screen.findByRole('button', { name: /^(Rejeitar|Recusar com motivo)$/ }));
  fireEvent.change(await screen.findByPlaceholderText(/Plano não corresponde ao perfil da loja/), { target: { value: 'Loja sem vendas' } });
  fireEvent.click(screen.getByRole('button', { name: /^(Confirmar Rejeição|Recusar)$/ }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith('/settings/reject-plan-change', { subscriptionId: 'sub1', reason: 'Loja sem vendas' }),
  );
});
