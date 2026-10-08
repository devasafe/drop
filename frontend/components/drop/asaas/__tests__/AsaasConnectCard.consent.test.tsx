import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasConnectCard } from '../AsaasConnectCard';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const KEY = '$aact_hmlg_SEGREDO123456';
const TERMS = 'Autorizo a DROP a usar a chave de API da minha conta Asaas.';
const checklist = { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };
const none = { status: 'none', environment: null, lastCheckedAt: null, checklist, consent: null, termsVersion: '2026-10-08' };
const valid = {
  status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456', checklist: { ...checklist, apiKey: true },
  consent: { version: '2026-10-08', acceptedAt: '2026-10-08T12:00:00.000Z' }, termsVersion: '2026-10-08',
};
const validNoConsent = { ...valid, consent: null };

function mockGet(statusData: any) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: '2026-10-08', text: TERMS } });
    return Promise.resolve({ data: { success: true, data: statusData } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet(none);
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
});

const renderCard = (props: Partial<React.ComponentProps<typeof AsaasConnectCard>> = {}) =>
  render(<ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" {...props} /></ToastProvider>);

test('mostra o termo e só habilita "Conectar" depois de marcar "Li e aceito o termo"; o PUT envia acceptTerms', async () => {
  renderCard();
  expect(await screen.findByText(TERMS)).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  const button = screen.getByText('Conectar').closest('button') as HTMLButtonElement;
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true }));
});

test('admin (allowDisconnect): rótulo "O lojista assinou este termo"', async () => {
  renderCard({ apiBase: '/admin/stores/s1/asaas', allowDisconnect: true });
  expect(await screen.findByLabelText('O lojista assinou este termo')).toBeInTheDocument();
  expect(screen.queryByLabelText('Li e aceito o termo')).not.toBeInTheDocument();
});

test('conta válida sem aceite: avisa para aceitar e o botão chama POST /consent', async () => {
  mockGet(validNoConsent);
  renderCard();
  expect(await screen.findByText(/Aceite o termo para voltar a vender/)).toBeInTheDocument();
  const accept = screen.getByText('Aceitar o termo').closest('button') as HTMLButtonElement;
  expect(accept).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(accept);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/consent', { acceptTerms: true }));
  await waitFor(() => expect(screen.queryByText(/Aceite o termo para voltar a vender/)).not.toBeInTheDocument());
});

test('conta válida com aceite em dia: sem aviso', async () => {
  mockGet(valid);
  renderCard();
  await screen.findByText('Chave válida');
  expect(screen.queryByText(/Aceite o termo para voltar a vender/)).not.toBeInTheDocument();
  expect(screen.queryByText('Aceitar o termo')).not.toBeInTheDocument();
});

test('aceite de versão antiga: só avisa que o termo foi atualizado (a loja segue vendendo)', async () => {
  mockGet({ ...valid, consent: { version: '2020-01-01', acceptedAt: '2020-01-01T00:00:00.000Z' } });
  renderCard();
  expect(await screen.findByText(/O termo foi atualizado/)).toBeInTheDocument();
  expect(screen.queryByText(/voltar a vender/)).not.toBeInTheDocument();
});
