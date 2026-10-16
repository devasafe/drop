/**
 * D3a · Números do negócio (/admin/dashboard, spec 5.5): funde o dashboard e o analytics antigos.
 * Caracterização: as chamadas ao servidor (endpoint, período e limite) são as mesmas de antes. O caso do
 * analytics antigo sai na P5.2, junto com a página.
 */
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import api from '../lib/api';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/dashboard', asPath: '/admin/dashboard' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest} onClick={(e) => e.preventDefault()}>{children}</a>,
}));
let mockRole = 'ceo';
let mockCan: (p: string) => boolean = () => true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', role: mockRole, activeRole: mockRole, name: 'Ana' },
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
let mockMode: 'custodia' | 'direto' = 'custodia';
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: mockMode, loading: false, error: null, retry: jest.fn() }),
}));
jest.mock('../hooks/useAdminCustodyOpen', () => ({ useAdminCustodyOpen: () => false }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), defaults: { baseURL: 'http://x/api' } },
}));
let mockGuard: unknown;
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ required_permission, children }: any) => {
    mockGuard = required_permission;
    return <>{children}</>;
  },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/PushEnableBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('recharts', () => {
  const Stub = ({ children }: any) => <div>{children}</div>;
  const names = ['ResponsiveContainer', 'LineChart', 'Line', 'ComposedChart', 'Bar', 'BarChart', 'XAxis', 'YAxis',
    'Tooltip', 'CartesianGrid', 'Legend', 'PieChart', 'Pie', 'Cell'];
  return Object.fromEntries([['__esModule', true], ...names.map((n) => [n, Stub])]);
});

const mockGet = api.get as jest.Mock;

const OVERVIEW = {
  period: { days: 30, start: '2026-09-15', end: '2026-10-15' },
  current: { totalUsers: 120, newUsers: 30, activeUsers: 40, totalStores: 12, newStores: 2, gmv: 10000, commission: 1000, orders: 125 },
  previous: { newUsers: 24, activeUsers: 36, gmv: 8475, commission: 893, orders: 113 },
  delta: { newUsers: 25, activeUsers: 10, gmv: 18, commission: 12, orders: 11 },
};
const DATA: Record<string, unknown> = {
  '/wallets/platform/metrics': {
    totalBalance: 1500.5, totalIncome: 9000, totalSpent: 7500,
    history: [
      { date: '2026-10-14T12:00:00Z', type: 'credit', amount: 12.5, reason: 'Comissão do pedido #A2' },
      { date: '2026-10-13T12:00:00Z', type: 'credit', amount: 10, reason: 'Comissão do pedido #A1' },
    ],
  },
  '/analytics/platform/overview': OVERVIEW,
  '/analytics/platform/user-growth': { timeline: [{ date: '2026-10-01', clientes: 3, lojistas: 1, motoboys: 1, outros: 0 }] },
  '/analytics/platform/orders-timeline': { timeline: [{ date: '2026-10-01', orders: 4, gmv: 320, commission: 32 }] },
  '/analytics/platform/funnel': {
    steps: [{ label: 'Cadastrou', count: 100 }, { label: 'Fez 1º pedido', count: 40 }, { label: 'Fez 2º pedido', count: 10 }],
    conversionRates: { registerToFirstOrder: 40, firstOrderToSecond: 25 },
  },
  '/analytics/platform/top-stores': {
    stores: [{ _id: 's1', name: 'Eletro Center', city: 'Campinas', orders: 50, revenue: 6100, commission: 610, avgTicket: 122 }],
  },
  '/analytics/platform/top-categories': {
    categories: [{ _id: 'c1', name: 'Eletrônicos', quantity: 9, revenue: 5000, percent: 50 }], totalRevenue: 10000,
  },
  '/analytics/platform/retention': { cohorts: [{ cohort: '2026-08', size: 20, retention: { 0: 100, 1: 45 } }] },
};
const FAIL = Object.assign(new Error('500'), { response: { status: 500, data: { error: 'Falhou no servidor' } } });

const serve = (over: Record<string, unknown> = {}) =>
  mockGet.mockImplementation((url: string) => {
    const all = { ...DATA, ...over };
    const v = all[url];
    if (v instanceof Error) return Promise.reject(v);
    return v !== undefined ? Promise.resolve({ data: v }) : Promise.reject(new Error(`url inesperada: ${url}`));
  });
const analyticsCalls = () =>
  mockGet.mock.calls.filter(([u]) => String(u).startsWith('/analytics/platform/')).map(([u, o]) => [u, o?.params]);
const metricsCalls = () => mockGet.mock.calls.filter(([u]) => u === '/wallets/platform/metrics');
const EXPECTED = (period: string) => [
  ['/analytics/platform/overview', { period }],
  ['/analytics/platform/user-growth', { period }],
  ['/analytics/platform/orders-timeline', { period }],
  ['/analytics/platform/funnel', { period }],
  ['/analytics/platform/top-stores', { period, limit: 15 }],
  ['/analytics/platform/top-categories', { period }],
  ['/analytics/platform/retention', { period }],
];
const PAGES: Record<string, () => React.ComponentType> = {
  'dashboard (Números do negócio)': () => require('../pages/admin/dashboard').default,
};
const Numeros = () => {
  const P = PAGES['dashboard (Números do negócio)']();
  return <P />;
};

beforeEach(() => {
  mockRole = 'ceo';
  mockCan = () => true;
  mockMode = 'custodia';
  mockGuard = undefined;
  mockGet.mockReset();
});

describe('caracterização: as mesmas chamadas de antes', () => {
  it.each(Object.keys(PAGES))('%s: pede os 7 blocos do período (padrão 30 dias) e refaz em "7 dias"', async (name) => {
    serve();
    const Page = PAGES[name]();
    render(<Page />);
    await waitFor(() => expect(analyticsCalls()).toHaveLength(7));
    expect(analyticsCalls()).toEqual(expect.arrayContaining(EXPECTED('30d')));
    mockGet.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(analyticsCalls()).toHaveLength(7));
    expect(analyticsCalls()).toEqual(expect.arrayContaining(EXPECTED('7d')));
  });

  it('dashboard: pede o caixa da plataforma uma vez, sem parâmetro', async () => {
    serve();
    render(<Numeros />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/wallets/platform/metrics'));
    expect(metricsCalls()).toHaveLength(1);
    await screen.findByRole('region', { name: 'Caixa da plataforma' });
    await screen.findByText('Eletro Center');
  });
});

describe('Números do negócio (D3a)', () => {
  it('abre com qualquer uma das duas permissões das páginas fundidas (decisão D1)', async () => {
    serve();
    render(<Numeros />);
    expect(mockGuard).toEqual(['dashboard:view_all', 'analytics:view_platform']);
    await screen.findByText('Eletro Center');
  });

  it('KPIs do período, com a comparação que o servidor já manda', async () => {
    serve();
    render(<Numeros />);
    const resumo = await screen.findByRole('region', { name: 'Resumo do período' });
    await within(resumo).findByText(/R\$\s?10\.000,00/);
    expect(within(resumo).getByText('+18% sobre os 30 dias anteriores')).toBeInTheDocument();
    expect(within(resumo).getByText(/ticket médio R\$\s?80,00/)).toBeInTheDocument();
    expect(within(resumo).getByText(/10% do vendido/)).toBeInTheDocument();
  });

  it('funil, retenção, lojas e categorias com os dados do servidor', async () => {
    serve();
    render(<Numeros />);
    const funil = await screen.findByRole('region', { name: 'Funil de clientes' });
    await within(funil).findByText('Fez 1º pedido');
    expect(within(funil).getByText('40 (40%)')).toBeInTheDocument();
    const volta = screen.getByRole('region', { name: 'Voltam a comprar' });
    await within(volta).findByText('ago/2026');
    expect(within(volta).getByText('45%')).toBeInTheDocument();
    expect(await screen.findByText('Eletro Center')).toBeInTheDocument();
    expect(await screen.findByText('Eletrônicos')).toBeInTheDocument();
  });

  it('retenção sem meses: diz que ainda não há meses suficientes', async () => {
    serve({ '/analytics/platform/retention': { cohorts: [] } });
    render(<Numeros />);
    const volta = await screen.findByRole('region', { name: 'Voltam a comprar' });
    expect(await within(volta).findByText('Ainda não há meses suficientes para comparar.')).toBeInTheDocument();
  });

  it('caixa: saldo, entradas, saídas e as últimas movimentações, as mais novas primeiro', async () => {
    serve();
    render(<Numeros />);
    const caixa = await screen.findByRole('region', { name: 'Caixa da plataforma' });
    await within(caixa).findByText(/R\$\s?1\.500,50/);
    expect(within(caixa).getByText(/R\$\s?9\.000,00/)).toBeInTheDocument();
    expect(within(caixa).getByText(/R\$\s?7\.500,00/)).toBeInTheDocument();
    const texts = within(caixa).getAllByText(/Comissão do pedido #A\d/).map((el) => el.textContent);
    expect(texts).toEqual(['Comissão do pedido #A2', 'Comissão do pedido #A1']);
  });

  it('leitura do caixa falha: erro com "Tentar de novo", nunca R$ 0,00; tentar de novo relê', async () => {
    serve({ '/wallets/platform/metrics': FAIL });
    render(<Numeros />);
    const caixa = await screen.findByRole('region', { name: 'Caixa da plataforma' });
    expect(await within(caixa).findByRole('alert')).toHaveTextContent('Falhou no servidor');
    expect(within(caixa).queryByText(/R\$\s?0,00/)).toBeNull();
    serve();
    fireEvent.click(within(caixa).getByRole('button', { name: 'Tentar de novo' }));
    await within(caixa).findByText(/R\$\s?1\.500,50/);
    expect(metricsCalls()).toHaveLength(2);
  });

  it('um bloco com erro não derruba os outros', async () => {
    serve({ '/analytics/platform/funnel': FAIL });
    render(<Numeros />);
    const funil = await screen.findByRole('region', { name: 'Funil de clientes' });
    expect(await within(funil).findByRole('alert')).toHaveTextContent('Falhou no servidor');
    const resumo = screen.getByRole('region', { name: 'Resumo do período' });
    await within(resumo).findByText(/R\$\s?10\.000,00/);
    expect(await screen.findByText('Eletro Center')).toBeInTheDocument();
  });

  it('trocar o período relê os blocos do período, não o caixa', async () => {
    serve();
    render(<Numeros />);
    await waitFor(() => expect(analyticsCalls()).toHaveLength(7));
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(analyticsCalls()).toHaveLength(14));
    expect(analyticsCalls().slice(7)).toEqual(expect.arrayContaining(EXPECTED('90d')));
    expect(metricsCalls()).toHaveLength(1);
    await screen.findByText('Eletro Center');
  });

  it('sem a permissão de números: nada de número é pedido e aparecem os atalhos do papel', async () => {
    mockRole = 'gerente_geral';
    mockCan = (p) => ['dashboard:view_all', 'user:view_all', 'wallet:view_all', 'verification:view_queue'].includes(p);
    serve();
    render(<Numeros />);
    expect(await screen.findByRole('link', { name: 'Dinheiro · Carteiras' })).toHaveAttribute('href', '/admin/wallets');
    expect(screen.getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Verificações' })).toHaveAttribute('href', '/admin/verificacoes');
    expect(screen.queryByRole('region', { name: 'Resumo do período' })).toBeNull();
    expect(screen.queryByRole('button', { name: '30 dias' })).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('atalhos no modo direto (portado de a3.modeNav): sem Carteiras, Caixa e Planos; com Estornos e Pix', async () => {
    mockRole = 'gerente_lojistas';
    mockMode = 'direto';
    mockCan = (p) => p !== 'analytics:view_platform';
    serve();
    render(<Numeros />);
    expect(await screen.findByRole('link', { name: 'Dinheiro · Estornos' })).toHaveAttribute('href', '/admin/estornos');
    expect(screen.getByRole('link', { name: 'Dinheiro · Pix aos motoboys' })).toHaveAttribute('href', '/admin/transfers');
    for (const x of [/Carteiras/, /Caixa/, /Planos/]) expect(screen.queryByRole('link', { name: x })).toBeNull();
  });
});
