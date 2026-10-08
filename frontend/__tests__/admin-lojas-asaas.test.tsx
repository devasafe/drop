import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import AdminLojasAsaas from '../pages/admin/lojas-asaas';
import { AsaasConnectCard } from '../components/drop/asaas/AsaasConnectCard';
import { getNavItems } from '../lib/navConfig';
import { visibleAdminMenu } from '../lib/adminMenu';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/lojas-asaas' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'ceo', role: 'ceo', name: 'C' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const KEY = '$aact_hmlg_SEGREDO123456';
const none = { status: 'none', environment: null, lastCheckedAt: null, apiKeyLast4: null, checklist: { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false } };
const valid = { ...none, status: 'valid', environment: 'sandbox', apiKeyLast4: '3456', checklist: { ...none.checklist, apiKey: true } };
const lojas = [
  { storeId: 's1', name: 'Loja Um', status: 'valid', environment: 'sandbox', apiKeyLast4: '3456', lastCheckedAt: null },
  { storeId: 's2', name: 'Loja Dois', status: 'none', environment: null, apiKeyLast4: null, lastCheckedAt: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/admin/stores/asaas') return Promise.resolve({ data: { success: true, data: lojas } });
    if (url === '/settings/saas') return Promise.resolve({ data: { egressIp: '203.0.113.7' } });
    return Promise.resolve({ data: { success: true, data: none } });
  });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: none } });
});

test('lista as lojas e, ao selecionar, usa apiBase /admin/stores/<id>/asaas para conectar', async () => {
  render(<ToastProvider><AdminLojasAsaas /></ToastProvider>);
  fireEvent.click(await screen.findByText(/Loja Dois — Não conectada/));
  const input = await screen.findByLabelText('Chave de API do Asaas');
  fireEvent.change(input, { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('O lojista assinou este termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/stores/s2/asaas', { apiKey: KEY, acceptTerms: true }));
  expect(document.body.innerHTML).not.toContain('SEGREDO123456');
});

test('admin vê "Desconectar" e chama DELETE; lojista (sem allowDisconnect) não vê', async () => {
  window.confirm = jest.fn(() => true);
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  const { unmount } = render(<ToastProvider><AsaasConnectCard apiBase="/admin/stores/s1/asaas" storeId="s1" allowDisconnect /></ToastProvider>);
  fireEvent.click(await screen.findByText('Desconectar'));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin/stores/s1/asaas'));
  unmount();
  render(<ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" /></ToastProvider>);
  await screen.findByText('Chave válida');
  expect(screen.queryByText('Desconectar')).not.toBeInTheDocument();
});

describe('menu admin: Contas Asaas', () => {
  const allow = () => true;
  const has = (items: any[]) => items.some((i) => i.route === '/admin/lojas-asaas' || i.href === '/admin/lojas-asaas');
  test('só no modo direto e só para CEO', () => {
    expect(has(getNavItems('ceo', allow, true, { settlementMode: 'direto' }))).toBe(true);
    expect(has(getNavItems('ceo', allow, true, { settlementMode: 'custodia' }))).toBe(false);
    expect(has(visibleAdminMenu(allow, false))).toBe(false);
  });
});
