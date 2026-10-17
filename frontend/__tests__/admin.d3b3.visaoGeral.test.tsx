/**
 * D3b-3 · P4.2 — Dinheiro · Visão geral (spec 7.4): cartões por modo (cada um leva à aba dele), "Movimentos
 * de hoje" com filtro e "Carregar mais", "Para onde foi o dinheiro hoje", estados por bloco (carregando, erro
 * com "Tentar de novo", vazio) e pedido em /order/{id}.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminDinheiroPage from '../pages/admin/dinheiro';
import { Kpi } from '../components/admin/Kpi';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/dinheiro', asPath: '/admin/dinheiro' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
// objeto `user` estável: um `user` novo a cada render prenderia efeitos num laço
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;

const CUSTODIA = {
  mode: 'custodia', day: '2026-10-16',
  custody: { amount: 1234.5, count: 12 },
  toRelease: { amount: 800, count: 9, uncertain: 1 },
  withdrawalsToday: { amount: 350, count: 3, pending: 2, uncertain: 0 },
  refunds: null,
  platformRevenueToday: 87.4,
  whereMoneyWent: { orders: 15, inFromCustomers: 1503.2, toStores: 1270, toMotoboys: 120, gatewayCost: 3.1, platform: 110.1 },
};
const DIRETO = {
  ...CUSTODIA, mode: 'direto', custody: null, toRelease: null, refunds: { amount: 129.9, count: 1 },
  whereMoneyWent: { orders: 2, inFromCustomers: 300, toStores: 270, toMotoboys: 30, gatewayCost: 0, platform: 0 },
};
const PAGAMENTO = {
  id: 'ord:o1', at: '2026-10-16T15:04:05.123Z', type: 'order_payment', amount: 110,
  orderId: 'clx3k2abcdef', personName: 'Ana Souza', label: 'Pagamento do pedido #abcdef',
};
const SAQUE = {
  id: 'wr:w1', at: '2026-10-16T14:20:00.000Z', type: 'withdrawal_paid', amount: -86.4,
  orderId: null, personName: null, label: 'Saque pago',
};
const page = (items: unknown[], nextCursor: string | null = null) => ({ day: '2026-10-16', items, nextCursor });

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, error: string): Reply => () => Promise.reject({ response: { status, data: { error } } });
let routes: Record<string, Reply>;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  routes = {
    '/admin/money/summary': ok(CUSTODIA),
    '/admin/money/movements': ok(page([PAGAMENTO, SAQUE])),
  };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => resetViewport());

describe('Kpi com href', () => {
  it('vira link com o mesmo conteúdo; sem href continua bloco', () => {
    const { rerender } = render(<Kpi label="A liberar" value="R$ 1,00" hint="1 repasse" href="/admin/payouts" />);
    const link = screen.getByRole('link', { name: /A liberar/ });
    expect(link).toHaveAttribute('href', '/admin/payouts');
    expect(link).toHaveTextContent('R$ 1,00');
    rerender(<Kpi label="A liberar" value="R$ 1,00" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('R$ 1,00').tagName).toBe('STRONG');
  });
});

describe('cartões por modo', () => {
  it('custódia: Em custódia, A liberar (com incertos), Saques do dia e Receita; cada um leva à aba dele', async () => {
    render(<AdminDinheiroPage />);
    const custodia = await screen.findByRole('link', { name: /Em custódia/ });
    expect(custodia).toHaveAttribute('href', '/admin/app-cashbox');
    expect(custodia).toHaveTextContent('R$ 1.234,50');
    expect(custodia).toHaveTextContent('12 pedidos pagos, entrega em andamento');
    const liberar = screen.getByRole('link', { name: /A liberar/ });
    expect(liberar).toHaveAttribute('href', '/admin/payouts');
    expect(liberar).toHaveTextContent('R$ 800,00');
    expect(liberar).toHaveTextContent('9 repasses aguardando · 1 incerto');
    const saques = screen.getByRole('link', { name: /Saques do dia/ });
    expect(saques).toHaveAttribute('href', '/admin/withdrawals');
    expect(saques).toHaveTextContent('R$ 350,00');
    expect(saques).toHaveTextContent('3 Pix pagos · 2 pedidos agora');
    const receita = screen.getByRole('link', { name: /Receita da plataforma hoje/ });
    expect(receita).toHaveTextContent('R$ 87,40');
    expect(screen.queryByText('Estornos em aberto')).toBeNull();
    expect(get).toHaveBeenCalledWith('/admin/money/summary');
  });

  it('direto: sem custódia, "Split automático no Asaas", Estornos em aberto, e sem link para aba que o modo esconde', async () => {
    routes['/admin/money/summary'] = ok(DIRETO);
    render(<AdminDinheiroPage />);
    expect(await screen.findByText('Split automático no Asaas')).toBeInTheDocument();
    expect(screen.queryByText('Em custódia')).toBeNull();
    const estornos = screen.getByRole('link', { name: /Estornos em aberto/ });
    expect(estornos).toHaveAttribute('href', '/admin/estornos');
    expect(estornos).toHaveTextContent('R$ 129,90');
    expect(estornos).toHaveTextContent('1 estorno a resolver');
    expect(screen.queryByRole('link', { name: /A liberar/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Saques do dia/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Receita da plataforma hoje/ })).toBeNull();
  });

  it('resumo que falha: erro com "Tentar de novo" e nenhum R$ 0,00; tentar de novo carrega', async () => {
    routes['/admin/money/summary'] = fail(500, 'Erro ao montar o resumo');
    render(<AdminDinheiroPage />);
    const resumo = screen.getByRole('region', { name: 'Resumo do dinheiro' });
    expect(await within(resumo).findByRole('alert')).toHaveTextContent('Erro ao montar o resumo');
    expect(screen.queryByText('R$ 0,00')).toBeNull();
    routes['/admin/money/summary'] = ok(CUSTODIA);
    fireEvent.click(within(resumo).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: /Em custódia/ })).toBeInTheDocument();
  });

  it('resumo fora do formato do contrato: erro, nunca zero', async () => {
    routes['/admin/money/summary'] = ok({ mode: 'custodia' });
    render(<AdminDinheiroPage />);
    const resumo = screen.getByRole('region', { name: 'Resumo do dinheiro' });
    expect(await within(resumo).findByRole('alert')).toHaveTextContent('Não deu para carregar o resumo do dinheiro.');
    expect(screen.queryByText('R$ 0,00')).toBeNull();
  });
});

describe('Para onde foi o dinheiro hoje', () => {
  it('entrada, lojas, motoboys, custo do cartão e o que fica com o DROP, com uma barra por parte', async () => {
    render(<AdminDinheiroPage />);
    const flow = screen.getByRole('region', { name: 'Para onde foi o dinheiro hoje' });
    await within(flow).findByText('Entrou dos clientes');
    const row = (label: string) => within(flow).getByText(label).parentElement as HTMLElement;
    expect(row('Entrou dos clientes')).toHaveTextContent('R$ 1.503,20');
    expect(row('Lojas (após comissão)')).toHaveTextContent('R$ 1.270,00');
    expect(row('Motoboys')).toHaveTextContent('R$ 120,00');
    expect(row('Custo do cartão (pago pelo cliente)')).toHaveTextContent('R$ 3,10');
    expect(row('Fica com o DROP')).toHaveTextContent('R$ 110,10');
    expect(within(flow).getAllByRole('progressbar')).toHaveLength(4);
    expect(within(flow).getByText('15 pedidos pagos hoje')).toBeInTheDocument();
  });

  it('direto: avisa que a tarifa do Asaas fica na conta da loja', async () => {
    routes['/admin/money/summary'] = ok(DIRETO);
    render(<AdminDinheiroPage />);
    const flow = screen.getByRole('region', { name: 'Para onde foi o dinheiro hoje' });
    expect(await within(flow).findByText('No modo direto a tarifa do Asaas é cobrada na conta da loja e não entra aqui.')).toBeInTheDocument();
  });

  it('nenhum pedido pago hoje: vazio, sem barras', async () => {
    routes['/admin/money/summary'] = ok({ ...CUSTODIA, whereMoneyWent: { orders: 0, inFromCustomers: 0, toStores: 0, toMotoboys: 0, gatewayCost: 0, platform: 0 } });
    render(<AdminDinheiroPage />);
    const flow = screen.getByRole('region', { name: 'Para onde foi o dinheiro hoje' });
    expect(await within(flow).findByText('Nenhum pedido pago hoje')).toBeInTheDocument();
    expect(within(flow).queryByRole('progressbar')).toBeNull();
  });
});

describe('Movimentos de hoje', () => {
  it('hora de São Paulo, rótulo, pedido em /order/{id}, pessoa e valor com sinal', async () => {
    render(<AdminDinheiroPage />);
    const table = await screen.findByRole('table', { name: 'Movimentos de hoje' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('12:04');
    expect(rows[1]).toHaveTextContent('Pagamento do pedido #abcdef');
    expect(rows[1]).toHaveTextContent('Ana Souza');
    expect(rows[1]).toHaveTextContent('R$ 110,00');
    expect(within(rows[1]).getByRole('link', { name: '#abcdef' })).toHaveAttribute('href', '/order/clx3k2abcdef');
    expect(rows[2]).toHaveTextContent('11:20');
    expect(rows[2]).toHaveTextContent('Saque pago');
    expect(rows[2]).toHaveTextContent('−R$ 86,40');
    expect(within(rows[2]).queryByRole('link')).toBeNull();
    expect(document.querySelector('a[href^="/admin/order"]')).toBeNull();
    expect(get).toHaveBeenCalledWith('/admin/money/movements');
  });

  it('filtro por tipo relê a lista com ?type=', async () => {
    routes['/admin/money/movements?type=withdrawal_paid'] = ok(page([SAQUE]));
    render(<AdminDinheiroPage />);
    await screen.findByRole('table', { name: 'Movimentos de hoje' });
    fireEvent.change(screen.getByLabelText('Tipo de movimento'), { target: { value: 'withdrawal_paid' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/money/movements?type=withdrawal_paid'));
    await waitFor(() => expect(screen.queryByText('Pagamento do pedido #abcdef')).toBeNull());
    expect(screen.getByText('Saque pago')).toBeInTheDocument();
  });

  it('"Carregar mais" traz a próxima página pelo cursor e some na última', async () => {
    routes['/admin/money/movements'] = ok(page([PAGAMENTO], 'c1'));
    routes['/admin/money/movements?cursor=c1'] = ok(page([SAQUE]));
    render(<AdminDinheiroPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Saque pago')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do pedido #abcdef')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('"Carregar mais" com filtro leva o tipo e o cursor', async () => {
    routes['/admin/money/movements?type=order_payment'] = ok(page([PAGAMENTO], 'c9'));
    routes['/admin/money/movements?type=order_payment&cursor=c9'] = ok(page([
      { ...PAGAMENTO, id: 'ord:o2', orderId: 'clx3k2zzzzzz', label: 'Pagamento do pedido #zzzzzz' },
    ]));
    render(<AdminDinheiroPage />);
    await screen.findByRole('table', { name: 'Movimentos de hoje' });
    fireEvent.change(screen.getByLabelText('Tipo de movimento'), { target: { value: 'order_payment' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Pagamento do pedido #zzzzzz')).toBeInTheDocument();
  });

  it('"Carregar mais" que falha: a lista fica, o erro aparece e dá para tentar de novo', async () => {
    routes['/admin/money/movements'] = ok(page([PAGAMENTO], 'c1'));
    routes['/admin/money/movements?cursor=c1'] = fail(500, 'Erro ao ler movimentos');
    render(<AdminDinheiroPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Erro ao ler movimentos')).toBeInTheDocument();
    expect(screen.getByText('Pagamento do pedido #abcdef')).toBeInTheDocument();
    routes['/admin/money/movements?cursor=c1'] = ok(page([SAQUE]));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Saque pago')).toBeInTheDocument();
  });

  it('vazio: "Nenhuma movimentação hoje"', async () => {
    routes['/admin/money/movements'] = ok(page([]));
    render(<AdminDinheiroPage />);
    expect(await screen.findByText('Nenhuma movimentação hoje')).toBeInTheDocument();
  });

  it('lista que falha: erro com "Tentar de novo"; os cartões continuam', async () => {
    routes['/admin/money/movements'] = fail(500, 'Erro ao ler movimentos');
    render(<AdminDinheiroPage />);
    const bloco = screen.getByRole('region', { name: 'Movimentos de hoje' });
    expect(await within(bloco).findByRole('alert')).toHaveTextContent('Erro ao ler movimentos');
    expect(await screen.findByRole('link', { name: /Em custódia/ })).toBeInTheDocument();
    routes['/admin/money/movements'] = ok(page([PAGAMENTO]));
    fireEvent.click(within(bloco).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Pagamento do pedido #abcdef')).toBeInTheDocument();
  });

  it('clique duplo em "Carregar mais" pede a página uma vez só', async () => {
    let release!: () => void;
    routes['/admin/money/movements'] = ok(page([PAGAMENTO], 'c1'));
    routes['/admin/money/movements?cursor=c1'] = () => new Promise((r) => { release = () => r({ data: page([SAQUE]) }); });
    render(<AdminDinheiroPage />);
    const btn = await screen.findByRole('button', { name: 'Carregar mais' });
    btn.click();
    btn.click();
    await waitFor(() => expect(typeof release).toBe('function'));
    release();
    expect(await screen.findByText('Saque pago')).toBeInTheDocument();
    expect(get.mock.calls.filter(([u]) => u === '/admin/money/movements?cursor=c1')).toHaveLength(1);
  });

  it('celular: movimentos em cartões', async () => {
    setViewportWidth(390);
    render(<AdminDinheiroPage />);
    const list = await screen.findByRole('list', { name: 'Movimentos de hoje' });
    expect(within(list).getByText('Pagamento do pedido #abcdef')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
