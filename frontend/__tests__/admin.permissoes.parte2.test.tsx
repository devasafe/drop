/**
 * Permissões, Parte 2 (22/10): a tela é só da equipe. O CEO aparece fixo ("Tem todas as permissões"); cliente,
 * lojista e motoboy não aparecem. As caixinhas vêm agrupadas pelo menu (Dinheiro com subgrupos) e cada permissão e
 * cada papel têm um "?" que abre a explicação (textos do catálogo do backend).
 */
import { fireEvent, screen, within } from '@testing-library/react';
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

const TEAM = ['marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'];
const ALL = ['ceo', ...TEAM, 'lojista', 'cliente', 'motoboy'];
const PERMS = [
  { key: 'operation:view', label: 'Ver a operação ao vivo (fila, pedidos e mapa)', category: 'Operação ao vivo', kind: 'opens', area: 'operacao', description: 'Abre Precisa de mim, Pedidos ao vivo e Mapa ao vivo.' },
  { key: 'user:view_motoboys', label: 'Ver motoboys', category: 'Usuários', kind: 'opens', area: 'usuarios', audience: 'motoboys', description: 'Abre Usuários só com a aba Motoboys. Vê a ficha, mas não edita.' },
  { key: 'store:view_all', label: 'Ver todas as lojas', category: 'Lojas e planos', kind: 'opens', area: 'lojas', tab: 'lojas', description: 'Abre Lojas: a lista e a ficha de cada loja.' },
  { key: 'store:edit', label: 'Pausar e liberar lojas', category: 'Lojas e planos', kind: 'action', area: 'lojas', requires: ['store:view_all'], description: 'Na ficha da loja: pausa ou libera as vendas. Precisa de Ver todas as lojas.' },
  { key: 'money:overview', label: 'Ver a visão geral do dinheiro', category: 'Dinheiro', subgroup: 'Visão geral', kind: 'opens', area: 'dinheiro', tab: 'visao-geral', description: 'Abre Dinheiro · Visão geral.' },
  { key: 'payout:view', label: 'Ver repasses e obrigações', category: 'Dinheiro', subgroup: 'Repasses', kind: 'opens', area: 'dinheiro', tab: 'repasses', description: 'Abre Dinheiro · Repasses.' },
  { key: 'wallet:view_motoboys', label: 'Ver carteiras de motoboys', category: 'Dinheiro', subgroup: 'Carteiras', kind: 'opens', area: 'dinheiro', tab: 'carteiras', audience: 'motoboys', description: 'Abre Dinheiro · Carteiras só com motoboys.' },
  { key: 'theme:edit', label: 'Editar temas sazonais', category: 'Tema sazonal', kind: 'opens', area: 'tema', description: 'Abre Tema sazonal.' },
  // Um servidor antigo ainda mandaria a chave de uso no app: a tela não mostra.
  { key: 'store:view_own', label: 'Ver própria loja', category: 'Uso no app', kind: 'app' },
];
const ROLE_DESCRIPTIONS = {
  ceo: 'CEO: tem todas as permissões, inclusive as que não se delegam.',
  marketing: 'Marketing: cuida da comunicação com o público.',
  gerente_geral: 'Gerente geral: acompanha toda a operação.',
  gerente_clientes: 'Gerente de clientes: cuida dos clientes.',
  gerente_lojistas: 'Gerente de lojistas: cuida das lojas.',
  gerente_motoboys: 'Gerente de motoboys: cuida dos entregadores: cadastro, verificação, ficha e repasses.',
};
const role = (r: string, permissions: string[]) => ({ role: r, permissions, notificationTargets: [] as string[], isCustom: false });
const LIST = {
  allRoles: TEAM,
  notificationTargetRoles: ALL,
  allPermissions: PERMS,
  roleDescriptions: ROLE_DESCRIPTIONS,
  // Um servidor antigo mandaria os papéis do app; a tela mostra só a equipe.
  roles: [...TEAM.map((r) => role(r, [])), role('lojista', []), role('cliente', []), role('motoboy', [])],
};

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  __resetSaasConfigCache();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/settings/saas' ? { settlementMode: 'custodia' } : LIST }));
});

/** Monta a tela (computador) e espera a matriz. */
const matrix = () => {
  renderAdminPage(<AdminPermissoes />);
  return screen.findByRole('table', { name: 'Permissões por papel' });
};

describe('só a equipe', () => {
  it('uma coluna por papel da equipe; nada de Cliente, Lojista e Motoboy; o CEO fixo, sem caixinhas', async () => {
    const table = await matrix();
    const heads = Array.from(table.querySelectorAll('thead th')).map((h) => h.textContent ?? '');
    expect(heads.slice(1).map((h) => h.split('O que é')[0])).toEqual(
      expect.arrayContaining(['Marketing', 'Gerente geral', 'Gerente de clientes', 'Gerente de lojistas', 'Gerente de motoboys'].map((n) => expect.stringContaining(n))),
    );
    expect(heads).toHaveLength(1 + TEAM.length);
    for (const fixed of ['Cliente', 'Lojista', 'Motoboy']) {
      expect(heads.some((h) => h.startsWith(fixed))).toBe(false);
      expect(screen.queryByRole('checkbox', { name: new RegExp(`· ${fixed}$`) })).toBeNull();
    }
    const ceo = screen.getByRole('region', { name: 'CEO' });
    expect(ceo).toHaveTextContent('Tem todas as permissões');
    expect(within(ceo).queryByRole('checkbox')).toBeNull();
  });

  it('nenhuma chave de uso no app aparece', async () => {
    await matrix();
    expect(screen.queryByText('Ver própria loja')).toBeNull();
    expect(screen.queryByText(/Uso no app/)).toBeNull();
  });

  it('"Pode enviar avisos para" continua com todos os grupos que recebem aviso', async () => {
    await matrix();
    expect(screen.getByRole('checkbox', { name: 'Avisar Motoboy · Gerente geral' })).toBeInTheDocument();
  });
});

describe('agrupada pelo menu', () => {
  it('grupos na ordem do menu e os subgrupos de Dinheiro', async () => {
    const table = await matrix();
    const rowHeads = within(table).getAllByRole('rowheader').map((h) => h.textContent ?? '');
    const groupRows = Array.from(table.querySelectorAll('th[scope="colgroup"]')).map((th) => th.textContent);
    expect(groupRows).toEqual([
      'Operação ao vivo', 'Usuários', 'Lojas e planos', 'Dinheiro', 'Visão geral', 'Repasses', 'Carteiras', 'Tema sazonal',
    ]);
    expect(rowHeads.length).toBe(8);
  });
});

describe('o "?" explica', () => {
  it('a permissão: o que abre, o que não permite e o que precisa', async () => {
    await matrix();
    fireEvent.click(screen.getByRole('button', { name: 'O que é Ver motoboys?' }));
    const sheet = screen.getByRole('dialog', { name: 'Ver motoboys' });
    expect(sheet).toHaveTextContent('Abre Usuários só com a aba Motoboys. Vê a ficha, mas não edita.');
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Fechar' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'O que é Pausar e liberar lojas?' }));
    expect(screen.getByRole('dialog', { name: 'Pausar e liberar lojas' })).toHaveTextContent('precisa de Ver todas as lojas');
  });

  it('o papel e o CEO', async () => {
    await matrix();
    fireEvent.click(screen.getByRole('button', { name: 'O que é Gerente de motoboys?' }));
    expect(screen.getByRole('dialog', { name: 'Gerente de motoboys' }))
      .toHaveTextContent('Gerente de motoboys: cuida dos entregadores: cadastro, verificação, ficha e repasses.');
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Fechar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'O que é CEO?' }));
    expect(screen.getByRole('dialog', { name: 'CEO' })).toHaveTextContent('tem todas as permissões');
  });

  it('a 393 px: o "?" da permissão e do papel escolhido', async () => {
    setViewportWidth(393);
    renderAdminPage(<AdminPermissoes />);
    fireEvent.change(await screen.findByLabelText('Papel'), { target: { value: 'gerente_motoboys' } });
    expect(screen.queryByRole('checkbox', { name: /· Motoboy$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'O que é Ver motoboys?' }));
    expect(screen.getByRole('dialog', { name: 'Ver motoboys' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Fechar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'O que é Gerente de motoboys?' }));
    expect(screen.getByRole('dialog', { name: 'Gerente de motoboys' })).toBeInTheDocument();
  });
});

