import { render, waitFor } from '@testing-library/react';

const mockHandlers: Record<string, (data?: any) => void> = {};
const mockSocket = {
  on: (event: string, h: (data?: any) => void) => { mockHandlers[event] = h; return () => undefined; },
  emit: jest.fn(),
  isConnected: false,
};
jest.mock('../../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
const mockAuth: { user: any } = { user: { _id: 'u1', activeRole: 'lojista' } };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
const mockNotify = jest.fn();
jest.mock('../../lib/notify', () => ({
  notify: (...a: any[]) => mockNotify(...a),
  primeAudio: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: { store: { _id: 's1' } } })) } }));
import RealtimeNotifier from '../RealtimeNotifier';

beforeEach(() => {
  mockNotify.mockClear();
  Object.keys(mockHandlers).forEach((k) => delete mockHandlers[k]);
  mockAuth.user = { _id: 'u1', activeRole: 'lojista' };
});

test('pedido novo abre o pedido na tela nova da loja', async () => {
  render(<RealtimeNotifier />);
  await waitFor(() => expect(mockHandlers.new_order).toBeDefined());
  mockHandlers.new_order({ orderId: 'o9' });
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'order', url: '/seller/pedido/o9', tag: 'new-order' }));
});

test('sem id do pedido, abre a aba Agora (nunca o /store-dashboard antigo)', async () => {
  render(<RealtimeNotifier />);
  await waitFor(() => expect(mockHandlers.new_order).toBeDefined());
  mockHandlers.new_order({});
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ url: '/seller/dashboard' }));
  expect(mockNotify).not.toHaveBeenCalledWith(expect.objectContaining({ url: '/store-dashboard' }));
});

test('motoboy segue com o aviso de entrega em /motoboy', async () => {
  mockAuth.user = { _id: 'u2', activeRole: 'motoboy' };
  render(<RealtimeNotifier />);
  await waitFor(() => expect(mockHandlers['delivery:available']).toBeDefined());
  mockHandlers['delivery:available']();
  expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ url: '/motoboy', tag: 'new-delivery' }));
});
