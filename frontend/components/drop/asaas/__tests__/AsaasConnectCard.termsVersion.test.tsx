import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasConnectCard } from '../AsaasConnectCard';
import api from '../../../../lib/api';

// Lote pré-deploy 2 — item B (R25): o aceite envia a versão do termo EXIBIDO; se o servidor
// responder 409 TERMS_VERSION_OUTDATED, a tela avisa e recarrega o texto novo.
jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const KEY = '$aact_hmlg_SEGREDO123456';
const checklist = { apiKey: true, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };
const none = { status: 'none', environment: null, lastCheckedAt: null, checklist, consent: null, termsVersion: '2026-11-01' };
const validNoConsent = { ...none, status: 'valid', environment: 'sandbox', apiKeyLast4: '3456' };
const outdated = { response: { status: 409, data: { success: false, error: { message: 'x', statusCode: 409, code: 'TERMS_VERSION_OUTDATED' } } } };

let termsResponses: Array<{ version: string; text: string }>;
function mockGet(statusData: any) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-asaas-terms') {
      const next = termsResponses.length > 1 ? termsResponses.shift()! : termsResponses[0];
      return Promise.resolve({ data: next });
    }
    return Promise.resolve({ data: { success: true, data: statusData } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.' }, { version: '2026-11-01', text: 'Termo novo.' }];
});

const renderCard = () => render(<ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" /></ToastProvider>);

test('conectar envia a versão do termo exibido (não a vigente do status)', async () => {
  mockGet(none);
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: validNoConsent } });
  renderCard();
  await screen.findByText('Termo antigo.');
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-10-08' }));
});

test('conectar com 409 TERMS_VERSION_OUTDATED: mostra o aviso, desmarca o aceite e recarrega o texto', async () => {
  mockGet(none);
  (api.put as jest.Mock).mockRejectedValue(outdated);
  renderCard();
  await screen.findByText('Termo antigo.');
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  expect(await screen.findByText('Termo novo.')).toBeInTheDocument();
  expect(screen.queryByText('Termo antigo.')).not.toBeInTheDocument();
  expect((await screen.findAllByText('O termo foi atualizado, recarregue')).length).toBeGreaterThan(0);
  expect((screen.getByLabelText('Li e aceito o termo') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('Conectar').closest('button')).toBeDisabled();

  // o novo aceite envia a versão nova
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: validNoConsent } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-11-01' }));
});

test('aceite avulso com 409: avisa e recarrega o texto', async () => {
  mockGet(validNoConsent);
  (api.post as jest.Mock).mockRejectedValue(outdated);
  renderCard();
  await screen.findByText('Termo antigo.');
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Aceitar o termo'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/consent', { acceptTerms: true, termsVersion: '2026-10-08' }));
  expect(await screen.findByText('Termo novo.')).toBeInTheDocument();
  expect(await screen.findByText('O termo foi atualizado, recarregue')).toBeInTheDocument();
});

test('resposta do termo sem versão: aceite desabilitado (fail closed)', async () => {
  termsResponses = [{ text: 'Sem versão.' } as any];
  mockGet(none);
  renderCard();
  expect(await screen.findByText(/Não foi possível carregar o termo/)).toBeInTheDocument();
  expect(screen.getByLabelText('Li e aceito o termo')).toBeDisabled();
});
