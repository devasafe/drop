import { render } from '@testing-library/react';

const mockReplace = jest.fn();
const mockPatch = jest.fn(() => Promise.resolve({}));
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

test('motoboy continua na tela e com o read-all de hoje', () => {
  mockRole = 'motoboy';
  render(<NotificationsPage />);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockPatch).toHaveBeenCalledWith('/notifications/read-all');
});
