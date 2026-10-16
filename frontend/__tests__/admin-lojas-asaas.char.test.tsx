/**
 * D3a · P3.4 · caracterização de /admin/lojas-asaas: as três leituras, o cartão Asaas montado com a rota
 * do admin e o PUT do valor especial. Escrito contra a página antiga e mantido SEM mudança na nova.
 * O botão da loja muda de nome ("Loja Um — Chave válida (••••3456)" → "Loja Um"): busca pelo começo.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminLojasAsaas from '../pages/admin/lojas-asaas';
import api from '../lib/api';

const mockMe = { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' };
const mockCard = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/lojas-asaas', asPath: '/admin/lojas-asaas' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, token: null, loading: false, permissionsLoading: false, can: () => true }),
}));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/drop/asaas/AsaasConnectCard', () => ({
  AsaasConnectCard: (p: Record<string, unknown>) => { mockCard(p); return <div data-testid="asaas-card" />; },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const LOJAS = [{ storeId: 's1', name: 'Loja Um', status: 'valid', environment: 'sandbox', apiKeyLast4: '3456', lastCheckedAt: null }];
const SB = [{ storeId: 's1', status: 'active', trialEndsAt: null, paidUntil: '2026-12-05T12:00:00.000Z', customFee: null, fee: 49.9 }];

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/admin/stores/asaas') return Promise.resolve({ data: { success: true, data: LOJAS } });
    if (url === '/admin/stores/saas-billing') return Promise.resolve({ data: { success: true, data: SB } });
    if (url === '/settings/saas') return Promise.resolve({ data: { egressIp: '203.0.113.7' } });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { storeId: 's1', customFee: 12.5, fee: 12.5 } } });
});

test('lê as lojas, as mensalidades e o IP de saída', async () => {
  render(<AdminLojasAsaas />);
  await screen.findByRole('button', { name: /^Loja Um/ });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  expect((api.get as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual([
    '/admin/stores/asaas', '/admin/stores/saas-billing', '/settings/saas',
  ]);
});

test('escolher a loja monta o cartão com a rota do admin, a loja e o IP', async () => {
  render(<AdminLojasAsaas />);
  fireEvent.click(await screen.findByRole('button', { name: /^Loja Um/ }));
  await waitFor(() =>
    expect(mockCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiBase: '/admin/stores/s1/asaas', storeId: 's1', egressIp: '203.0.113.7' }),
    ));
});

test('valor especial: PUT /admin/stores/:id/saas-billing { customFee } com vírgula', async () => {
  render(<AdminLojasAsaas />);
  fireEvent.click(await screen.findByRole('button', { name: /^Loja Um/ }));
  fireEvent.change(await screen.findByLabelText('Valor especial de Loja Um'), { target: { value: '12,5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar valor' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/stores/s1/saas-billing', { customFee: 12.5 }));
});
