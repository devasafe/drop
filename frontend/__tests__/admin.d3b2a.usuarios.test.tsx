/**
 * D3b-2a · P3.2 — Usuários (spec 6 e 7): lista paginada do servidor, busca 300 ms depois da última tecla, abas e
 * "Com dívida" no servidor, "Carregar mais" sem repetir, fail closed, só a última leitura vale, lista só de leitura
 * (a linha abre a ficha) e cartões a 393 px.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminUsersPage from '../pages/admin/users';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, isReady: true, pathname: '/admin/users', asPath: '/admin/users' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const item = (over: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Ana Souza', email: 'ana@x.com', roles: ['cliente'], status: 'active', blockReason: null,
  verification: 'ok', lastSeenAt: ago(10), orders90d: 4, pendingDebt: null, ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ data: { items, nextCursor } });
const renderList = () => renderAdminPage(<AdminUsersPage />, adminAuth('gerente_geral', ['user:view_all']));
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;
const tabs = () => screen.getByRole('tablist', { name: 'Filtrar usuários' });

beforeEach(() => {
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
  resetViewport();
});

describe('Usuários · lista do servidor', () => {
  it('lê a 1ª página de GET /admin/users e mostra as colunas da spec', async () => {
    get.mockResolvedValue(page([
      item(),
      item({ id: 'p2', name: 'Bruno Alves', email: 'bruno@x.com', status: 'blocked', blockReason: 'Fraude no cupom', verification: 'rejected', lastSeenAt: null, orders90d: 0, pendingDebt: 12.5 }),
      item({ id: 'p3', name: 'Téo Duplo', email: 'teo@x.com', roles: ['cliente', 'motoboy', 'gerente_motoboys'], verification: 'pending' }),
    ]));
    renderList();
    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toHaveAttribute('href', '/admin/users/p1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/admin/users');
    const ana = rowOf('Ana Souza');
    expect(within(ana).getByText('ana@x.com')).toBeInTheDocument();
    expect(within(ana).getByText('Cliente')).toBeInTheDocument();
    expect(within(ana).getByText('Ativo')).toBeInTheDocument();
    expect(within(ana).getByText('Verificado')).toBeInTheDocument();
    expect(within(ana).getByText('há 10 min')).toBeInTheDocument();
    expect(within(ana).getByText('4')).toBeInTheDocument();
    const bruno = rowOf('Bruno Alves');
    expect(within(bruno).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(bruno).getByText('Fraude no cupom')).toBeInTheDocument();
    expect(within(bruno).getByText('Recusado')).toBeInTheDocument();
    expect(within(bruno).getByText('Sem registro')).toBeInTheDocument();
    expect(within(bruno).getByText('R$ 12,50')).toBeInTheDocument();
    expect(within(rowOf('Téo Duplo')).getByText('Gerente de motoboys · Motoboy')).toBeInTheDocument();
    expect(within(rowOf('Téo Duplo')).getByText('Em análise')).toBeInTheDocument();
  });

  it('só de leitura: nenhuma ação na linha (Papéis, Bloquear e Desconectar estão na ficha)', async () => {
    get.mockResolvedValue(page([item(), item({ id: 'p2', name: 'Bruno Alves', status: 'blocked' })]));
    renderList();
    await screen.findByRole('link', { name: 'Bruno Alves' });
    expect(within(rowOf('Ana Souza')).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByRole('button', { name: /^(Papéis|Bloquear|Desbloquear|Desconectar)$/ })).toBeNull();
  });

  it('a própria conta aparece com "Você"', async () => {
    get.mockResolvedValue(page([item({ id: 'u1', name: 'Marina Rocha', email: 'marina@drop.app' })]));
    renderList();
    await screen.findByRole('link', { name: 'Marina Rocha' });
    expect(within(rowOf('Marina Rocha')).getByText('Você')).toBeInTheDocument();
  });

  it('busca no servidor só 300 ms depois da última tecla (CPF com máscara vai como foi digitado)', async () => {
    jest.useFakeTimers();
    get.mockResolvedValue(page([item()]));
    renderList();
    await act(async () => { await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(1);
    const busca = screen.getByRole('searchbox', { name: 'Buscar pessoas' });
    fireEvent.change(busca, { target: { value: '123.456' } });
    act(() => { jest.advanceTimersByTime(200); });
    fireEvent.change(busca, { target: { value: '123.456.789-00' } });
    act(() => { jest.advanceTimersByTime(299); });
    expect(get).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith('/admin/users?q=123.456.789-00');
    await act(async () => { await Promise.resolve(); });
  });

  it('abas e "Com dívida" vão para o servidor; a escolha fica marcada', async () => {
    get.mockResolvedValue(page([item()]));
    renderList();
    await screen.findByRole('link', { name: 'Ana Souza' });
    expect(within(tabs()).getAllByRole('tab').map((t) => t.textContent))
      .toEqual(['Todos', 'Clientes', 'Lojistas', 'Motoboys', 'Equipe', 'Bloqueados']);
    fireEvent.click(within(tabs()).getByRole('tab', { name: 'Lojistas' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/users?tab=lojista'));
    expect(within(tabs()).getByRole('tab', { name: 'Lojistas' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Com dívida' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/users?tab=lojista&withDebt=1'));
    expect(screen.getByRole('button', { name: 'Com dívida' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(tabs()).getByRole('tab', { name: 'Todos' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/users?withDebt=1'));
  });

  it('"Carregar mais" traz a página do cursor sem repetir e some no fim', async () => {
    get.mockResolvedValueOnce(page([item(), item({ id: 'p2', name: 'Bruno Alves' })], 'c1'))
      .mockResolvedValueOnce(page([item({ id: 'p2', name: 'Bruno Alves' }), item({ id: 'p3', name: 'Carla Dias' })], null));
    renderList();
    await screen.findByRole('link', { name: 'Bruno Alves' });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('link', { name: 'Carla Dias' })).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/admin/users?cursor=c1');
    expect(screen.getAllByRole('link', { name: 'Bruno Alves' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('"Carregar mais" que falha: a lista fica, com o aviso e "Tentar de novo"', async () => {
    get.mockResolvedValueOnce(page([item()], 'c1')).mockRejectedValueOnce(new Error('x'));
    renderList();
    await screen.findByRole('link', { name: 'Ana Souza' });
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar mais pessoas.');
    expect(screen.getByRole('link', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('resposta fora do formato (a lista antiga, um array) é erro com "Tentar de novo", nunca lista vazia', async () => {
    get.mockResolvedValueOnce({ data: [item()] }).mockResolvedValueOnce(page([item()]));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar os usuários.');
    expect(screen.queryByText('Ninguém nesta aba')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Ana Souza' })).toBeInTheDocument();
  });

  it('403: "Você não tem permissão para isso"', async () => {
    get.mockRejectedValue({ response: { status: 403, data: { error: 'Permissão negada. Você precisa de: user:view_all' } } });
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  });

  it('só a última leitura vale: a resposta atrasada de outra aba não cobre a atual', async () => {
    let soltaPrimeira: (v: unknown) => void = () => undefined;
    get.mockImplementationOnce(() => new Promise((r) => { soltaPrimeira = r; }))
      .mockResolvedValueOnce(page([item({ id: 'p9', name: 'Lia Loja', roles: ['cliente', 'lojista'] })]));
    renderList();
    fireEvent.click(within(tabs()).getByRole('tab', { name: 'Lojistas' }));
    expect(await screen.findByRole('link', { name: 'Lia Loja' })).toBeInTheDocument();
    await act(async () => { soltaPrimeira(page([item()])); });
    expect(screen.queryByRole('link', { name: 'Ana Souza' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Lia Loja' })).toBeInTheDocument();
  });

  it('vazio de verdade: o texto da aba ou da busca', async () => {
    get.mockResolvedValue(page([]));
    renderList();
    expect(await screen.findByText('Ninguém nesta aba')).toBeInTheDocument();
  });
});

describe('Usuários · 393 px', () => {
  it('cartões, com o nome levando à ficha e sem botão de ação', async () => {
    setViewportWidth(393);
    get.mockResolvedValue(page([item(), item({ id: 'p2', name: 'Bruno Alves' })]));
    renderList();
    await screen.findByRole('link', { name: 'Ana Souza' });
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Usuários' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole('link', { name: 'Ana Souza' })).toHaveAttribute('href', '/admin/users/p1');
    expect(within(cards[0]).queryAllByRole('button')).toEqual([]);
  });
});
