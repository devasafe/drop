// frontend/components/seller/asaas/__tests__/AsaasNewTerms.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasNewTerms } from '../AsaasNewTerms';
import { useAsaasTerms } from '../useAsaasTerms';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const checklist = { apiKey: true, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };
const valid = { status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456', checklist, consent: { version: '2026-10-08', acceptedAt: '2026-10-08T12:00:00.000Z' }, termsVersion: '2026-10-08' };
const validNoConsent = { ...valid, consent: null };
const outdatedStatus = { ...valid, consent: { version: '2020-01-01', acceptedAt: '2020-01-01T12:00:00.000Z' } };
const outdated409 = { response: { status: 409, data: { success: false, error: { message: 'x', statusCode: 409, code: 'TERMS_VERSION_OUTDATED' } } } };

let termsResponses: any[];
beforeEach(() => {
  jest.clearAllMocks();
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.', changes: ['Limite por Pix ao motoboy: R$ 150,00.'] }];
  (api.get as jest.Mock).mockImplementation(() => {
    const next = termsResponses.length > 1 ? termsResponses.shift() : termsResponses[0];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
});

function Harness({ status, blocking, onStatus }: any) {
  const terms = useAsaasTerms();
  return (
    <>
      <AsaasNewTerms apiBase="/stores/s1/asaas" terms={terms} status={status} blocking={blocking} onStatus={onStatus} />
      <button type="button" onClick={() => { terms.reload(); }}>recarregar-termo</button>
    </>
  );
}
const renderNew = (status: any, blocking: boolean, onStatus = jest.fn()) => {
  render(<ToastProvider><Harness status={status} blocking={blocking} onStatus={onStatus} /></ToastProvider>);
  return onStatus;
};

test('sem aceite: avisa que os pedidos Pix pararam e o botão chama POST /consent com a versão exibida', async () => {
  const onStatus = renderNew(validNoConsent, true);
  expect(await screen.findByText(/Aceite o termo para voltar a vender/)).toBeInTheDocument();
  expect(screen.getByText('Limite por Pix ao motoboy: R$ 150,00.')).toBeInTheDocument();
  const accept = screen.getByText('Aceitar o termo').closest('button') as HTMLButtonElement;
  expect(accept).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(accept);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/consent', { acceptTerms: true, termsVersion: '2026-10-08' }));
  expect(onStatus).toHaveBeenCalledWith(valid);
});

test('aceite de versão antiga: só avisa que o termo foi atualizado (a loja segue vendendo)', async () => {
  renderNew(outdatedStatus, false);
  expect(await screen.findByText(/O termo foi atualizado/)).toBeInTheDocument();
  expect(screen.queryByText(/voltar a vender/)).not.toBeInTheDocument();
  expect(screen.getByText('Versão anterior')).toBeInTheDocument();
  expect(screen.getByText(/Aceita em/)).toBeInTheDocument();
});

test('termo não carregou: checkbox e botão de aceite desabilitados (fail closed)', async () => {
  termsResponses = [new Error('rede')];
  renderNew(validNoConsent, true);
  expect(await screen.findByText(/Não foi possível carregar o termo/)).toBeInTheDocument();
  const box = screen.getByLabelText('Li e aceito o termo') as HTMLInputElement;
  expect(box).toBeDisabled();
  fireEvent.click(box);
  expect(box.checked).toBe(false);
  expect(screen.getByText('Aceitar o termo').closest('button')).toBeDisabled();
});

test('aceite com 409: avisa e recarrega o texto', async () => {
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.' }, { version: '2026-11-01', text: 'Termo novo.' }];
  (api.post as jest.Mock).mockRejectedValue(outdated409);
  renderNew(validNoConsent, true);
  await screen.findByText('Termo antigo.');
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Aceitar o termo'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/asaas/consent', { acceptTerms: true, termsVersion: '2026-10-08' }));
  expect(await screen.findByText('Termo novo.')).toBeInTheDocument();
  expect(await screen.findByText('O termo foi atualizado, recarregue')).toBeInTheDocument();
});

test('o aceite é amarrado à versão exibida: se o texto recarrega com outra versão, o aceite volta a desmarcado', async () => {
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.' }, { version: '2026-11-01', text: 'Termo novo.' }];
  renderNew(validNoConsent, true);
  await screen.findByText('Termo antigo.');
  const box = screen.getByLabelText('Li e aceito o termo') as HTMLInputElement;
  fireEvent.click(box);
  expect(box.checked).toBe(true);
  fireEvent.click(screen.getByText('recarregar-termo'));
  expect(await screen.findByText('Termo novo.')).toBeInTheDocument();
  expect((screen.getByLabelText('Li e aceito o termo') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('Aceitar o termo').closest('button')).toBeDisabled();
  fireEvent.click(screen.getByText('Aceitar o termo'));
  expect(api.post).not.toHaveBeenCalled();
});
