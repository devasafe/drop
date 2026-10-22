/**
 * Caracterização de /admin/permissoes: o que a página pede ao servidor, com que corpo.
 * Passa na página antiga (um papel por vez, confirm) e na nova (matriz, AdminSheet).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { confirmIfAsked, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
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
];
const role = (r: string, permissions: string[]) => ({ role: r, permissions, notificationTargets: [] as string[], isCustom: false });
const LIST = {
  allRoles: ROLES,
  allPermissions: PERMS,
  roles: [
    { role: 'ceo', permissions: ['*'], notificationTargets: ROLES, isCustom: false },
    role('marketing', ['notification:create']),
    role('gerente_geral', ['user:view_all']),
    role('gerente_clientes', []),
    role('gerente_lojistas', ['notification:create']),
    role('gerente_motoboys', []),
    role('lojista', []),
    role('cliente', []),
    role('motoboy', []),
  ],
};

/** Antiga: escolhe o papel na lista lateral. Nova: a matriz já mostra todos (não há botão com esse nome). */
function pickRole(name: RegExp) {
  const btn = screen.queryByRole('button', { name });
  if (btn) fireEvent.click(btn);
}

/** Antiga: um checkbox por permissão (do papel escolhido). Nova: um por permissão × papel. */
function cell(perm: string, roleLabel: string): HTMLElement {
  const all = screen.getAllByRole('checkbox', { name: new RegExp(`^${perm}`) });
  return all.length === 1 ? all[0] : screen.getByRole('checkbox', { name: `${perm} · ${roleLabel}` });
}

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockResolvedValue({ data: LIST });
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
});

it('lê todos os papéis numa chamada só', async () => {
  renderAdminPage(<AdminPermissoes />);
  await screen.findAllByRole('checkbox');
  // 22/10: a prévia do menu também lê o modo da plataforma (/settings/saas); os papéis continuam numa chamada só.
  expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/role-permissions')).toHaveLength(1);
  expect(api.get).toHaveBeenCalledWith('/role-permissions');
});

it('salvar: PUT do papel com a lista inteira de permissões e os avisos', async () => {
  renderAdminPage(<AdminPermissoes />);
  await screen.findAllByRole('checkbox');
  pickRole(/^Gerente de Lojistas$/i);
  fireEvent.click(cell('Ver todos os usuários', 'Gerente de lojistas'));
  fireEvent.click(screen.getByRole('button', { name: /^Salvar/ }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  expect(api.put).toHaveBeenCalledWith('/role-permissions/gerente_lojistas', {
    permissions: ['notification:create', 'user:view_all'],
    notificationTargets: [],
  });
});

it('restaurar padrão: DELETE do papel e lê tudo de novo', async () => {
  renderAdminPage(<AdminPermissoes />);
  await screen.findAllByRole('checkbox');
  const column = screen.queryByRole('button', { name: /Restaurar o padrão de Gerente de lojistas/i });
  if (column) {
    fireEvent.click(column);
  } else {
    pickRole(/^Gerente de Lojistas$/i);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
  }
  await confirmIfAsked('Restaurar padrão');
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/role-permissions/gerente_lojistas'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});
