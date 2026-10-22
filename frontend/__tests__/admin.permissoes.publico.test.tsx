/**
 * Permissões por público (22/10): cada caixinha diz o que libera ("Abre:", "Ação em:", "Uso no app"), a caixinha
 * de ação sem a chave que abre a tela avisa "Sozinha não aparece no painel" e a prévia do menu do papel usa a
 * mesma função do menu (visibleAdminAreas), mudando ao marcar e desmarcar.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import { __resetSaasConfigCache } from '../hooks/useSaasConfig';
import AdminPermissoes from '../pages/admin/permissoes';

const mockRouter = { pathname: '/admin/permissoes', asPath: '/admin/permissoes', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const ROLES = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy'];
const PERMS = [
  { key: 'user:view_all', label: 'Ver todos os usuários', category: 'Usuários', kind: 'opens', area: 'usuarios' },
  { key: 'user:view_motoboys', label: 'Ver motoboys', category: 'Usuários', kind: 'opens', area: 'usuarios', audience: 'motoboys' },
  {
    key: 'user:edit_motoboys', label: 'Bloquear, desbloquear e desconectar motoboys', category: 'Usuários',
    kind: 'action', area: 'usuarios', audience: 'motoboys', requires: ['user:view_motoboys', 'user:view_all'],
  },
  { key: 'store:view_all', label: 'Ver todas as lojas', category: 'Lojas', kind: 'opens', area: 'lojas', tab: 'lojas' },
  { key: 'store:edit', label: 'Pausar e liberar lojas', category: 'Lojas', kind: 'action', area: 'lojas', requires: ['store:view_all'] },
  { key: 'wallet:view_motoboys', label: 'Ver carteiras de motoboys', category: 'Carteira', kind: 'opens', area: 'dinheiro', tab: 'carteiras', audience: 'motoboys' },
  { key: 'theme:edit', label: 'Editar temas sazonais', category: 'Marketing', kind: 'opens', area: 'tema' },
  { key: 'store:view_own', label: 'Ver própria loja', category: 'Uso no app', kind: 'app' },
];
const role = (r: string, permissions: string[]) => ({ role: r, permissions, notificationTargets: [] as string[], isCustom: false });
const LIST = {
  allRoles: ROLES,
  allPermissions: PERMS,
  roles: [
    { role: 'ceo', permissions: ['*'], notificationTargets: ROLES, isCustom: false },
    role('marketing', ['theme:edit']),
    role('gerente_geral', ['user:view_all', 'store:view_all']),
    role('gerente_clientes', []),
    role('gerente_lojistas', []),
    role('gerente_motoboys', ['user:edit_motoboys', 'theme:edit']),
    role('lojista', []),
    role('cliente', []),
    role('motoboy', []),
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  __resetSaasConfigCache();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/settings/saas' ? { settlementMode: 'custodia' } : LIST }));
});

const preview = () => screen.getByRole('region', { name: 'Prévia do menu deste papel' });
const previewItems = () => within(preview()).queryAllByRole('listitem').map((li) => li.textContent);

describe('o que cada caixinha libera', () => {
  it('mostra "Abre:", "Ação em:" e "Uso no app" ao lado da caixinha', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    expect(screen.getByText('Abre: Usuários (motoboys)')).toBeInTheDocument();
    expect(screen.getByText('Abre: Usuários')).toBeInTheDocument();
    expect(screen.getByText('Abre: Lojas · Todas as lojas')).toBeInTheDocument();
    expect(screen.getByText('Abre: Dinheiro · Carteiras (motoboys)')).toBeInTheDocument();
    expect(screen.getByText('Ação em: Lojas · precisa de Ver todas as lojas')).toBeInTheDocument();
    expect(screen.getByText('Ação em: Usuários (motoboys) · precisa de Ver motoboys ou Ver todos os usuários')).toBeInTheDocument();
    expect(screen.getByText('Uso no app (fora do painel)')).toBeInTheDocument();
  });

  it('caixinha de ação sem a chave que abre a tela: "Sozinha não aparece no painel"; some ao marcar a que abre', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    expect(screen.getAllByText('Sozinha não aparece no painel')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver motoboys · Gerente de motoboys' }));
    expect(screen.queryByText('Sozinha não aparece no painel')).toBeNull();
  });

  it('no celular também: rótulo e aviso no papel escolhido', async () => {
    setViewportWidth(393);
    renderAdminPage(<AdminPermissoes />);
    fireEvent.change(await screen.findByLabelText('Papel'), { target: { value: 'gerente_motoboys' } });
    expect(screen.getByText('Ação em: Lojas · precisa de Ver todas as lojas')).toBeInTheDocument();
    expect(screen.getByText('Sozinha não aparece no painel')).toBeInTheDocument();
  });
});

describe('prévia do menu deste papel', () => {
  it('lista o que o papel vê e muda ao marcar e desmarcar', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.change(within(preview()).getByLabelText('Papel da prévia'), { target: { value: 'gerente_motoboys' } });
    // Tema sazonal marcado sem querer aparece antes de salvar; a ação sozinha não abre nada.
    await waitFor(() => expect(previewItems()).toEqual(['Tema sazonal']));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver motoboys · Gerente de motoboys' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver carteiras de motoboys · Gerente de motoboys' }));
    expect(previewItems()).toEqual(['Usuários', 'Dinheiro · Carteiras', 'Tema sazonal']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Editar temas sazonais · Gerente de motoboys' }));
    expect(previewItems()).toEqual(['Usuários', 'Dinheiro · Carteiras']);
  });

  it('marcar uma caixinha leva a prévia para o papel dela', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver todas as lojas · Gerente de lojistas' }));
    expect(within(preview()).getByLabelText('Papel da prévia')).toHaveValue('gerente_lojistas');
    expect(previewItems()).toEqual(['Lojas · Todas as lojas']);
  });

  it('papel sem nenhuma tela: "Nada no painel"', async () => {
    renderAdminPage(<AdminPermissoes />);
    await screen.findByRole('table', { name: 'Permissões por papel' });
    fireEvent.change(within(preview()).getByLabelText('Papel da prévia'), { target: { value: 'cliente' } });
    expect(within(preview()).getByText('Nada no painel')).toBeInTheDocument();
  });
});
