/**
 * Vários papéis por pessoa: "Papéis" abre a folha com uma caixinha por papel e grava a lista
 * completa em PUT /admin/users/:id/roles. A coluna "Papel" mostra todos e a pessoa aparece em
 * toda aba que vale para ela.
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
  { _id: 'u1', name: 'Ana Souza', email: 'ana@x.com', role: 'cliente', roles: ['cliente'], status: 'active', createdAt: '2026-09-01T12:00:00Z' },
  { _id: 'u2', name: 'Rui Loja', email: 'rui@x.com', role: 'lojista', activeRole: 'lojista', roles: ['cliente', 'lojista'], status: 'active', createdAt: '2026-08-01T12:00:00Z' },
  { _id: 'u3', name: 'Téo Duplo', email: 'teo@x.com', role: 'motoboy', activeRole: 'motoboy', roles: ['cliente', 'motoboy', 'gerente_motoboys'], status: 'active', createdAt: '2026-07-01T12:00:00Z' },
  { _id: 'u4', name: 'Lia Legado', email: 'lia@x.com', role: 'lojista', activeRole: 'motoboy', roles: [], status: 'active', createdAt: '2026-06-01T12:00:00Z' },
];

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
const box = (dialog: HTMLElement, label: string) => within(dialog).getByRole('checkbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement;
const checkedLabels = (dialog: HTMLElement) =>
  within(dialog).getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).map((c) => c.closest('label')!.textContent);

async function openPapeis(name: string) {
  render(<AdminUsersPage />);
  await screen.findByText(name);
  fireEvent.click(within(rowOf(name)).getByRole('button', { name: 'Papéis' }));
  return screen.findByRole('dialog', { name: 'Papéis' });
}

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  (api.get as jest.Mock).mockResolvedValue({ data: USERS });
  (api.put as jest.Mock).mockResolvedValue({ data: {} });
});

describe('Usuários · folha "Papéis"', () => {
  it('uma caixinha por papel; marcadas = roles + role + activeRole + cliente', async () => {
    const dialog = await openPapeis('Lia Legado');
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(9);
    expect(box(dialog, 'Lojista').checked).toBe(true);
    expect(box(dialog, 'Motoboy').checked).toBe(true);
    expect(box(dialog, 'Cliente').checked).toBe(true);
    expect(box(dialog, 'CEO').checked).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('Cliente sempre marcado e travado, com a dica', async () => {
    const dialog = await openPapeis('Ana Souza');
    const cliente = box(dialog, 'Cliente');
    expect(cliente.checked).toBe(true);
    expect(cliente).toBeDisabled();
    expect(within(dialog).getByText('Todo mundo pode comprar')).toBeInTheDocument();
    expect(checkedLabels(dialog)).toHaveLength(1);
  });

  it('fora do CEO: caixinhas da equipe travadas, papéis base livres', async () => {
    setRole('gerente_geral', ['user:view_all', 'user:manage_roles']);
    const dialog = await openPapeis('Ana Souza');
    for (const l of ['CEO', 'Marketing', 'Gerente geral', 'Gerente de clientes', 'Gerente de lojistas', 'Gerente de motoboys']) {
      expect(box(dialog, l)).toBeDisabled();
    }
    expect(box(dialog, 'Lojista')).toBeEnabled();
    expect(box(dialog, 'Motoboy')).toBeEnabled();
  });

  it('envia a lista marcada, atualiza a linha e avisa', async () => {
    (api.put as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', role: 'cliente', activeRole: 'cliente', roles: ['cliente', 'lojista', 'gerente_lojistas'] } },
    });
    const dialog = await openPapeis('Ana Souza');
    fireEvent.click(box(dialog, 'Lojista'));
    fireEvent.click(box(dialog, 'Gerente de lojistas'));
    const salvar = within(dialog).getByRole('button', { name: 'Salvar' });
    expect(salvar).toBeEnabled();
    fireEvent.click(salvar);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/users/u1/roles', { roles: ['gerente_lojistas', 'lojista', 'cliente'] }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Papéis atualizados.', 'success');
    expect(within(rowOf('Ana Souza')).getByText('Gerente de lojistas · Lojista')).toBeInTheDocument();
  });

  it('desmarcar e marcar de volta deixa "Salvar" desabilitado', async () => {
    const dialog = await openPapeis('Rui Loja');
    fireEvent.click(box(dialog, 'Lojista'));
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled();
    fireEvent.click(box(dialog, 'Lojista'));
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it.each([
    ['lojista', 'Rui Loja', 'Lojista', 3, 'Esta pessoa tem 3 pedido(s) em aberto na loja. Termine ou repasse antes de tirar o papel de Lojista.'],
    ['motoboy', 'Téo Duplo', 'Motoboy', 1, 'Esta pessoa tem 1 entrega(s) em andamento. Termine ou repasse antes de tirar o papel de Motoboy.'],
  ])('409 ROLE_HAS_OPEN_WORK (%s): mensagem na folha, que continua aberta', async (role, name, label, count, msg) => {
    (api.put as jest.Mock).mockRejectedValue({
      response: { status: 409, data: { error: 'qualquer', code: 'ROLE_HAS_OPEN_WORK', role, count } },
    });
    const dialog = await openPapeis(name);
    fireEvent.click(box(dialog, label));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText(msg)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Papéis' })).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('outro erro usa o padrão da página (mensagem do servidor na folha)', async () => {
    (api.put as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'Lista de papéis inválida', code: 'INVALID_ROLES' } } });
    const dialog = await openPapeis('Ana Souza');
    fireEvent.click(box(dialog, 'Motoboy'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Lista de papéis inválida');
  });
});

describe('Usuários · coluna "Papel" e abas com vários papéis', () => {
  it('coluna mostra todos os papéis, sem Cliente quando há outro', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Téo Duplo');
    expect(within(rowOf('Téo Duplo')).getByText('Gerente de motoboys · Motoboy')).toBeInTheDocument();
    expect(within(rowOf('Rui Loja')).getByText('Lojista')).toBeInTheDocument();
    expect(within(rowOf('Ana Souza')).getByText('Cliente')).toBeInTheDocument();
    expect(within(rowOf('Lia Legado')).getByText('Lojista · Motoboy')).toBeInTheDocument();
  });

  it('motoboy + gerente aparece em Motoboys e em Equipe; Clientes só quem é só cliente', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Téo Duplo');
    const tabs = screen.getByRole('tablist', { name: 'Filtrar usuários' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Todos5', 'Clientes1', 'Lojistas2', 'Motoboys2', 'Equipe2', 'Bloqueados0',
    ]);
    fireEvent.click(within(tabs).getByRole('tab', { name: /Motoboys/ }));
    expect(screen.getByText('Téo Duplo')).toBeInTheDocument();
    fireEvent.click(within(tabs).getByRole('tab', { name: /Equipe/ }));
    expect(screen.getByText('Téo Duplo')).toBeInTheDocument();
    expect(screen.getByText('Marina Rocha')).toBeInTheDocument();
    expect(screen.queryByText('Rui Loja')).toBeNull();
  });
});
