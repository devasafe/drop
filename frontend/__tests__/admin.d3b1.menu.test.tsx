/**
 * D3b-1 · P3.7 — menu e casa do admin: grupo "Operação" com Precisa de mim, Pedidos ao vivo, Mapa ao vivo e
 * Números do negócio, nessa ordem; as três abas novas só com operation:view (padrão só o CEO, delegável) e a mesma
 * proteção da página; /admin/pedidos/[id] fora do menu; com operation:view a casa do admin é /admin/operacao, sem
 * ela nada muda. As quatro páginas novas, com o ProtectedRoute de verdade, não abrem sem operation:view. Guardas
 * dos arquivos novos: sem diálogo nativo, sem style={{, sem a biblioteca de mapas do Google, CSS só com tokens.
 */
import fs from 'fs';
import path from 'path';
import { screen, waitFor } from '@testing-library/react';
import api from '../lib/api';
import {
  ADMIN_AREAS, adminAreaForPath, adminHomeHref, adminScreenTitle, tabPermissions, visibleAdminAreas,
  type AdminNavContext,
} from '../lib/adminNav';
import { ROLE_HOME } from '../lib/navConfig';
import { teamPanelEntry } from '../lib/teamPanel';
import AdminOperacaoPage from '../pages/admin/operacao';
import AdminPedidosPage from '../pages/admin/pedidos';
import AdminPedidoPage from '../pages/admin/pedidos/[id]';
import AdminMapaPage from '../pages/admin/mapa';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: { id: 'o1' }, isReady: true, pathname: '/admin/operacao', asPath: '/admin/operacao' }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: () => () => undefined, onReconnect: () => () => undefined, isConnected: true, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const ROOT = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const GERENTE_GERAL = ['user:view_all', 'store:view_all', 'wallet:view_all', 'dashboard:view_all', 'verification:view_queue'];
const ctx = (perms: string[], mode: AdminNavContext['settlementMode'], isCeo = false): AdminNavContext => ({
  can: (p) => isCeo || perms.includes('*') || perms.includes(p), isCeo, settlementMode: mode, custodyOpen: false,
});
const operacao = (c: AdminNavContext) => visibleAdminAreas(c).filter((a) => a.group === 'Operação').map((a) => a.key);

const NOVAS = [
  ['operacao', 'Precisa de mim', '/admin/operacao', 'pages/admin/operacao.tsx'],
  ['pedidos', 'Pedidos ao vivo', '/admin/pedidos', 'pages/admin/pedidos/index.tsx'],
  ['mapa', 'Mapa ao vivo', '/admin/mapa', 'pages/admin/mapa.tsx'],
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation(() => new Promise(() => undefined));
});

describe('tabela do menu (spec 3)', () => {
  it('grupo Operação na ordem da spec', () => {
    expect(ADMIN_AREAS.filter((a) => a.group === 'Operação').map((a) => a.label))
      .toEqual(['Precisa de mim', 'Pedidos ao vivo', 'Mapa ao vivo', 'Números do negócio']);
  });

  it.each(NOVAS)('%s: uma aba, operation:view, sem filtro de modo e sem ceoOnly', (key, label, href) => {
    const area = ADMIN_AREAS.find((a) => a.key === key)!;
    expect(area.label).toBe(label);
    expect(area.tabs).toHaveLength(1);
    expect(area.tabs[0]).toMatchObject({ key, label, href });
    expect(tabPermissions(area.tabs[0])).toEqual(['operation:view']);
    expect(area.tabs[0].custodyOnly || area.tabs[0].directOnly || area.tabs[0].ceoOnly).toBeFalsy();
    expect(adminAreaForPath(href)).toBe(key);
    expect(adminScreenTitle(href)).toBe(label);
  });

  it.each(NOVAS)('%s: a página tem a mesma proteção da aba', (_key, _label, _href, file) => {
    expect(read(file)).toMatch(/required_permission="operation:view"/);
  });

  it('/admin/pedidos/[id] não aparece no menu, e a página tem a mesma proteção', () => {
    expect(ADMIN_AREAS.flatMap((a) => a.tabs).some((t) => t.href.startsWith('/admin/pedidos/'))).toBe(false);
    expect(read('pages/admin/pedidos/[id].tsx')).toMatch(/required_permission="operation:view"/);
  });
});

describe('quem vê', () => {
  it('CEO vê as três abas novas em qualquer modo, inclusive com o modo desconhecido', () => {
    for (const mode of ['custodia', 'direto', null] as const) {
      expect(operacao(ctx([], mode, true))).toEqual(['operacao', 'pedidos', 'mapa', 'numeros']);
    }
  });

  it('gerente geral (padrão) não vê; com operation:view concedida em Permissões, vê as três', () => {
    expect(operacao(ctx(GERENTE_GERAL, 'custodia'))).toEqual(['numeros']);
    expect(operacao(ctx([...GERENTE_GERAL, 'operation:view'], 'custodia'))).toEqual(['operacao', 'pedidos', 'mapa', 'numeros']);
  });

  it('order:admin_cancel e order:reassign sozinhas não abrem nenhuma tela', () => {
    expect(visibleAdminAreas(ctx(['order:admin_cancel', 'order:reassign'], 'custodia'))).toEqual([]);
  });
});

describe('casa do admin (spec 3)', () => {
  it('com operation:view: /admin/operacao', () => {
    expect(adminHomeHref(() => true, true)).toBe('/admin/operacao');
    expect(adminHomeHref((p) => p === 'operation:view', false)).toBe('/admin/operacao');
    expect(adminHomeHref((p) => [...GERENTE_GERAL, 'operation:view'].includes(p), false)).toBe('/admin/operacao');
    expect(ROLE_HOME.ceo).toBe('/admin/operacao');
  });

  it('sem operation:view: nada muda', () => {
    expect(adminHomeHref((p) => GERENTE_GERAL.includes(p), false)).toBe('/admin/dashboard');
    expect(adminHomeHref((p) => p === 'money:overview', false)).toBe('/admin/dinheiro');
    expect(adminHomeHref((p) => p === 'verification:view_queue', false)).toBe('/admin/verificacoes');
  });

  it('painel da equipe com operation:view entra por Precisa de mim', () => {
    expect(teamPanelEntry(['gerente_geral'], (p) => p === 'operation:view')?.href).toBe('/admin/operacao');
    expect(teamPanelEntry(['gerente_geral'], (p) => GERENTE_GERAL.includes(p))?.href).toBe('/admin/dashboard');
  });
});

describe('as páginas novas com o ProtectedRoute de verdade', () => {
  const PAGES = [
    ['Precisa de mim', AdminOperacaoPage],
    ['Pedidos ao vivo', AdminPedidosPage],
    ['Pedido do admin', AdminPedidoPage],
    ['Mapa ao vivo', AdminMapaPage],
  ] as const;

  it.each(PAGES)('%s: sem operation:view não abre nem chama o servidor', (_nome, Page) => {
    renderAdminPage(<Page />, adminAuth('gerente_geral', GERENTE_GERAL));
    expect(screen.queryByTestId('admin-shell')).toBeNull();
    expect(mockPush).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it.each(PAGES)('%s: com operation:view concedida abre', async (_nome, Page) => {
    renderAdminPage(<Page />, adminAuth('gerente_geral', [...GERENTE_GERAL, 'operation:view']));
    expect(screen.getByTestId('admin-shell')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('guardas dos arquivos novos (spec 6)', () => {
  const CODIGO = [
    'pages/admin/operacao.tsx', 'pages/admin/pedidos/index.tsx', 'pages/admin/pedidos/[id].tsx', 'pages/admin/mapa.tsx',
    'components/admin/operacao/CancelOrderSheet.tsx', 'components/admin/operacao/ReassignSheet.tsx',
    'components/admin/mapa/OpsMap.tsx', 'components/admin/mapa/OpsMapPanel.tsx', 'components/admin/mapa/OpsMarkersLayer.tsx',
    'hooks/useAdminOrderChanged.ts', 'lib/adminOps.ts',
  ];
  const CSS = ['components/admin/operacao/Operacao.module.css', 'components/admin/mapa/OpsMap.module.css'];
  const NATIVE_DIALOG_RE = /(?:\b(?:window|globalThis|self)\.|(?<![\w.$]))(?:prompt|confirm|alert)\s*\(/;

  it.each(CODIGO)('%s: sem diálogo nativo, sem style={{ e sem a biblioteca de mapas do Google', (f) => {
    const src = read(f);
    expect(src.split('\n').filter((line) => NATIVE_DIALOG_RE.test(line))).toEqual([]);
    expect(src).not.toMatch(/style=\{\{/);
    expect(src).not.toMatch(/maps\.googleapis|@react-google-maps|google\.maps/);
  });

  it.each(CSS)('%s: só tokens (sem hex, rgba, token antigo nem gradiente)', (f) => {
    expect(cssViolations(read(f))).toEqual([]);
    expect(read(f)).not.toMatch(/rgba?\(|hsla?\(/);
  });

  it('a página do mapa usa o DropMap (MapLibre)', () => {
    expect(read('components/admin/mapa/OpsMap.tsx')).toMatch(/from '\.\.\/\.\.\/map\/DropMap'/);
  });
});
