/**
 * D3b-4b · P1.2: Dinheiro · Mensalidades (spec 6.2). Cartões, situação, faturas com status do Asaas em português
 * e link para a loja, seletor de mês, "Carregar mais", erro (fail closed) e o modo custódia. Mais a aba no menu:
 * money:overview + directOnly, sem ceoOnly (Ruling P1-1).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminDinheiroMensalidadesPage from '../pages/admin/dinheiro/mensalidades';
import {
  ADMIN_AREAS, activeAdminTabKey, adminScreenTitle, tabPermissions, visibleAdminAreas, type AdminNavContext,
} from '../lib/adminNav';
import { formatDueDate, invoiceStatus, isSaasRevenue, monthLabel } from '../lib/adminSaasRevenue';
import { resetViewport } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/dinheiro/mensalidades', asPath: '/admin/dinheiro/mensalidades',
  }),
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;

const INV = (id: string, extra: Record<string, unknown> = {}) => ({
  id, storeId: `st-${id}`, storeName: `Loja ${id}`, value: 99.9, dueDate: '2026-10-05', status: 'PENDING', paidAt: null, ...extra,
});
const DIRETO = {
  mode: 'direto',
  month: '2026-10',
  mrr: 1299,
  receivedThisMonth: 849.5,
  overdue: { stores: 2, amount: 199.8 },
  byStatus: { trialing: 4, active: 11, past_due: 2, paused: 1, cancelled: 3 },
  trialsEndingIn7Days: 1,
  invoices: {
    items: [
      INV('a', { status: 'PENDING' }),
      INV('b', { status: 'RECEIVED', paidAt: '2026-10-05T00:00:00.000Z' }),
      INV('c', { status: 'CONFIRMED' }),
      INV('d', { status: 'OVERDUE', dueDate: '2026-10-01' }),
      INV('e', { status: 'REFUNDED' }),
      INV('f', { status: 'DELETED', dueDate: '2026-10-31' }),
      INV('g', { status: 'RECEIVED_IN_CASH' }),
      INV('h', { status: 'AWAITING_RISK_ANALYSIS' }),
    ],
    nextCursor: null as string | null,
  },
};
const CUSTODY_TEXT = 'A mensalidade só existe no modo direto.';

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, error: string): Reply => () => Promise.reject({ response: { status, data: { error } } });
let routes: Record<string, Reply>;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  routes = { '/admin/money/saas': ok(DIRETO) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => resetViewport());

describe('tela', () => {
  it('modo direto: cartões, situação e faturas do mês com status em português e link para a loja', async () => {
    render(<AdminDinheiroMensalidadesPage />);
    const table = await screen.findByRole('table', { name: 'Faturas do mês' });
    expect(get).toHaveBeenCalledWith('/admin/money/saas');

    const resumo = screen.getByRole('region', { name: 'Resumo das mensalidades' });
    expect(resumo).toHaveTextContent('Receita recorrente (MRR)');
    expect(resumo).toHaveTextContent('R$ 1.299,00');
    expect(resumo).toHaveTextContent('13 lojas pagantes');
    expect(resumo).toHaveTextContent('Recebido no mês');
    expect(resumo).toHaveTextContent('R$ 849,50');
    expect(resumo).toHaveTextContent('outubro de 2026');
    expect(resumo).toHaveTextContent('Em atraso');
    expect(resumo).toHaveTextContent('R$ 199,80');
    expect(resumo).toHaveTextContent('2 lojas em atraso');

    const situacao = screen.getByRole('region', { name: 'Situação das lojas' });
    expect(situacao).toHaveTextContent('Em teste4Ativa11Em atraso2Pausada1Cancelada3');
    expect(situacao).toHaveTextContent('1 teste acaba nos próximos 7 dias');

    expect(screen.getByRole('heading', { name: 'Faturas de outubro de 2026' })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('Loja a');
    expect(rows[0]).toHaveTextContent('R$ 99,90');
    expect(rows[0]).toHaveTextContent('05/10/2026');
    expect(within(rows[0]).getByRole('link', { name: 'Loja a' })).toHaveAttribute('href', '/admin/lojas/st-a');
    const situacoes = ['Pendente', 'Paga', 'Confirmada', 'Em atraso', 'Estornada', 'Cancelada', 'Paga', 'AWAITING_RISK_ANALYSIS'];
    situacoes.forEach((s, i) => expect(rows[i]).toHaveTextContent(s));
    // A data do Asaas não muda de dia com o fuso de São Paulo.
    expect(rows[3]).toHaveTextContent('01/10/2026');
    expect(rows[5]).toHaveTextContent('31/10/2026');
    expect(screen.getByLabelText('Mês')).toHaveValue('2026-10');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('modo custódia: só o aviso, sem cartões, seletor ou tabela', async () => {
    routes['/admin/money/saas'] = ok({ mode: 'custodia' });
    render(<AdminDinheiroMensalidadesPage />);
    expect(await screen.findByText(CUSTODY_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('Receita recorrente (MRR)')).toBeNull();
    expect(screen.queryByLabelText('Mês')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('o seletor troca o mês e relê com ?month=', async () => {
    routes['/admin/money/saas?month=2026-09'] = ok({
      ...DIRETO, month: '2026-09', invoices: { items: [INV('z', { dueDate: '2026-09-10' })], nextCursor: null },
    });
    render(<AdminDinheiroMensalidadesPage />);
    await screen.findByRole('table', { name: 'Faturas do mês' });
    fireEvent.change(screen.getByLabelText('Mês'), { target: { value: '2026-09' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/saas?month=2026-09'));
    expect(await screen.findByRole('link', { name: 'Loja z' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Faturas de setembro de 2026' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mês')).toHaveValue('2026-09');
    expect(screen.queryByRole('link', { name: 'Loja a' })).toBeNull();
  });

  it('"Carregar mais" pede a página seguinte do mesmo mês e junta sem repetir', async () => {
    routes['/admin/money/saas'] = ok({ ...DIRETO, invoices: { ...DIRETO.invoices, nextCursor: 'c1' } });
    routes['/admin/money/saas?month=2026-10&cursor=c1'] = ok({
      ...DIRETO, invoices: { items: [INV('a'), INV('z')], nextCursor: null },
    });
    render(<AdminDinheiroMensalidadesPage />);
    const table = await screen.findByRole('table', { name: 'Faturas do mês' });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(10)); // cabeçalho + 8 + z
    expect(get).toHaveBeenLastCalledWith('/admin/money/saas?month=2026-10&cursor=c1');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('cursor recusado (400) no "Carregar mais": recarrega do começo com aviso', async () => {
    routes['/admin/money/saas'] = ok({ ...DIRETO, invoices: { ...DIRETO.invoices, nextCursor: 'velho' } });
    routes['/admin/money/saas?month=2026-10&cursor=velho'] = fail(400, 'Cursor inválido');
    render(<AdminDinheiroMensalidadesPage />);
    await screen.findByRole('table', { name: 'Faturas do mês' });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('A lista mudou; recarregamos do começo.')).toBeInTheDocument();
    expect(get.mock.calls.filter(([u]) => u === '/admin/money/saas')).toHaveLength(2);
  });

  it('erro do servidor e resposta fora do formato: mensagem e "Tentar de novo", nunca zero', async () => {
    routes['/admin/money/saas'] = fail(500, 'Erro ao carregar as mensalidades');
    render(<AdminDinheiroMensalidadesPage />);
    expect(await screen.findByText('Erro ao carregar as mensalidades')).toBeInTheDocument();
    expect(screen.queryByText('R$ 0,00')).toBeNull();

    routes['/admin/money/saas'] = ok({ mode: 'direto', mrr: '10' });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Não deu para carregar as mensalidades.')).toBeInTheDocument();

    routes['/admin/money/saas'] = ok(DIRETO);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('table', { name: 'Faturas do mês' })).toBeInTheDocument();
  });
});

describe('lib/adminSaasRevenue', () => {
  it('status do Asaas em português; desconhecido mostra o código', () => {
    expect(['PENDING', 'RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED', 'OVERDUE', 'REFUNDED', 'DELETED'].map((s) => invoiceStatus(s).label))
      .toEqual(['Pendente', 'Paga', 'Paga', 'Confirmada', 'Em atraso', 'Estornada', 'Cancelada']);
    expect(invoiceStatus('CHARGEBACK_REQUESTED')).toEqual({ label: 'CHARGEBACK_REQUESTED', tone: 'neutral' });
  });

  it('datas e meses', () => {
    expect(formatDueDate('2026-10-01')).toBe('01/10/2026');
    expect(monthLabel('2026-12')).toBe('dezembro de 2026');
  });

  it('formato: custódia vale; direto incompleto não', () => {
    expect(isSaasRevenue({ mode: 'custodia' })).toBe(true);
    expect(isSaasRevenue(DIRETO)).toBe(true);
    expect(isSaasRevenue({ ...DIRETO, byStatus: { ...DIRETO.byStatus, paused: undefined } })).toBe(false);
    expect(isSaasRevenue({ ...DIRETO, invoices: { items: [{ ...INV('x'), dueDate: '2026-10-05T03:00:00.000Z' }], nextCursor: null } })).toBe(false);
    expect(isSaasRevenue({ ...DIRETO, month: '2026-13' })).toBe(false);
    expect(isSaasRevenue(null)).toBe(false);
  });
});

describe('menu: aba Mensalidades', () => {
  const ctx = (perms: string[], mode: AdminNavContext['settlementMode'], isCeo = false): AdminNavContext => ({
    can: (p) => isCeo || perms.includes(p), isCeo, settlementMode: mode, custodyOpen: false,
  });
  const dinheiroTabs = (c: AdminNavContext) => visibleAdminAreas(c).find((a) => a.key === 'dinheiro')?.tabs.map((t) => t.key);
  const area = ADMIN_AREAS.find((a) => a.key === 'dinheiro')!;

  it('money:overview, só no modo direto, sem ceoOnly, logo antes do Histórico', () => {
    const tab = area.tabs.find((t) => t.key === 'mensalidades')!;
    expect(tab).toMatchObject({ label: 'Mensalidades', href: '/admin/dinheiro/mensalidades', directOnly: true });
    expect(tab.ceoOnly).toBeFalsy();
    expect(tabPermissions(tab)).toEqual(['money:overview']);
    const keys = area.tabs.map((t) => t.key);
    expect(keys.indexOf('mensalidades')).toBe(keys.indexOf('historico') - 1);
  });

  it('CEO vê no direto; some na custódia e com o modo desconhecido', () => {
    expect(dinheiroTabs(ctx([], 'direto', true))).toContain('mensalidades');
    expect(dinheiroTabs(ctx([], 'custodia', true))).not.toContain('mensalidades');
    expect(dinheiroTabs(ctx([], null, true))).not.toContain('mensalidades');
  });

  it('money:overview concedida abre a aba no direto; sem ela, não', () => {
    expect(dinheiroTabs(ctx(['money:overview'], 'direto'))).toEqual(['visao-geral', 'mensalidades', 'historico']);
    expect(dinheiroTabs(ctx(['payout:view'], 'direto'))).not.toContain('mensalidades');
  });

  it('aba ativa e título', () => {
    expect(activeAdminTabKey(area, '/admin/dinheiro/mensalidades', {})).toBe('mensalidades');
    expect(adminScreenTitle('/admin/dinheiro/mensalidades')).toBe('Dinheiro · Mensalidades');
  });
});
