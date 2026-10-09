import { render, screen } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { AsaasConnectCard } from '../AsaasConnectCard';
import api from '../../../../lib/api';

// Sandbox 2026-10-09: o lojista colou a URL da trava em Integrações → Webhooks (lugar errado).
// O passo 4 precisa dizer a tela exata do Asaas e avisar para NÃO usar a tela de Webhooks.
jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const checklist = { apiKey: true, paymentWebhook: true, ipWhitelistConfirmed: true, authWebhookConfirmed: false };

test('passo 4 aponta para Mecanismos de segurança e avisa que não é a tela de Webhooks', async () => {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-asaas-terms') return Promise.resolve({ data: { version: '2026-10-08', text: 'Termo.' } });
    return Promise.resolve({ data: { success: true, data: { status: 'valid', environment: 'sandbox', lastCheckedAt: null, consent: { termsVersion: '2026-10-08' }, termsVersion: '2026-10-08', checklist } } });
  });
  render(<ToastProvider><AsaasConnectCard apiBase="/stores/s1/asaas" storeId="s1" /></ToastProvider>);
  expect(await screen.findByText(/Mecanismos de segurança/)).toBeInTheDocument();
  expect(screen.getByText(/não em Integrações → Webhooks/)).toBeInTheDocument();
});
