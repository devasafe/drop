/**
 * D3a · P3.1 · caracterização de /admin/users: as chamadas ao servidor, com método e corpo.
 * Escrito contra a página antiga e mantido SEM mudança na nova. Os nomes que mudaram de propósito
 * ("Role" → "Trocar papel" → "Papéis") vão como alternativa na mesma busca. A troca de papel virou a lista
 * completa de papéis (PUT /admin/users/:id/roles), então esse teste foi reescrito para as caixinhas.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminUsersPage from '../pages/admin/users';
import api from '../lib/api';

const mockMe = { _id: 'me', id: 'me', name: 'Marina Rocha', email: 'marina@drop.app', role: 'ceo', activeRole: 'ceo' };

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/users', asPath: '/admin/users' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, token: null, loading: false, permissionsLoading: false, can: () => true }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const USERS = [
  { _id: 'u1', name: 'Ana Souza', email: 'ana@x.com', role: 'cliente', status: 'active', createdAt: '2026-09-01T12:00:00Z' },
  { _id: 'u2', name: 'Bruno Alves', email: 'bruno@x.com', role: 'cliente', status: 'blocked', blockReason: 'Fraude', createdAt: '2026-08-01T12:00:00Z' },
];

/** Resposta paginada de GET /admin/users (D3b-2a): itens com `id` e o cursor da próxima página. */
const page = (list: Array<{ _id: string }>, nextCursor: string | null = null) => ({
  data: { items: list.map((u) => ({ ...u, id: u._id })), nextCursor },
});

/** O botão de confirmar é o último com aquele nome (o modal/sheet vem depois da tabela no DOM). */
const last = (name: string | RegExp) => {
  const all = screen.getAllByRole('button', { name });
  return all[all.length - 1];
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue(page(USERS));
  (api.put as jest.Mock).mockResolvedValue({ data: { user: { roles: ['lojista'] } } });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
});

test('carrega a lista com GET /admin/users, 100 por página', async () => {
  render(<AdminUsersPage />);
  expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/admin/users', { params: { limit: 100 } });
});

test('segue o nextCursor até a última página', async () => {
  (api.get as jest.Mock)
    .mockResolvedValueOnce(page([USERS[0]], 'c1'))
    .mockResolvedValueOnce(page([USERS[1]]));
  render(<AdminUsersPage />);
  expect(await screen.findByText('Bruno Alves')).toBeInTheDocument();
  expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get).toHaveBeenNthCalledWith(2, '/admin/users', { params: { limit: 100, cursor: 'c1' } });
});

test('papéis: PUT /admin/users/:id/roles { roles } com a lista marcada', async () => {
  render(<AdminUsersPage />);
  await screen.findByText('Ana Souza');
  fireEvent.click(screen.getAllByRole('button', { name: /^(Role|Trocar papel|Papéis)$/ })[0]);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Lojista' }));
  fireEvent.click(last('Salvar'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/u1/roles', { roles: ['lojista', 'cliente'] }));
});

test('bloquear: PUT /admin/users/:id/status { status: blocked, reason } com o motivo aparado', async () => {
  render(<AdminUsersPage />);
  await screen.findByText('Ana Souza');
  fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
  fireEvent.change(await screen.findByPlaceholderText(/fraude detectada/i), { target: { value: '  Fraude no cupom  ' } });
  fireEvent.click(last('Bloquear'));
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith('/admin/users/u1/status', { status: 'blocked', reason: 'Fraude no cupom' }),
  );
});

test('desbloquear: PUT /admin/users/:id/status { status: active }', async () => {
  render(<AdminUsersPage />);
  await screen.findByText('Bruno Alves');
  fireEvent.click(screen.getAllByRole('button', { name: 'Desbloquear' })[0]);
  fireEvent.click(last('Desbloquear'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/u2/status', { status: 'active' }));
});

test('desconectar: POST /admin/users/:id/disconnect sem corpo', async () => {
  render(<AdminUsersPage />);
  await screen.findByText('Ana Souza');
  fireEvent.click(screen.getAllByRole('button', { name: 'Desconectar' })[0]);
  fireEvent.click(last('Desconectar'));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect((api.post as jest.Mock).mock.calls[0]).toEqual(['/admin/users/u1/disconnect']);
});
