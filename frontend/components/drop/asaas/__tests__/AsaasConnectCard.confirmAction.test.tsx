/** D3a · P3.4 · o admin troca o window.confirm do cartão por uma AdminSheet via confirmAction. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasConnectCard } from '../AsaasConnectCard';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const configured = {
  status: 'valid', environment: 'sandbox', lastCheckedAt: null, apiKeyLast4: '3456',
  checklist: { apiKey: true, paymentWebhook: true, ipWhitelistConfirmed: true, authWebhookConfirmed: true },
};

let confirmSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  confirmSpy = jest.spyOn(window, 'confirm');
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: 'v1', text: 'Termo.' } });
    return Promise.resolve({ data: { success: true, data: configured } });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { data: { token: 'tok', url: 'https://x/hook' } } });
});
afterEach(() => confirmSpy.mockRestore());

test('regerar token pergunta pelo confirmAction; "não" não chama a API, "sim" chama', async () => {
  const confirmAction = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  confirmSpy.mockImplementation(() => true);
  render(<ToastProvider><AsaasConnectCard apiBase="/admin/stores/s1/asaas" storeId="s1" confirmAction={confirmAction} /></ToastProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar token' }));
  await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
  expect(confirmAction.mock.calls[0][0]).toMatch(/^Gerar um novo token\?/);
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Gerar token' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/stores/s1/asaas/auth-token'));
  expect(confirmSpy).not.toHaveBeenCalled();
});

test('sem confirmAction continua o window.confirm de hoje', async () => {
  confirmSpy.mockImplementation(() => false);
  render(<ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" /></ToastProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Gerar token' }));
  await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
  expect(api.post).not.toHaveBeenCalled();
});
