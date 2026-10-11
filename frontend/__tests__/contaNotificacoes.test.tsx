import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

let mockNotifs: any[] = [];
const enable = jest.fn(); const disable = jest.fn();
let mockPush: any = { supported: true, subscribed: false, busy: false, enable, disable };
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: mockNotifs, unreadCount: mockNotifs.filter((n) => !n.read).length, loading: false }) }));
jest.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => mockPush }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { patch: jest.fn(() => Promise.resolve({})) } }));
const patch = api.patch as jest.Mock;
import NotificacoesPage from '../pages/conta/notificacoes';

beforeEach(() => { patch.mockClear(); enable.mockClear(); mockPush = { supported: true, subscribed: false, busy: false, enable, disable }; });

test('por dia, não lida marcada; "Marcar lidas" chama a API', async () => {
  mockNotifs = [{ _id: 'n1', title: 'Seu pedido saiu para entrega', message: 'Carlos está a caminho', type: 'order', read: false, createdAt: new Date().toISOString() }];
  render(<NotificacoesPage />);
  expect(screen.getByRole('heading', { name: 'Notificações' })).toBeInTheDocument();
  expect(screen.getByText('Hoje')).toBeInTheDocument();
  expect(screen.getByText('Seu pedido saiu para entrega')).toBeInTheDocument();
  expect(screen.getByText('Não lida')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Marcar lidas' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/read-all'));
  expect(screen.queryByText('Não lida')).toBeNull();
});

test('tocar marca como lida', async () => {
  mockNotifs = [{ _id: 'n2', title: 'Aviso', message: 'Oi', type: 'broadcast', read: false, createdAt: new Date().toISOString() }];
  render(<NotificacoesPage />);
  fireEvent.click(screen.getByRole('button', { name: /Aviso/ }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/n2/read'));
});

test('vazio: tudo em dia; interruptor liga os avisos no celular', () => {
  mockNotifs = [];
  render(<NotificacoesPage />);
  expect(screen.getByText('Tudo em dia')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: /Avisos no celular/ }));
  expect(enable).toHaveBeenCalled();
});
