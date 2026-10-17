/**
 * Papel de equipe vira acréscimo (16/10): quem tem marketing/gerente segue cliente (papel ativo)
 * e continua ouvindo `admin:notification` — o servidor já põe a conta na sala `admin` pela união.
 */
import { render } from '@testing-library/react';

const mockHandlers: Record<string, (data?: any) => void> = {};
const mockSocket = {
  on: (event: string, h: (data?: any) => void) => { mockHandlers[event] = h; return () => undefined; },
  emit: jest.fn(),
  isConnected: false,
};
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
const mockAuth: { user: any; teamRoles: string[] } = { user: null, teamRoles: [] };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
const mockNotify = jest.fn();
jest.mock('../../lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  primeAudio: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: {} })) } }));
import RealtimeNotifier from '../RealtimeNotifier';

beforeEach(() => {
  mockNotify.mockClear();
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
});

test('cliente com papel de equipe ouve admin:notification', () => {
  mockAuth.user = { _id: 'u1', activeRole: 'cliente', roles: ['cliente', 'marketing'] };
  mockAuth.teamRoles = ['marketing'];
  render(<RealtimeNotifier />);
  expect(mockHandlers['admin:notification']).toBeDefined();
  mockHandlers['admin:notification']({ title: 'Nova verificação', url: '/admin/verificacoes' });
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nova verificação' }));
});

test('cliente puro não ouve admin:notification', () => {
  mockAuth.user = { _id: 'u2', activeRole: 'cliente', roles: ['cliente'] };
  mockAuth.teamRoles = [];
  render(<RealtimeNotifier />);
  expect(mockHandlers['admin:notification']).toBeUndefined();
});
