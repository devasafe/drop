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
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), delete: jest.fn(() => Promise.resolve({ data: { ok: true } })) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/integrations/keys') return Promise.resolve({ data: { keys: [{ id: 'k1', name: 'Bling ERP', prefix: 'drop_live_8f3a', scopes: ['read', 'write'], createdAt: '2026-10-01T10:00:00Z' }] } });
    if (url === '/integrations/webhooks') return Promise.resolve({ data: { webhooks: [{ id: 'w1', url: 'https://erp.loja.com/drop', active: true, failureCount: 0, createdAt: '2026-10-01T10:00:00Z' }] } });
    return Promise.resolve({ data: { products: [] } });
  });
});

const renderPage = async () => {
  render(<ToastProvider><SellerIntegrations /></ToastProvider>);
  fireEvent.click(await screen.findByText(/Conectar um sistema\/ERP/));
};

test('revogar chave pede confirmação num sheet (sem window.confirm); cancelar não chama a API', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm');
  await renderPage();
  fireEvent.click(await screen.findByText('Revogar'));
  expect(screen.getByText('Revogar esta chave?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancelar'));
  expect(api.delete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Revogar'));
  fireEvent.click(screen.getByText('Revogar chave'));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/integrations/keys/k1'));
  await waitFor(() => expect(screen.queryByText('Revogar esta chave?')).not.toBeInTheDocument());
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test('remover webhook também confirma no sheet', async () => {
  await renderPage();
  fireEvent.click(await screen.findByText('Remover'));
  expect(screen.getByText('Remover este webhook?')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Remover webhook'));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/integrations/webhooks/w1'));
  await waitFor(() => expect(screen.queryByText('Remover este webhook?')).not.toBeInTheDocument());
});
