/**
 * Papel de equipe vira acréscimo (16/10): a equipe segue com papel ativo cliente. A lista de usuários
 * mostra e filtra pelo papel administrativo (de `roles`/`role`), e a folha "Papéis" vem com ele marcado
 * (salvar sem mudar nada fica desabilitado). Depois de salvar, a linha usa o usuário devolvido pelo servidor.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminUsersPage from '../pages/admin/users';
import api from '../lib/api';

const mockToast = jest.fn();
let mockUser: Record<string, unknown> = {};
let mockPerms: string[] = [];
const setRole = (role: string, perms: string[] = []) => {
  mockUser = { _id: 'me', id: 'me', name: 'Marina Rocha', email: 'marina@drop.app', role, activeRole: role };
  mockPerms = perms;
};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/users', asPath: '/admin/users' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: null,
    loading: false,
    permissionsLoading: false,
    can: (p: string) => (mockUser as { role?: string }).role === 'ceo' || mockPerms.includes(p),
  }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const USERS = [
  { _id: 'me', name: 'Marina Rocha', email: 'marina@drop.app', role: 'ceo', activeRole: 'ceo', status: 'active', createdAt: '2026-01-02T12:00:00Z' },
  { _id: 'u1', name: 'Ana Souza', email: 'ana.souza@gmail.com', role: 'cliente', status: 'active', createdAt: '2026-09-01T12:00:00Z' },
  { _id: 'u2', name: 'Bruno Alves', email: 'bruno@hotmail.com', role: 'cliente', status: 'blocked', blockReason: 'Fraude no cupom', createdAt: '2026-08-01T12:00:00Z' },
  { _id: 'u3', name: 'Renato Nunes', email: 'renato@eletrocenter.com.br', role: 'lojista', status: 'active', createdAt: '2026-07-01T12:00:00Z' },
  { _id: 'u4', name: 'Carlos Lima', email: 'carlos@gmail.com', role: 'motoboy', status: 'active', createdAt: '2026-06-01T12:00:00Z' },
  { _id: 'u5', name: 'Gil Gerente', email: 'gil@drop.app', role: 'gerente_geral', activeRole: 'cliente', roles: ['cliente', 'gerente_geral'], status: 'active', createdAt: '2026-05-01T12:00:00Z' },
  { _id: 'u6', name: 'Mia Marketing', email: 'mia@drop.app', role: 'marketing', activeRole: 'cliente', roles: ['cliente', 'marketing'], status: 'active', createdAt: '2026-04-01T12:00:00Z' },
];

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  (api.get as jest.Mock).mockResolvedValue({ data: USERS });
  (api.put as jest.Mock).mockResolvedValue({ data: {} });
});

describe('Usuários · equipe com papel ativo cliente', () => {
  it('mostra o papel administrativo e conta na aba "Equipe"', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Mia Marketing');
    expect(within(rowOf('Mia Marketing')).getByText('Marketing')).toBeInTheDocument();
    expect(within(rowOf('Gil Gerente')).getByText('Gerente geral')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Filtrar usuários' });
    expect(within(tabs).getByRole('tab', { name: /Equipe/ }).textContent).toBe('Equipe3');
    expect(within(tabs).getByRole('tab', { name: /Clientes/ }).textContent).toBe('Clientes2');
  });

  it('"Papéis" vem com o papel administrativo marcado (Salvar desabilitado)', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Mia Marketing');
    fireEvent.click(within(rowOf('Mia Marketing')).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    expect((within(dialog).getByRole('checkbox', { name: 'Marketing' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('depois de salvar, a linha usa o usuário devolvido pelo servidor (papel ativo cliente)', async () => {
    (api.put as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', role: 'marketing', activeRole: 'cliente', roles: ['cliente', 'marketing'] } },
    });
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(within(rowOf('Ana Souza')).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Marketing' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(rowOf('Ana Souza')).getByText('Marketing')).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Filtrar usuários' });
    expect(within(tabs).getByRole('tab', { name: /Equipe/ }).textContent).toBe('Equipe4');
  });
});
