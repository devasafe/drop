// frontend/components/seller/asaas/__tests__/AsaasChecklist.test.tsx
// Porta de AsaasConnectCard.authStep + regras do token (exibido uma vez; confirmação antes de regerar).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasChecklist } from '../AsaasChecklist';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const base = { status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456', consent: { version: '2026-10-08', acceptedAt: '2026-10-08T12:00:00.000Z' }, termsVersion: '2026-10-08' };
const st = (checklist: any) => ({ ...base, checklist: { apiKey: true, paymentWebhook: true, ipWhitelistConfirmed: false, authWebhookConfirmed: false, ...checklist } });

function renderList(status: any, egressIp: string | null = '203.0.113.7') {
  const onStatus = jest.fn();
  render(<ToastProvider><AsaasChecklist apiBase="/stores/s1/asaas" storeId="s1" status={status} egressIp={egressIp} onStatus={onStatus} /></ToastProvider>);
  return onStatus;
}

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: st({ ipWhitelistConfirmed: true }) } });
});

test('passo 4 aponta para Mecanismos de segurança e avisa que não é a tela de Webhooks', () => {
  renderList(st({ ipWhitelistConfirmed: true }));
  expect(screen.getByText(/Mecanismos de segurança/)).toBeInTheDocument();
  expect(screen.getByText(/não em Integrações → Webhooks/)).toBeInTheDocument();
  expect(screen.getByText(/webhooks\/asaas\/loja\/s1\/autorizacao/)).toBeInTheDocument();
});

test('"Já liberei o IP" marca o passo 3', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: st({ ipWhitelistConfirmed: true }) } });
  const onStatus = renderList(st({}));
  expect(screen.getByText('203.0.113.7')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Já liberei o IP'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/checklist', { ipWhitelist: true }));
  expect(onStatus).toHaveBeenCalledWith(st({ ipWhitelistConfirmed: true }));
});

test('sem IP informado pela plataforma: avisa no lugar do endereço', () => {
  renderList(st({}), null);
  expect(screen.getByText('IP ainda não informado pela plataforma')).toBeInTheDocument();
});

test('fechar o sheet sem colar descarta o token da tela e não marca nada', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { token: 'TK_UNICO', url: 'http://x/webhooks/asaas/loja/s1/autorizacao' } } });
  renderList(st({ ipWhitelistConfirmed: true }));
  fireEvent.click(screen.getByText('Gerar token'));
  expect(await screen.findByText('TK_UNICO')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Fechar'));
  expect(screen.queryByText('TK_UNICO')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalledWith('/stores/s1/asaas/checklist', expect.anything());
});

test('tudo pronto: bloco verde', () => {
  renderList(st({ ipWhitelistConfirmed: true, authWebhookConfirmed: true }));
  expect(screen.getByText('Pronto para receber e pagar motoboys')).toBeInTheDocument();
  expect(screen.getByText('4 de 4')).toBeInTheDocument();
});

describe('regerar token com a trava já configurada (sheet no lugar do window.confirm)', () => {
  const configured = () => st({ ipWhitelistConfirmed: true, authWebhookConfirmed: true });

  test('clicar abre o sheet e NÃO chama a API', () => {
    renderList(configured());
    fireEvent.click(screen.getByText('Gerar token'));
    expect(screen.getByText('Gerar outro token?')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Cancelar fecha sem chamar a API', () => {
    renderList(configured());
    fireEvent.click(screen.getByText('Gerar token'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Gerar outro token?')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Confirmar chama auth-token uma vez e mostra o token novo uma vez', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { token: 'TK_NOVO', url: 'http://x/webhooks/asaas/loja/s1/autorizacao' } } });
    renderList(configured());
    fireEvent.click(screen.getByText('Gerar token'));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar outro token' }));
    expect(await screen.findByText('TK_NOVO')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/auth-token');
    expect(screen.getAllByText('TK_NOVO')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(screen.queryByText('TK_NOVO')).not.toBeInTheDocument();
  });
});

test('token já gerado na sessão (sheet fechado sem "Já colei"): gerar de novo pede confirmação antes da API', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { token: 'TK_1', url: 'http://x/webhooks/asaas/loja/s1/autorizacao' } } });
  renderList(st({ ipWhitelistConfirmed: true }));
  fireEvent.click(screen.getByText('Gerar token'));
  expect(await screen.findByText('TK_1')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Fechar'));
  (api.post as jest.Mock).mockClear();
  fireEvent.click(screen.getByText('Gerar token'));
  expect(screen.getByText('Gerar outro token?')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
