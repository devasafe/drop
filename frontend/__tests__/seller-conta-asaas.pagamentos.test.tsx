// frontend/__tests__/seller-conta-asaas.pagamentos.test.tsx
// Porta de __tests__/seller-pagamentos.test.tsx (o AsaasConnectCard virou a página Conta Asaas).
// Mesmos dados, mesmas chamadas e as mesmas regras: chave como senha e fora da tela depois de conectar;
// IP de saída; teste; token mostrado uma vez; confirmação antes de regerar (agora num sheet).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerContaAsaas from '../pages/seller/conta-asaas';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/conta-asaas' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
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
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: '2026-10-08', text: 'Termo de teste.' } });
    return Promise.resolve({ data: { success: true, data: statusData } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet(none);
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
});

const renderPage = () => render(<ToastProvider><SellerContaAsaas /></ToastProvider>);

test('campo da chave é password; conectar tira a chave da tela', async () => {
  renderPage();
  const input = (await screen.findByLabelText('Chave de API do Asaas')) as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-10-08' }));
  await screen.findByText('Chave válida');
  expect(document.body.contains(input) ? input.value : '').toBe('');
  expect(screen.getByText('Chave ••••3456')).toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain('SEGREDO123456');
});

test('mostra o IP de saída, o botão de teste e o item 4 (autorização) depois de conectar', async () => {
  mockGet(valid);
  renderPage();
  expect(await screen.findByText('203.0.113.7')).toBeInTheDocument();
  expect(screen.getByText('Testar configuração')).toBeInTheDocument();
  expect(screen.getByText(/webhooks\/asaas\/loja\/s1\/autorizacao/)).toBeInTheDocument();
  expect(screen.getByText(/Gerar token da trava de autorização/)).toBeInTheDocument();
});

test('regerar token com autorização já configurada pede confirmação; cancelar não chama a API', async () => {
  const confirmed = { ...valid, checklist: { ...valid.checklist, authWebhookConfirmed: true } };
  mockGet(confirmed, {});
  renderPage();
  fireEvent.click(await screen.findByText('Gerar token'));
  expect(screen.getByText(/deixa de valer/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancelar'));
  expect(api.post).not.toHaveBeenCalledWith('/stores/s1/asaas/auth-token');
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { token: 'TK_NOVO', url: 'u' } } });
  fireEvent.click(screen.getByText('Gerar token'));
  fireEvent.click(screen.getByText('Gerar outro token'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/auth-token'));
});

test('gerar token: botão desabilitado durante a chamada', async () => {
  mockGet(valid, {});
  let resolve: (v: any) => void = () => {};
  (api.post as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  renderPage();
  const btn = await screen.findByText('Gerar token');
  fireEvent.click(btn);
  await waitFor(() => expect(screen.getByText('Gerar token').closest('button')).toBeDisabled());
  resolve({ data: { success: true, data: { token: 'T', url: 'u' } } });
  await screen.findByText('T');
});

test('gerar token: chama /auth-token, mostra o token uma vez e some ao confirmar que colou', async () => {
  mockGet(valid, {});
  (api.post as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/s1/asaas/auth-token') return Promise.resolve({ data: { success: true, data: { token: 'TOKEN_AUTH_UNICO_123', url: 'http://x/webhooks/asaas/loja/s1/autorizacao' } } });
    return Promise.resolve({ data: { success: true, data: { ...valid, checklist: { ...valid.checklist, authWebhookConfirmed: true } } } });
  });
  renderPage();
  fireEvent.click(await screen.findByText('Gerar token'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/auth-token'));
  expect(await screen.findByText('TOKEN_AUTH_UNICO_123')).toBeInTheDocument();
  expect(screen.getByText(/não será mostrado de novo/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Já colei no Asaas'));
  await waitFor(() => expect(screen.queryByText('TOKEN_AUTH_UNICO_123')).not.toBeInTheDocument());
  expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/checklist', { authWebhook: true });
});
