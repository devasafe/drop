/**
 * D3b-2a · P3.4 — menu e portões: a área Lojas ganha "Todas as lojas" (store:view_all, sem modo) como 1ª aba;
 * as fichas ficam fora do menu e têm a mesma proteção da lista; as páginas novas, com o ProtectedRoute de verdade,
 * não abrem sem a permissão; rotas claras; arquivos novos sem diálogo nativo e sem style={{.
 */
import fs from 'fs';
import path from 'path';
import { screen, waitFor } from '@testing-library/react';
import api from '../lib/api';
import {
  ADMIN_AREAS, adminAreaForPath, adminAreaHref, adminScreenTitle, tabPermissions, visibleAdminAreas, type AdminNavContext,
} from '../lib/adminNav';
import { ADMIN_LIGHT_ROUTES } from '../lib/routeTheme';
import AdminLojasPage from '../pages/admin/lojas';
import AdminLojaFichaPage from '../pages/admin/lojas/[id]';
import AdminUserFichaPage from '../pages/admin/users/[id]';
import { adminAuth, renderAdminPage } from './helpers/adminPage';

const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: { id: 'x1' }, isReady: true, pathname: '/admin/lojas', asPath: '/admin/lojas' }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const get = api.get as jest.Mock;
const ROOT = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ctx = (perms: string[], mode: AdminNavContext['settlementMode']): AdminNavContext => ({
  can: (p) => perms.includes(p), isCeo: false, settlementMode: mode, custodyOpen: false,
});
const lojasTabs = (c: AdminNavContext) => visibleAdminAreas(c).find((a) => a.key === 'lojas')?.tabs.map((t) => t.key);

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(() => new Promise(() => undefined));
});

describe('menu (spec 7)', () => {
  it('"Todas as lojas" é a 1ª aba de Lojas, com store:view_all e sem modo', () => {
    const area = ADMIN_AREAS.find((a) => a.key === 'lojas')!;
    expect(area.group).toBe('Pessoas');
    expect(area.tabs[0]).toMatchObject({ key: 'lojas', label: 'Todas as lojas', href: '/admin/lojas' });
    expect(tabPermissions(area.tabs[0])).toEqual(['store:view_all']);
    expect(area.tabs[0].custodyOnly || area.tabs[0].directOnly || area.tabs[0].ceoOnly).toBeFalsy();
    expect(adminAreaForPath('/admin/lojas')).toBe('lojas');
    expect(adminScreenTitle('/admin/lojas')).toBe('Lojas · Todas as lojas');
  });

  it('quem tem store:view_all vê a lista em qualquer modo, inclusive o desconhecido', () => {
    for (const mode of ['custodia', 'direto', null] as const) {
      expect(lojasTabs(ctx(['store:view_all'], mode))).toEqual(['lojas']);
    }
    expect(lojasTabs(ctx(['store:view_all', 'plan:view'], 'custodia'))).toEqual(['lojas', 'planos']);
    expect(adminAreaHref(visibleAdminAreas(ctx(['store:view_all'], 'direto')).find((a) => a.key === 'lojas')!)).toBe('/admin/lojas');
    expect(lojasTabs(ctx(['user:view_all'], 'custodia'))).toBeUndefined();
  });

  it('as fichas ficam fora do menu e têm a mesma proteção da lista', () => {
    const hrefs = ADMIN_AREAS.flatMap((a) => a.tabs).map((t) => t.href);
    expect(hrefs.some((h) => h.startsWith('/admin/lojas/') || h.startsWith('/admin/users/'))).toBe(false);
    expect(read('pages/admin/lojas.tsx')).toMatch(/required_permission="store:view_all"/);
    expect(read('pages/admin/lojas/[id].tsx')).toMatch(/required_permission="store:view_all"/);
    // 22/10: a ficha abre com a mesma lista da página Usuários (user:view_all ou as chaves por público).
    expect(read('pages/admin/users/[id].tsx')).toMatch(
      /required_permission=\{\['user:view_all', 'user:view_clients', 'user:view_motoboys'\]\}/,
    );
    expect(read('pages/admin/users.tsx')).toMatch(
      /required_permission=\{\['user:view_all', 'user:view_clients', 'user:view_motoboys'\]\}/,
    );
  });

  it('as três páginas novas estão na lista clara do admin', () => {
    expect(ADMIN_LIGHT_ROUTES).toEqual(expect.arrayContaining(['/admin/users/[id]', '/admin/lojas', '/admin/lojas/[id]']));
  });
});

describe('as páginas novas com o ProtectedRoute de verdade', () => {
  it.each([
    ['Lojas', AdminLojasPage, ['user:view_all']],
    ['Ficha da loja', AdminLojaFichaPage, ['user:view_all']],
    ['Ficha da pessoa', AdminUserFichaPage, ['store:view_all']],
  ] as const)('%s: sem a permissão não abre nem chama o servidor', (_nome, Page, perms) => {
    renderAdminPage(<Page />, adminAuth('gerente_geral', [...perms]));
    expect(screen.queryByTestId('admin-shell')).toBeNull();
    expect(mockPush).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['Lojas', AdminLojasPage, ['store:view_all']],
    ['Ficha da loja', AdminLojaFichaPage, ['store:view_all']],
    ['Ficha da pessoa', AdminUserFichaPage, ['user:view_all']],
  ] as const)('%s: com a permissão abre e lê', async (_nome, Page, perms) => {
    renderAdminPage(<Page />, adminAuth('gerente_geral', [...perms]));
    expect(screen.getByTestId('admin-shell')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('guardas dos arquivos novos', () => {
  const CODIGO = [
    'pages/admin/users.tsx', 'pages/admin/users/[id].tsx', 'pages/admin/lojas.tsx', 'pages/admin/lojas/[id].tsx',
    'components/admin/accounts/ReasonSheet.tsx', 'components/admin/accounts/Timeline.tsx',
    'components/admin/accounts/RolesSheet.tsx', 'lib/adminAccounts.ts',
  ];
  const NATIVE_DIALOG_RE = /(?:\b(?:window|globalThis|self)\.|(?<![\w.$]))(?:prompt|confirm|alert)\s*\(/;

  it.each(CODIGO)('%s: sem diálogo nativo e sem style={{', (f) => {
    const src = read(f);
    expect(src.split('\n').filter((line) => NATIVE_DIALOG_RE.test(line))).toEqual([]);
    expect(src).not.toMatch(/style=\{\{/);
  });
});
