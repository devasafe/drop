import { render } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerIntegrations from '../pages/seller/integrations';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/integrations' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    defaults: { baseURL: 'http://x/api' },
    get: jest.fn(() => Promise.resolve({ data: { keys: [], webhooks: [] } })),
    post: jest.fn(() => Promise.resolve({ data: { key: 'dk_test' } })),
    delete: jest.fn(() => Promise.resolve({ data: { ok: true } })),
  },
}));

test('renderiza a página de integrações sem quebrar', () => {
  const { getByText } = render(
    <ToastProvider>
      <SellerIntegrations />
    </ToastProvider>,
  );
  expect(getByText('Integrações (API)')).toBeInTheDocument();
});
