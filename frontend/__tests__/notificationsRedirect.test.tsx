import { render } from '@testing-library/react';
import { ROUTES } from '../lib/routes';

const redirect = jest.fn();
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: (to: string | null) => redirect(to) }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' }, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { patch: jest.fn(() => Promise.resolve({})), delete: jest.fn() } }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: [], loading: false }) }));
import NotificationsPage from '../pages/notifications';

test('/notifications manda só o cliente para /conta/notificacoes', () => {
  render(<NotificationsPage />);
  expect(redirect).toHaveBeenCalledWith(ROUTES.notificacoes);
  expect(ROUTES.notificacoes).toBe('/conta/notificacoes');
});
