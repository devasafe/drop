// frontend/components/seller/asaas/__tests__/AsaasTermsKeyForm.test.tsx
// Porta das suítes do AsaasConnectCard (consent, termsVersion, strictMode) para o formulário de termo
// e chave da loja. As expectativas são as mesmas: termo fail-closed, versão EXIBIDA no PUT,
// 409 recarrega o texto e desmarca o aceite, chave em campo de senha e apagada depois de conectar.
import { StrictMode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasTermsKeyForm } from '../AsaasTermsKeyForm';
import { useAsaasTerms } from '../useAsaasTerms';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const KEY = '$aact_hmlg_SEGREDO123456';
const TERMS = 'Autorizo a DROP a usar a chave de API da minha conta Asaas.';
const checklist = { apiKey: true, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };
const valid = { status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456', checklist, consent: { version: '2026-10-08', acceptedAt: '2026-10-08T12:00:00.000Z' }, termsVersion: '2026-10-08' };
const outdated = { response: { status: 409, data: { success: false, error: { message: 'x', statusCode: 409, code: 'TERMS_VERSION_OUTDATED' } } } };

let termsResponses: any[];
function mockTerms() {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url !== '/settings/store-asaas-terms') return Promise.resolve({ data: {} });
    const next = termsResponses.length > 1 ? termsResponses.shift() : termsResponses[0];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve({ data: next });
  });
}

function Harness({ connected = false, onConnected }: { connected?: boolean; onConnected?: (s: any) => void }) {
  const terms = useAsaasTerms();
  return <AsaasTermsKeyForm apiBase="/stores/s1/asaas" terms={terms} connected={connected} onConnected={onConnected ?? (() => {})} />;
}
const renderForm = (props: any = {}) => render(<ToastProvider><Harness {...props} /></ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  termsResponses = [{ version: '2026-10-08', text: TERMS }];
  mockTerms();
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
});

test('mostra o termo e só habilita "Conectar" depois de marcar "Li e aceito o termo"; o PUT envia acceptTerms e a chave some', async () => {
  const onConnected = jest.fn();
  renderForm({ onConnected });
  expect(await screen.findByText(TERMS)).toBeInTheDocument();
  const input = screen.getByLabelText('Chave de API do Asaas') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input, { target: { value: KEY } });
  const button = screen.getByText('Conectar').closest('button') as HTMLButtonElement;
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  expect(button).not.toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-10-08' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith(valid));
  expect(input.value).toBe('');
  expect(document.body.innerHTML).not.toContain('SEGREDO123456');
});

test('conectar envia a versão do termo exibido (não a vigente do status)', async () => {
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.' }, { version: '2026-11-01', text: 'Termo novo.' }];
  renderForm();
  await screen.findByText('Termo antigo.');
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-10-08' }));
});

test('409 TERMS_VERSION_OUTDATED: avisa, desmarca o aceite e recarrega o texto; o novo aceite envia a versão nova', async () => {
  termsResponses = [{ version: '2026-10-08', text: 'Termo antigo.' }, { version: '2026-11-01', text: 'Termo novo.' }];
  (api.put as jest.Mock).mockRejectedValue(outdated);
  renderForm();
  await screen.findByText('Termo antigo.');
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  expect(await screen.findByText('Termo novo.')).toBeInTheDocument();
  expect(screen.queryByText('Termo antigo.')).not.toBeInTheDocument();
  expect((await screen.findAllByText('O termo foi atualizado, recarregue')).length).toBeGreaterThan(0);
  expect((screen.getByLabelText('Li e aceito o termo') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('Conectar').closest('button')).toBeDisabled();

  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: valid } });
  fireEvent.click(screen.getByLabelText('Li e aceito o termo'));
  fireEvent.click(screen.getByText('Conectar'));
  await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/stores/s1/asaas', { apiKey: KEY, acceptTerms: true, termsVersion: '2026-11-01' }));
});

test('termo não carregou: aceite desabilitado (fail closed) e o botão não libera nem com a chave', async () => {
  termsResponses = [new Error('rede')];
  renderForm({ connected: true });
  expect(await screen.findByText(/Não foi possível carregar o termo/)).toBeInTheDocument();
  const box = screen.getByLabelText('Li e aceito o termo') as HTMLInputElement;
  expect(box).toBeDisabled();
  fireEvent.click(box);
  expect(box.checked).toBe(false);
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  expect(screen.getByText('Trocar chave').closest('button')).toBeDisabled();
});

test('resposta do termo sem texto ou sem versão também desabilita o aceite', async () => {
  termsResponses = [{ version: '2026-10-08' }];
  const a = renderForm();
  expect(await screen.findByText(/Não foi possível carregar o termo/)).toBeInTheDocument();
  expect(screen.getByLabelText('Li e aceito o termo')).toBeDisabled();
  a.unmount();
  termsResponses = [{ text: 'Sem versão.' }];
  renderForm();
  expect(await screen.findByText(/Não foi possível carregar o termo/)).toBeInTheDocument();
  expect(screen.getByLabelText('Li e aceito o termo')).toBeDisabled();
});

test('StrictMode: o termo carrega e o aceite fica habilitado', async () => {
  termsResponses = [{ version: '2026-10-08', text: 'Termo em StrictMode.' }];
  render(<StrictMode><ToastProvider><Harness /></ToastProvider></StrictMode>);
  expect(await screen.findByText('Termo em StrictMode.')).toBeInTheDocument();
  expect(screen.getByLabelText('Li e aceito o termo')).not.toBeDisabled();
});

test('chave de sandbox é reconhecida pelo começo', async () => {
  renderForm();
  await screen.findByText(TERMS);
  fireEvent.change(screen.getByLabelText('Chave de API do Asaas'), { target: { value: KEY } });
  expect(screen.getByText('Sandbox · não recebe dinheiro de verdade')).toBeInTheDocument();
});

test('passo a passo das permissões da chave: Transferências e Extrato explicados', async () => {
  renderForm();
  const list = await screen.findByRole('list', { name: 'Permissões da chave' });
  expect(list).toHaveTextContent('todas as permissões');
  expect(list).toHaveTextContent('Transferências');
  expect(list).toHaveTextContent('Extrato e informações financeiras');
  expect(screen.getByText(/Integrações → Chaves de API → Gerar chave/)).toBeInTheDocument();
});
