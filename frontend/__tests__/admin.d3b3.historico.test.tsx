/**
 * D3b-3 · P4.3 — Dinheiro · Histórico (spec 8): quando, quem (nome e papel), ação, alvo, valor, motivo e
 * antes → depois; filtros por ação, pessoa e período (dias de São Paulo); "Carregar mais"; erro e vazio;
 * cartões no celular.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminDinheiroHistoricoPage from '../pages/admin/dinheiro/historico';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/dinheiro/historico', asPath: '/admin/dinheiro/historico',
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

const AJUSTE = {
  id: 'a1', at: '2026-10-16T14:00:00.000Z', actorId: 'clx9', actorName: 'Carla Lima', actorRole: 'ceo',
  type: 'wallet_adjust', targetType: 'wallet', targetId: 'clw1000abcd', amount: 25.5, reason: 'Correção de saldo',
  before: { balance: 10 }, after: { balance: 35.5, direction: 'credit' },
};
const LIBERACAO = {
  id: 'a2', at: '2026-10-16T13:00:00.000Z', actorId: 'u77', actorName: null, actorRole: 'gerente_geral',
  type: 'payout_release', targetType: 'payout', targetId: 'pay0000000042', amount: 206.91, reason: null,
  before: { status: 'pending' }, after: { status: 'released' },
};
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
let routes: Record<string, Reply>;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  routes = { '/admin/money/actions': ok(page([AJUSTE, LIBERACAO])) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => resetViewport());

it('lê o histórico e mostra quando, quem, ação, alvo, valor, motivo e antes → depois', async () => {
  render(<AdminDinheiroHistoricoPage />);
  const table = await screen.findByRole('table', { name: 'Ações de dinheiro' });
  expect(get).toHaveBeenCalledWith('/admin/money/actions');
  const [, ajuste, liberacao] = within(table).getAllByRole('row');
  expect(ajuste).toHaveTextContent('16/10');
  expect(ajuste).toHaveTextContent('Carla Lima');
  expect(ajuste).toHaveTextContent('CEO');
  expect(ajuste).toHaveTextContent('Saldo ajustado');
  expect(ajuste).toHaveTextContent('Carteira #00abcd');
  expect(ajuste).toHaveTextContent('R$ 25,50');
  expect(ajuste).toHaveTextContent('Correção de saldo');
  expect(ajuste).toHaveTextContent('saldo R$ 10,00 → R$ 35,50 · crédito');
  expect(liberacao).toHaveTextContent('Pessoa removida');
  expect(liberacao).toHaveTextContent('Gerente geral');
  expect(liberacao).toHaveTextContent('Repasse liberado');
  expect(liberacao).toHaveTextContent('Repasse #000042');
  expect(liberacao).toHaveTextContent('pendente → liberado');
});

it('filtro por ação relê com ?type=', async () => {
  routes['/admin/money/actions?type=wallet_adjust'] = ok(page([AJUSTE]));
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'wallet_adjust' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?type=wallet_adjust'));
  // "Repasse liberado" também é opção do filtro Ação; olha só a tabela
  await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Repasse liberado')).toBeNull());
});

it('filtro por pessoa: lista quem já apareceu e relê com ?actorId=', async () => {
  routes['/admin/money/actions?actorId=clx9'] = ok(page([AJUSTE]));
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  const pessoa = screen.getByLabelText('Pessoa') as HTMLSelectElement;
  expect(Array.from(pessoa.options).map((o) => o.textContent)).toEqual([
    'Todas as pessoas', 'Carla Lima · CEO', 'Pessoa removida · Gerente geral',
  ]);
  fireEvent.change(pessoa, { target: { value: 'clx9' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?actorId=clx9'));
  // quem saiu do resultado continua na lista do filtro
  // "Repasse liberado" também é opção do filtro Ação; olha só a tabela
  await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Repasse liberado')).toBeNull());
  expect(Array.from(pessoa.options)).toHaveLength(3);
});

it('período: De e Até viram from e to (dias inclusivos)', async () => {
  routes['/admin/money/actions?from=2026-10-01'] = ok(page([AJUSTE, LIBERACAO]));
  routes['/admin/money/actions?from=2026-10-01&to=2026-10-16'] = ok(page([AJUSTE]));
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?from=2026-10-01'));
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-16' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?from=2026-10-01&to=2026-10-16'));
});

it('período invertido: aviso e nenhuma leitura', async () => {
  routes['/admin/money/actions?from=2026-10-16'] = ok(page([AJUSTE]));
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-16' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?from=2026-10-16'));
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-01' } });
  expect(await screen.findByText('A data inicial tem que ser antes da final.')).toBeInTheDocument();
  expect(get.mock.calls.some(([u]) => String(u).includes('to=2026-10-01'))).toBe(false);
  expect(screen.queryByRole('table')).toBeNull();
});

it('data fora de 2000–2100: aviso e nenhuma leitura (o servidor recusaria com 400)', async () => {
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  const calls = get.mock.calls.length;
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '1999-12-31' } });
  expect(await screen.findByText('Use datas entre 2000 e 2100.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2101-01-01' } });
  expect(await screen.findByText('Use datas entre 2000 e 2100.')).toBeInTheDocument();
  expect(get.mock.calls.length).toBe(calls + 1); // só a releitura ao limpar "De"; nunca com data fora da faixa
  expect(get.mock.calls.some(([u]) => /1999|2101/.test(String(u)))).toBe(false);
});

it('"Carregar mais" pelo cursor, mantendo o filtro, e some na última página', async () => {
  routes['/admin/money/actions?type=wallet_adjust'] = ok(page([AJUSTE], 'n2'));
  routes['/admin/money/actions?type=wallet_adjust&cursor=n2'] = ok(page([{ ...AJUSTE, id: 'a3', reason: 'Segundo ajuste do dia' }]));
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  fireEvent.change(screen.getByLabelText('Ação'), { target: { value: 'wallet_adjust' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByText('Segundo ajuste do dia')).toBeInTheDocument();
  expect(screen.getByText('Correção de saldo')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
});

it('cursor recusado (400) no "Carregar mais": recarrega do começo com aviso, sem repetir o cursor', async () => {
  const NOVO = { ...AJUSTE, id: 'a9', reason: 'Lista já renovada' };
  let first = true;
  routes['/admin/money/actions'] = () => {
    if (first) { first = false; return Promise.resolve({ data: page([AJUSTE], 'velho') }); }
    return Promise.resolve({ data: page([NOVO]) });
  };
  routes['/admin/money/actions?cursor=velho'] = () => Promise.reject({ response: { status: 400, data: { error: 'Cursor inválido' } } });
  render(<AdminDinheiroHistoricoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByText('Lista já renovada')).toBeInTheDocument();
  expect(screen.getByText('A lista mudou; recarregamos do começo.')).toBeInTheDocument();
  expect(screen.queryByText('Correção de saldo')).toBeNull();
  expect(get.mock.calls.filter(([u]) => u === '/admin/money/actions?cursor=velho')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
});

it('"Carregar mais" que falha por outro motivo: mantém a lista e deixa tentar de novo', async () => {
  routes['/admin/money/actions'] = ok(page([AJUSTE], 'n2'));
  routes['/admin/money/actions?cursor=n2'] = () => Promise.reject(new Error('rede'));
  render(<AdminDinheiroHistoricoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar mais ações.');
  expect(screen.getByText('Correção de saldo')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

it('leitura que falha: erro com "Tentar de novo", sem lista', async () => {
  routes['/admin/money/actions'] = () => Promise.reject({ response: { status: 400, data: { error: 'Cursor inválido' } } });
  render(<AdminDinheiroHistoricoPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cursor inválido');
  expect(screen.queryByRole('table')).toBeNull();
  routes['/admin/money/actions'] = ok(page([AJUSTE]));
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Correção de saldo')).toBeInTheDocument();
});

it('resposta fora do formato: erro, nunca lista vazia', async () => {
  routes['/admin/money/actions'] = ok({ nada: true });
  render(<AdminDinheiroHistoricoPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar o histórico.');
  expect(screen.queryByText('Nenhuma ação registrada')).toBeNull();
});

it('vazio: "Nenhuma ação registrada"', async () => {
  routes['/admin/money/actions'] = ok(page([]));
  render(<AdminDinheiroHistoricoPage />);
  expect(await screen.findByText('Nenhuma ação registrada')).toBeInTheDocument();
});

it('celular: cada ação vira um cartão', async () => {
  setViewportWidth(390);
  render(<AdminDinheiroHistoricoPage />);
  const list = await screen.findByRole('list', { name: 'Ações de dinheiro' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.queryByRole('table')).toBeNull();
});
