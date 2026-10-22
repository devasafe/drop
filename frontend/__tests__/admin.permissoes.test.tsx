import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import AdminPermissoes from '../pages/admin/permissoes';

const mockRouter = { pathname: '/admin/permissoes', asPath: '/admin/permissoes', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'];
const PERMS = [
  { key: 'notification:create', label: 'Criar notificação', category: 'Notificações' },
  { key: 'broadcast:send', label: 'Enviar broadcast', category: 'Notificações' },
  { key: 'user:view_all', label: 'Ver todos os usuários', category: 'Usuários' },
  { key: 'wallet:credit', label: 'Creditar carteira (somente CEO, não delegável)', category: 'Carteira' },
  { key: 'settings:manage', label: 'Editar configurações da plataforma', category: 'Configurações' },
];
const role = (r: string, permissions: string[], isCustom = false) => ({ role: r, permissions, notificationTargets: [] as string[], isCustom });
const LIST = {
  allRoles: ROLES,
  allPermissions: PERMS,
  roles: [
    { role: 'ceo', permissions: ['*'], notificationTargets: ROLES, isCustom: false },
    role('marketing', ['notification:create'], true),
    role('gerente_geral', ['user:view_all']),
    role('gerente_clientes', []),
    role('gerente_lojistas', ['notification:create']),
    role('gerente_motoboys', []),
    role('lojista', []),
    role('cliente', []),
    role('motoboy', []),
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  (api.get as jest.Mock).mockResolvedValue({ data: LIST });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
});

describe('portão', () => {
  it('só o CEO abre: outro papel (mesmo com "*") sai da tela e nada é lido', async () => {
    renderAdminPage(<AdminPermissoes />, adminAuth('gerente_geral', ['*']));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('matriz (computador)', () => {
  it('uma coluna por papel editável (sem o CEO), com o título e o selo de customizado', async () => {
    renderAdminPage(<AdminPermissoes />);
    const table = await screen.findByRole('table', { name: 'Permissões por papel' });
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent ?? '');
    expect(heads[0]).toBe('Pode…');
    expect(heads.some((h) => h.startsWith('Gerente de lojistas'))).toBe(true);
    // Parte 2 (22/10): cliente, lojista e motoboy saíram da tela (padrão fixo do app; o servidor recusa editá-los).
    expect(heads.some((h) => h.startsWith('Gerente de motoboys'))).toBe(true);
    expect(heads.some((h) => h.startsWith('Motoboy') || h.startsWith('Cliente') || h.startsWith('Lojista'))).toBe(false);
    expect(heads.some((h) => h.startsWith('CEO'))).toBe(false);
    expect(heads.find((h) => h.startsWith('Marketing'))).toContain('Customizado');
    expect(screen.getByRole('heading', { name: 'Permissões' })).toBeInTheDocument();
  });

  it('"Creditar carteira" fica travado em todas as colunas (não delegável)', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    // Parte 2 (22/10): só as colunas da equipe (Cliente saiu da tela).
    for (const r of ['Marketing', 'Gerente geral', 'Gerente de motoboys']) {
      expect(screen.getByRole('checkbox', { name: `Creditar carteira (somente CEO, não delegável) · ${r}` })).toBeDisabled();
    }
  });

  it('marcar e desmarcar a mesma célula não deixa nada para salvar', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    const box = screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' });
    fireEvent.click(box);
    expect(screen.getByText('alterado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar 1 papel' })).toBeEnabled();
    fireEvent.click(box);
    expect(screen.queryByText('alterado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('salva um PUT por papel alterado, em sequência; o que falhou fica marcado e é o único reenviado', async () => {
    (api.put as jest.Mock).mockImplementation((url: string) =>
      url.endsWith('/marketing')
        ? Promise.reject({ response: { status: 400, data: { error: 'Permissões inexistentes: x' } } })
        : Promise.resolve({ data: { success: true } }),
    );
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Editar configurações da plataforma · Gerente de lojistas' }));
    expect(screen.getAllByText('alterado')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar 2 papéis' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('1 papel salvo, 1 com erro', 'error'));
    expect((api.put as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      '/role-permissions/marketing',
      '/role-permissions/gerente_lojistas',
    ]);
    expect(api.put).toHaveBeenCalledWith('/role-permissions/gerente_lojistas', {
      permissions: ['notification:create', 'settings:manage'],
      notificationTargets: [],
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Marketing: Permissões inexistentes: x');
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)); // relê depois do lote

    (api.put as jest.Mock).mockReset();
    (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar 1 papel' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith('/role-permissions/marketing', {
      permissions: ['notification:create', 'user:view_all'],
      notificationTargets: [],
    });
  });

  it('"Descartar" volta tudo ao salvo', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });
});

describe('avisos que cada papel pode enviar', () => {
  it('só habilita a coluna do papel que pode notificar (como hoje), e o alvo vai no PUT', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Avisos por papel' });
    expect(screen.getByRole('checkbox', { name: 'Avisar Motoboy · Gerente geral' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enviar broadcast · Gerente geral' }));
    const target = screen.getByRole('checkbox', { name: 'Avisar Motoboy · Gerente geral' });
    expect(target).toBeEnabled();
    fireEvent.click(target);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 papel' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/role-permissions/gerente_geral', {
        permissions: ['user:view_all', 'broadcast:send'],
        notificationTargets: ['motoboy'],
      }),
    );
  });
});

describe('restaurar padrão', () => {
  it('confirma na AdminSheet, apaga o papel, relê e mantém a mudança não salva de outro papel', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar o padrão de Gerente de lojistas' }));
    const dialog = screen.getByRole('dialog', { name: 'Restaurar o padrão de Gerente de lojistas?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/role-permissions/gerente_lojistas'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Salvar 1 papel' })).toBeEnabled();
  });

  it('erro do servidor aparece dentro da AdminSheet', async () => {
    (api.delete as jest.Mock).mockRejectedValue({ response: { status: 500, data: { error: 'Erro interno' } } });
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar o padrão de Marketing' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro interno');
  });
});

describe('falha de leitura', () => {
  it('mostra o erro com "Tentar de novo", nunca uma matriz vazia', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro interno' } } });
    renderAdminPage(<AdminPermissoes />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Permissões por papel' })).toBeInTheDocument();
  });
});

describe('falha ao reler com a matriz já na tela', () => {
  it('mostra o erro com "Tentar de novo" e mantém a matriz', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao reler' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar o padrão de Marketing' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Erro ao reler');
    expect(screen.getByRole('table', { name: 'Permissões por papel' })).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('table', { name: 'Permissões por papel' })).toBeInTheDocument();
  });
});

describe('celular (360 px)', () => {
  it('sem matriz: escolhe o papel e vê só a coluna dele', async () => {
    setViewportWidth(360);
    renderAdminPage(<AdminPermissoes />);
    const select = await screen.findByLabelText('Papel');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Marketing' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'gerente_lojistas' } });
    expect(screen.getByRole('checkbox', { name: 'Ver todos os usuários · Gerente de lojistas' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Ver todos os usuários · Marketing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Restaurar o padrão de Gerente de lojistas' })).toBeInTheDocument();
  });
});
