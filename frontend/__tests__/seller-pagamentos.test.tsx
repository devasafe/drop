import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerPagamentos from '../pages/seller/pagamentos';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/pagamentos' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const KEY = '$aact_hmlg_SEGREDO123456';
const none = { status: 'none', environment: null, lastCheckedAt: null, checklist: { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false } };
const valid = { status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456', checklist: { apiKey: true, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false } };

function mockGet(statusData: any, saas: any = { egressIp: '203.0.113.7' }) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/settings/saas') return Promise.resolve({ data: saas });
    return Promise.resolve({ data: { success: true, data: statusData } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet(none);
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
});

const renderPage = () => render(<ToastProvider><SellerPagamentos /></ToastProvider>);

test('campo da chave é password; conectar limpa a chave e ela não aparece na tela', async () => {
  renderPage();
  const input = (await screen.findByLabelText('Chave de API do Asaas')) as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: KEY } });
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY }));
  await screen.findByText('Chave válida');
  expect(input.value).toBe('');
  expect(screen.getByText('Chave ••••3456')).toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain('SEGREDO123456');
});

test('mostra o IP de saída, a URL de autorização e o botão de teste depois de conectar', async () => {
  mockGet(valid);
  renderPage();
  expect(await screen.findByText('203.0.113.7')).toBeInTheDocument();
  expect(screen.getByText('Testar configuração')).toBeInTheDocument();
  expect(screen.getByText('https://api.dropapp.com.br/webhooks/asaas/loja/s1/autorizacao')).toBeInTheDocument();
});

test('gerar token mostra uma vez e "Já copiei" some com ele', async () => {
  mockGet(valid, {});
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { token: 'tok123abc', url: 'https://api.dropapp.com.br/webhooks/asaas/loja/s1/autorizacao' } } });
  renderPage();
  fireEvent.click(await screen.findByText('Gerar token'));
  expect(await screen.findByText('tok123abc')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Já copiei'));
  await waitFor(() => expect(screen.queryByText('tok123abc')).not.toBeInTheDocument());
});
