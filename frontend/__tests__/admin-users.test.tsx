/**
 * D3a · P3.1 · Usuários (tela 10): abas por papel, busca na tela, ações em AdminSheet por permissão,
 * fail closed na leitura e cartões no celular.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminUsersPage from '../pages/admin/users';
import api from '../lib/api';
import { resetViewport, setViewportWidth } from './helpers/viewport';

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
  { _id: 'u5', name: 'Gil Gerente', email: 'gil@drop.app', role: 'gerente_geral', roles: ['cliente', 'gerente_geral'], status: 'active', createdAt: '2026-05-01T12:00:00Z' },
];

/** Resposta paginada de GET /admin/users (D3b-2a): itens com `id` e o cursor da próxima página. */
const page = (list: Array<{ _id: string }>, nextCursor: string | null = null) => ({
  data: { items: list.map((u) => ({ ...u, id: u._id })), nextCursor },
});

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  (api.get as jest.Mock).mockResolvedValue(page(USERS));
  (api.put as jest.Mock).mockResolvedValue({ data: {} });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
});
afterEach(() => resetViewport());

describe('Usuários · lista', () => {
  it('abas por papel com contagem, "Equipe" e "Bloqueados"', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    const tabs = screen.getByRole('tablist', { name: 'Filtrar usuários' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Todos6', 'Clientes2', 'Lojistas1', 'Motoboys1', 'Equipe2', 'Bloqueados1',
    ]);
    fireEvent.click(within(tabs).getByRole('tab', { name: /Equipe/ }));
    expect(screen.getByText('Gil Gerente')).toBeInTheDocument();
    expect(screen.getByText('Marina Rocha')).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).toBeNull();
    fireEvent.click(within(tabs).getByRole('tab', { name: /Bloqueados/ }));
    expect(screen.getByText('Bruno Alves')).toBeInTheDocument();
    expect(screen.getByText('Fraude no cupom')).toBeInTheDocument();
    expect(screen.queryByText('Renato Nunes')).toBeNull();
  });

  it('busca por nome e e-mail na tela, sem nova leitura', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    const busca = screen.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' });
    fireEvent.change(busca, { target: { value: 'eletrocenter' } });
    expect(screen.getByText('Renato Nunes')).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).toBeNull();
    fireEvent.change(busca, { target: { value: 'ANA' } });
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    fireEvent.change(busca, { target: { value: 'ninguém' } });
    expect(screen.getByText('Ninguém encontrado com essa busca')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('a própria conta: "Você" e "Sua conta", sem botão', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Marina Rocha');
    const row = rowOf('Marina Rocha');
    expect(within(row).getByText('Você')).toBeInTheDocument();
    expect(within(row).getByText('Sua conta')).toBeInTheDocument();
    expect(within(row).queryAllByRole('button')).toEqual([]);
  });

  it('leitura que falha: erro com "Tentar de novo", sem abas e sem "vazio"', async () => {
    (api.get as jest.Mock)
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'Failed to fetch users' } } })
      .mockResolvedValueOnce(page(USERS));
    render(<AdminUsersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar os usuários.');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Nenhum usuário nesta aba')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
  });
});

describe('Usuários · permissão dos botões (mesma da rota do servidor)', () => {
  it.each([
    [['user:view_all'], []],
    [['user:view_all', 'user:block'], ['Bloquear', 'Desconectar']],
    [['user:view_all', 'user:manage_roles'], ['Papéis']],
  ])('gerente com %j vê %j na linha de um cliente', async (perms, expected) => {
    setRole('gerente_geral', perms);
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    expect(within(rowOf('Ana Souza')).queryAllByRole('button').map((b) => b.textContent)).toEqual(expected);
  });

  it('fora do CEO: não mexe nos papéis de quem é da equipe e não libera papel da equipe', async () => {
    setRole('gerente_geral', ['user:view_all', 'user:manage_roles']);
    render(<AdminUsersPage />);
    await screen.findByText('Gil Gerente');
    expect(within(rowOf('Gil Gerente')).queryByRole('button', { name: 'Papéis' })).toBeNull();
    fireEvent.click(within(rowOf('Ana Souza')).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    const enabled = within(dialog).getAllByRole('checkbox').filter((c) => !(c as HTMLInputElement).disabled);
    expect(enabled.map((c) => c.closest('label')!.textContent)).toEqual(['Lojista', 'Motoboy']);
  });
});

describe('Usuários · ações na AdminSheet', () => {
  it('CEO muda os papéis: todos os papéis, "Salvar" só com mudança, toast e a linha muda', async () => {
    (api.put as jest.Mock).mockResolvedValue({ data: { user: { role: 'cliente', activeRole: 'cliente', roles: ['cliente', 'lojista'] } } });
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(within(rowOf('Ana Souza')).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes).toHaveLength(9);
    expect(boxes.filter((c) => (c as HTMLInputElement).disabled)).toHaveLength(1); // só Cliente
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Lojista' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/u1/roles', { roles: ['lojista', 'cliente'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Papéis atualizados.', 'success');
    expect(within(rowOf('Ana Souza')).getByText('Lojista')).toBeInTheDocument();
  });

  it('bloquear: motivo obrigatório; erro do servidor dentro da sheet; sucesso marca "Bloqueado"', async () => {
    (api.put as jest.Mock)
      .mockRejectedValueOnce({ response: { status: 400, data: { error: 'Invalid status' } } })
      .mockResolvedValueOnce({ data: {} });
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(within(rowOf('Ana Souza')).getByRole('button', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bloquear conta' });
    const btn = within(dialog).getByRole('button', { name: 'Bloquear' });
    expect(btn).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: '  Fraude  ' } });
    fireEvent.click(btn);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Invalid status');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.put).toHaveBeenLastCalledWith('/admin/users/u1/status', { status: 'blocked', reason: 'Fraude' });
    expect(within(rowOf('Ana Souza')).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(rowOf('Ana Souza')).getByText('Fraude')).toBeInTheDocument();
  });

  it('403 numa ação: "Você não tem permissão para isso" dentro da sheet', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Permissão negada' } } });
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    fireEvent.click(within(rowOf('Ana Souza')).getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar sessão' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  });

  it('desbloquear mostra o motivo anterior e volta a "Ativo"', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('Bruno Alves');
    fireEvent.click(within(rowOf('Bruno Alves')).getByRole('button', { name: 'Desbloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desbloquear conta' });
    expect(within(dialog).getByText(/Fraude no cupom/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/u2/status', { status: 'active' }));
    await waitFor(() => expect(within(rowOf('Bruno Alves')).getByText('Ativo')).toBeInTheDocument());
  });
});

describe('Usuários · celular (360 px)', () => {
  it('vira cartões com as ações no cartão', async () => {
    setViewportWidth(360);
    render(<AdminUsersPage />);
    await screen.findByText('Ana Souza');
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Usuários' })).getAllByRole('listitem');
    expect(cards).toHaveLength(6);
    expect(within(cards[1]).getByText('Ana Souza')).toBeInTheDocument();
    expect(within(cards[1]).getByRole('button', { name: 'Bloquear' }).className).toContain('touch');
  });
});
