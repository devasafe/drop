import { render } from '@testing-library/react';

const mockReplace = jest.fn();
const mockPatch = jest.fn((..._args: unknown[]) => Promise.resolve({}));
let mockRole = 'lojista';
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', activeRole: mockRole }, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { patch: (...a: any[]) => mockPatch(...a), delete: jest.fn() } }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: [], loading: false }) }));
import NotificationsPage from '../pages/notifications';

beforeEach(() => { mockReplace.mockClear(); mockPatch.mockClear(); });

test('lojista em /notifications vai para /seller/notificacoes sem marcar tudo como lido', () => {
  mockRole = 'lojista';
  render(<NotificationsPage />);
  expect(mockReplace).toHaveBeenCalledWith('/seller/notificacoes');
  expect(mockPatch).not.toHaveBeenCalledWith('/notifications/read-all');
});

test('motoboy em /notifications vai para /motoboy/notificacoes sem marcar tudo como lido', () => {
  mockRole = 'motoboy';
  render(<NotificationsPage />);
  expect(mockReplace).toHaveBeenCalledWith('/motoboy/notificacoes');
  expect(mockPatch).not.toHaveBeenCalledWith('/notifications/read-all');
});

test('admin continua na tela antiga, com o read-all de hoje', () => {
  mockRole = 'ceo';
  render(<NotificationsPage />);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockPatch).toHaveBeenCalledWith('/notifications/read-all');
});
