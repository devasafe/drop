/**
 * D3b-1 · P3.2 — Precisa de mim (spec 3.1): KPIs de hoje, "Fila de hoje · N" na ordem dos grupos (dinheiro do
 * cliente → pessoa esperando → receita → operação; no grupo, a mais antiga primeiro), filtros, linha de erro por
 * tipo com "Tentar de novo", vazio "Nada depende de você agora", erro da leitura inteira e a lateral ("Pedidos por
 * hora hoje" e "Saúde agora"). Cada bloco carrega e falha sozinho.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminOperacaoPage from '../pages/admin/operacao';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/operacao', asPath: '/admin/operacao' }),
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
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const SUMMARY = {
  today: {
    gmv: 1530.5, gmvLastWeekSameTime: 1200, orders: 42, ordersActive: 7, cancelPct: 4.8, cancelLate: 1,
    motoboysOnline: 9, motoboysDelivering: 5, motoboysFree: 4,
  },
  perHour: [{ hour: 10, count: 3 }, { hour: 11, count: 6 }, { hour: 12, count: 0 }],
  health: { storeAcceptAvgMin: 4.2, findMotoboyAvgMin: null, deliveryAvgMin: 18 },
};

type Tag = 'Urgente' | 'Esperando' | 'Lote' | 'KYC' | 'Suporte' | 'Receita' | 'Operação';
const item = (id: string, title: string, min: number, tag: Tag, href: string, context = '') =>
  ({ id, title, context, since: ago(min), tag, href });
const QUEUE = {
  groups: [
    { type: 'order_no_motoboy', group: 'operation', count: 1,
      items: [item('o1', 'Pedido #a1b2c3 sem motoboy', 50, 'Operação', '/admin/pedidos/o1', 'Sabor da Vila · 12 min além do pool')] },
    { type: 'plan_change', group: 'revenue', count: 1, items: [item('p1', 'Troca de plano · Loja Sol', 120, 'Receita', '/admin/plan-approvals')] },
    { type: 'withdrawal', group: 'person_waiting', count: 1, items: [item('w1', 'Saque de Carlos Lima', 30, 'Esperando', '/admin/withdrawals')] },
    { type: 'support', group: 'person_waiting', count: 1, items: [item('s1', 'Chamado sem resposta · Ana', 90, 'Suporte', '/admin/suporte')] },
    { type: 'refund', group: 'customer_money', count: 3, items: [item('r1', 'Estorno falhou · #ff0011', 10, 'Urgente', '/admin/estornos')] },
  ],
};

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, error: string): Reply => () => Promise.reject({ response: { status, data: { error } } });
let routes: Record<string, Reply>;

beforeEach(() => {
  jest.clearAllMocks();
  routes = { '/admin/ops/summary': ok(SUMMARY), '/admin/queue': ok(QUEUE) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});

const fila = () => screen.getByRole('region', { name: 'Fila de hoje' });
const linhas = async () => within(await within(fila()).findByRole('list', { name: 'Itens da fila' })).getAllByRole('listitem');
const filtro = (nome: string) => within(screen.getByRole('group', { name: 'Filtrar a fila' })).getByRole('button', { name: nome });

describe('KPIs de hoje', () => {
  it('GMV com a semana passada, pedidos, cancelamentos e motoboys', async () => {
    render(<AdminOperacaoPage />);
    const hoje = screen.getByRole('region', { name: 'Hoje' });
    expect(await within(hoje).findByText('R$ 1.530,50')).toBeInTheDocument();
    expect(hoje).toHaveTextContent('+28% vs. semana passada até esta hora');
    expect(hoje).toHaveTextContent('42');
    expect(hoje).toHaveTextContent('7 em andamento');
    expect(hoje).toHaveTextContent('4,8%');
    expect(hoje).toHaveTextContent('1 tardio');
    expect(hoje).toHaveTextContent('5 em entrega · 4 livres');
    expect(get).toHaveBeenCalledWith('/admin/ops/summary');
  });

  it('resumo que falha: erro com "Tentar de novo", nunca R$ 0,00; a fila continua', async () => {
    routes['/admin/ops/summary'] = fail(500, 'Erro ao montar o resumo');
    render(<AdminOperacaoPage />);
    const hoje = screen.getByRole('region', { name: 'Hoje' });
    expect(await within(hoje).findByRole('alert')).toHaveTextContent('Erro ao montar o resumo');
    expect(screen.queryByText('R$ 0,00')).toBeNull();
    expect((await linhas()).length).toBeGreaterThan(0);
    routes['/admin/ops/summary'] = ok(SUMMARY);
    fireEvent.click(within(hoje).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(hoje).findByText('R$ 1.530,50')).toBeInTheDocument();
  });
});

describe('Fila de hoje', () => {
  it('carregando: esqueleto, sem o texto de vazio', () => {
    routes['/admin/queue'] = () => new Promise(() => undefined);
    routes['/admin/ops/summary'] = () => new Promise(() => undefined);
    render(<AdminOperacaoPage />);
    expect(within(fila()).getByLabelText('Carregando')).toBeInTheDocument();
    expect(screen.queryByText('Nada depende de você agora')).toBeNull();
  });

  it('ordem por grupo; no grupo, a mais antiga primeiro; título com o total', async () => {
    render(<AdminOperacaoPage />);
    const items = await linhas();
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Estorno falhou · #ff0011'),
      expect.stringContaining('Mais 2 em estornos'),
      expect.stringContaining('Chamado sem resposta · Ana'),
      expect.stringContaining('Saque de Carlos Lima'),
      expect.stringContaining('Troca de plano · Loja Sol'),
      expect.stringContaining('Pedido #a1b2c3 sem motoboy'),
    ]);
    expect(within(fila()).getByRole('heading', { name: 'Fila de hoje · 7' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/admin/queue');
  });

  it('cada linha: contexto, idade, etiqueta e o botão que leva à tela que resolve', async () => {
    render(<AdminOperacaoPage />);
    const items = await linhas();
    const pedido = items[5];
    expect(pedido).toHaveTextContent('Sabor da Vila · 12 min além do pool');
    expect(pedido).toHaveTextContent('há 50 min');
    expect(pedido).toHaveTextContent('Operação');
    expect(within(pedido).getByRole('link', { name: 'Resolver: Pedido #a1b2c3 sem motoboy' }))
      .toHaveAttribute('href', '/admin/pedidos/o1');
    expect(within(items[0]).getByRole('link', { name: /^Resolver/ })).toHaveAttribute('href', '/admin/estornos');
    expect(within(items[0]).getByText('Urgente')).toBeInTheDocument();
  });

  it.each([
    ['Dinheiro', ['Estorno falhou · #ff0011', 'Mais 2 em estornos', 'Troca de plano · Loja Sol'], 4],
    ['Pessoas', ['Chamado sem resposta · Ana', 'Saque de Carlos Lima'], 2],
    ['Operação', ['Pedido #a1b2c3 sem motoboy'], 1],
  ])('filtro %s', async (nome, titulos, total) => {
    render(<AdminOperacaoPage />);
    await linhas();
    expect(filtro('Tudo')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(filtro(nome));
    expect(filtro(nome)).toHaveAttribute('aria-pressed', 'true');
    const items = await linhas();
    expect(items).toHaveLength(titulos.length);
    titulos.forEach((t, i) => expect(items[i]).toHaveTextContent(t));
    expect(within(fila()).getByRole('heading', { name: `Fila de hoje · ${total}` })).toBeInTheDocument();
    fireEvent.click(filtro('Tudo'));
    expect(await linhas()).toHaveLength(6);
  });

  it('tipo que falhou: os outros aparecem e a linha dele mostra o erro do servidor com "Tentar de novo"', async () => {
    routes['/admin/queue'] = ok({
      groups: [
        ...QUEUE.groups.filter((g) => g.type !== 'withdrawal'),
        { type: 'withdrawal', group: 'person_waiting', count: 0, items: [], error: 'Não deu para carregar os saques' },
      ],
    });
    render(<AdminOperacaoPage />);
    const erro = await within(fila()).findByRole('alert');
    expect(erro).toHaveTextContent('Não deu para carregar os saques');
    expect(screen.getByText('Chamado sem resposta · Ana')).toBeInTheDocument();
    expect(screen.getByText('Estorno falhou · #ff0011')).toBeInTheDocument();
    expect(screen.queryByText('Saque de Carlos Lima')).toBeNull();
    expect(within(fila()).getByRole('heading', { name: 'Fila de hoje · 6' })).toBeInTheDocument();
    routes['/admin/queue'] = ok(QUEUE);
    fireEvent.click(within(erro).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Saque de Carlos Lima')).toBeInTheDocument();
    expect(within(fila()).queryByRole('alert')).toBeNull();
  });

  it('erro do tipo sem texto do servidor: usa o nome do assunto como reserva', async () => {
    routes['/admin/queue'] = ok({
      groups: [
        ...QUEUE.groups.filter((g) => g.type !== 'withdrawal'),
        { type: 'withdrawal', group: 'person_waiting', count: 0, items: [], error: ' ' },
      ],
    });
    render(<AdminOperacaoPage />);
    expect(await within(fila()).findByRole('alert')).toHaveTextContent('Não deu para carregar saques');
  });

  it('vazio: "Nada depende de você agora"', async () => {
    routes['/admin/queue'] = ok({ groups: [{ type: 'support', group: 'person_waiting', count: 0, items: [] }] });
    render(<AdminOperacaoPage />);
    expect(await within(fila()).findByText('Nada depende de você agora')).toBeInTheDocument();
    expect(within(fila()).getByRole('heading', { name: 'Fila de hoje · 0' })).toBeInTheDocument();
  });

  it('a leitura inteira falha: erro com "Tentar de novo", sem lista vazia; os KPIs continuam', async () => {
    routes['/admin/queue'] = fail(500, 'Erro ao montar a fila');
    render(<AdminOperacaoPage />);
    expect(await within(fila()).findByRole('alert')).toHaveTextContent('Erro ao montar a fila');
    expect(screen.queryByText('Nada depende de você agora')).toBeNull();
    expect(await screen.findByText('R$ 1.530,50')).toBeInTheDocument();
    routes['/admin/queue'] = ok(QUEUE);
    fireEvent.click(within(fila()).getByRole('button', { name: 'Tentar de novo' }));
    expect(await linhas()).toHaveLength(6);
  });
});

describe('lateral', () => {
  it('Pedidos por hora hoje: uma barra por hora; Saúde agora: minutos ou "—"', async () => {
    render(<AdminOperacaoPage />);
    const porHora = screen.getByRole('region', { name: 'Pedidos por hora hoje' });
    expect(await within(porHora).findAllByRole('progressbar')).toHaveLength(3);
    expect(within(porHora).getByRole('progressbar', { name: 'Pedidos às 11h' })).toHaveAttribute('aria-valuenow', '6');
    const saude = screen.getByRole('region', { name: 'Saúde agora' });
    expect((await within(saude).findByText('Aceite médio da loja')).parentElement).toHaveTextContent('4 min');
    expect(within(saude).getByText('Achar motoboy').parentElement).toHaveTextContent('—');
    expect(within(saude).getByText('Entrega média').parentElement).toHaveTextContent('18 min');
  });

  it('nenhum pedido hoje ainda: sem barras', async () => {
    routes['/admin/ops/summary'] = ok({ ...SUMMARY, perHour: [{ hour: 8, count: 0 }] });
    render(<AdminOperacaoPage />);
    const porHora = screen.getByRole('region', { name: 'Pedidos por hora hoje' });
    expect(await within(porHora).findByText('Nenhum pedido hoje ainda')).toBeInTheDocument();
    expect(within(porHora).queryByRole('progressbar')).toBeNull();
  });
});
