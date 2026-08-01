import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationsPage from '../pages/notifications';

const del = jest.fn().mockResolvedValue({});
const patch = jest.fn().mockResolvedValue({});
let mockNotifs: any[] = [];

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' }, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { patch: (...a: any[]) => patch(...a), delete: (...a: any[]) => del(...a) } }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: mockNotifs, loading: false }) }));

beforeEach(() => { del.mockClear(); patch.mockClear(); });

describe('Notificações (/notifications)', () => {
  it('mostra título, grupo por dia e a mensagem', () => {
    mockNotifs = [{ _id: 'n1', title: 'Pedido', message: 'Seu pedido saiu', type: 'order', read: false, createdAt: new Date().toISOString() }];
    render(<NotificationsPage />);
    expect(screen.getByText('Notificações')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Seu pedido saiu')).toBeInTheDocument();
  });
  it('excluir chama a API de delete', async () => {
    mockNotifs = [{ _id: 'n1', message: 'X', type: 'system', read: true, createdAt: new Date().toISOString() }];
    render(<NotificationsPage />);
    fireEvent.click(screen.getByLabelText(/remover/i));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/notifications/n1'));
  });
  it('estado vazio quando não há notificações', () => {
    mockNotifs = [];
    render(<NotificationsPage />);
    expect(screen.getByText(/nenhuma notifica/i)).toBeInTheDocument();
  });
});
