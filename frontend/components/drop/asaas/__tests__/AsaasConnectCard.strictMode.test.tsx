import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasConnectCard } from '../AsaasConnectCard';
import api from '../../../../lib/api';

// Fix round 1 — M-1: em StrictMode (dev) o React monta, desmonta e monta de novo. O ref de
// "montado" precisa voltar a true no 2º mount, senão a resposta do termo é descartada e o
// aceite fica desabilitado para sempre.
jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const checklist = { apiKey: false, paymentWebhook: false, ipWhitelistConfirmed: false, authWebhookConfirmed: false };

test('StrictMode: o termo carrega e o aceite fica habilitado', async () => {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: '2026-10-08', text: 'Termo em StrictMode.' } });
    return Promise.resolve({ data: { success: true, data: { status: 'none', environment: null, lastCheckedAt: null, checklist } } });
  });
  render(<StrictMode><ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" /></ToastProvider></StrictMode>);
  expect(await screen.findByText('Termo em StrictMode.')).toBeInTheDocument();
  expect(screen.getByLabelText('Li e aceito o termo')).not.toBeDisabled();
});
