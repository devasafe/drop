import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerIntegrations from '../pages/seller/integrations';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/integrations' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/integrations/keys') return Promise.resolve({ data: { keys: [
      { id: 'k1', name: 'Bling ERP', prefix: 'drop_live_8f3a', scopes: ['read'], lastUsedAt: ago(2 * 3600 * 1000), createdAt: '2026-10-01T10:00:00Z' },
      { id: 'k2', name: 'Planilha', prefix: 'drop_live_c21d', scopes: ['read'], createdAt: '2026-10-01T10:00:00Z' },
    ] } });
    if (url === '/integrations/webhooks') return Promise.resolve({ data: { webhooks: [{ id: 'w1', url: 'https://erp.loja.com/drop', active: true, failureCount: 0, lastStatus: 200, createdAt: '2026-10-01T10:00:00Z' }] } });
    return Promise.resolve({ data: { products: [{ id: 'p1', name: 'X', quantity: 1, price: 10, available: true }] } });
  });
});

test('ordem: abertura, Chaves de API, Webhook e só depois o CSV; sem emoji', async () => {
  const { container } = render(<ToastProvider><SellerIntegrations /></ToastProvider>);
  await screen.findByText('Bling ERP');
  const text = container.textContent || '';
  const pos = (s: string) => { const i = text.indexOf(s); expect(i).toBeGreaterThanOrEqual(0); return i; };
  const order = [pos('pode ignorar esta tela'), pos('Chaves de API'), pos('Webhook de estoque'), pos('Importar estoque por planilha'), pos('Exportar produtos (CSV)')];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
});

test('mostra "usada há X" e "nunca usada"', async () => {
  render(<ToastProvider><SellerIntegrations /></ToastProvider>);
  expect(await screen.findByText('usada há 2 h')).toBeInTheDocument();
  expect(screen.getByText('nunca usada')).toBeInTheDocument();
});

test('Testar chama a rota de teste do webhook', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { ok: true } });
  render(<ToastProvider><SellerIntegrations /></ToastProvider>);
  fireEvent.click(await screen.findByText('Testar'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/integrations/webhooks/w1/test'));
});
