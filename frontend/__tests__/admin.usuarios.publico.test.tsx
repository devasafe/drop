/**
 * Permissões por público (22/10): Usuários, a ficha, Carteiras e Verificações abrem com as chaves por público e
 * mostram só o público delas. O servidor recusa o resto (403 AUDIENCE_FORBIDDEN); a tela nem oferece.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminUsersPage from '../pages/admin/users';
import AdminWalletsPage from '../pages/admin/wallets';
import { adminAuth, renderAdminPage } from './helpers/adminPage';

const mockRouter = { push: jest.fn(), replace: jest.fn(), query: {}, isReady: true, pathname: '/admin/users', asPath: '/admin/users' };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const get = api.get as jest.Mock;
const tabNames = () => within(screen.getByRole('tablist', { name: 'Filtrar usuários' })).getAllByRole('tab').map((t) => t.textContent);

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/admin/users')) return Promise.resolve({ data: { items: [], nextCursor: null } });
    if (url === '/wallet-access/outgoing') return Promise.resolve({ data: { requests: [] } });
    if (url === '/admin/wallets') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

describe('Usuários por público', () => {
  it('só user:view_motoboys: abre a tela, mostra só a aba Motoboys e lê já com tab=motoboy', async () => {
    renderAdminPage(<AdminUsersPage />, adminAuth('cliente', ['user:view_motoboys']));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/users?tab=motoboy'));
    expect(tabNames()).toEqual(['Motoboys']);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('clientes e motoboys: Todos, Clientes e Motoboys (sem Lojistas, Equipe e Bloqueados)', async () => {
    renderAdminPage(<AdminUsersPage />, adminAuth('cliente', ['user:view_clients', 'user:view_motoboys']));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/users'));
    expect(tabNames()).toEqual(['Todos', 'Clientes', 'Motoboys']);
  });

  it('user:view_all: todas as abas, como antes', async () => {
    renderAdminPage(<AdminUsersPage />, adminAuth('gerente_geral', ['user:view_all']));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/users'));
    expect(tabNames()).toEqual(['Todos', 'Clientes', 'Lojistas', 'Motoboys', 'Equipe', 'Bloqueados']);
  });

  it('sem nenhuma chave de Usuários: sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminUsersPage />, adminAuth('cliente', ['theme:edit']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/admin\/users/));
  });
});

describe('Carteiras por público', () => {
  it('só wallet:view_motoboys: abre a tela e o filtro de papel oferece só Motoboys', async () => {
    renderAdminPage(<AdminWalletsPage />, adminAuth('cliente', ['wallet:view_motoboys']));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/wallets'));
    const select = screen.getByLabelText('Papel') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Todos os papéis', 'Motoboys']);
    fireEvent.change(select, { target: { value: 'motoboy' } });
    expect(select).toHaveValue('motoboy');
  });

  it('wallet:view_all: todos os papéis, como antes', async () => {
    renderAdminPage(<AdminWalletsPage />, adminAuth('gerente_geral', ['wallet:view_all']));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/wallets'));
    const select = screen.getByLabelText('Papel') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Todos os papéis', 'Clientes', 'Lojistas', 'Motoboys', 'CEOs']);
  });
});
