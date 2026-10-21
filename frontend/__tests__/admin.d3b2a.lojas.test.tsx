/**
 * D3b-2a · P3.4 — Lojas (spec 6 e 7): lista paginada do servidor, busca 300 ms depois da última tecla, filtros
 * no servidor, colunas e selos (situação, recebimento, atenção), "Carregar mais", fail closed, só de leitura e
 * cartões a 393 px.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminLojasPage from '../pages/admin/lojas';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, isReady: true, pathname: '/admin/lojas', asPath: '/admin/lojas' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const loja = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Eletro Center', ownerName: 'Renato Nunes', plan: 2, mode: 'custodia', rating90d: 4.8,
  cancelRate30d: 0.125, receiving: 'ok', situation: 'open', attention: false, ...over,
});
const page = (items: unknown[], nextCursor: string | null = null) => ({ data: { items, nextCursor } });
const renderList = () => renderAdminPage(<AdminLojasPage />, adminAuth('gerente_lojistas', ['store:view_all']));
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  jest.useRealTimers();
  resetViewport();
});

describe('Lojas · lista do servidor', () => {
  it('lê GET /admin/stores e mostra as colunas e os selos da spec 6', async () => {
    get.mockResolvedValue(page([
      loja({ id: 's2', name: 'Sabor da Vila', ownerName: 'Lia Lima', plan: null, mode: 'saas', rating90d: null, cancelRate30d: null, receiving: 'problem', situation: 'admin_paused', attention: true }),
      loja(),
    ]));
    renderList();
    expect(await screen.findByRole('link', { name: 'Eletro Center' })).toHaveAttribute('href', '/admin/lojas/s1');
    expect(get).toHaveBeenCalledWith('/admin/stores');
    const eletro = rowOf('Eletro Center');
    for (const t of ['Renato Nunes', 'Plano 2', 'Custódia', '4,8', '12,5%', 'Recebendo', 'Aberta']) {
      expect(within(eletro).getByText(t)).toBeInTheDocument();
    }
    expect(within(eletro).queryByText('Atenção')).toBeNull();
    const sabor = rowOf('Sabor da Vila');
    for (const t of ['Lia Lima', '—', 'SaaS', 'Sem nota', 'Poucos pedidos', 'Com problema', 'Pausada pelo DROP', 'Atenção']) {
      expect(within(sabor).getByText(t)).toBeInTheDocument();
    }
  });

  it('só de leitura: nenhuma ação na linha (Pausar fica na ficha)', async () => {
    get.mockResolvedValue(page([loja()]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(within(rowOf('Eletro Center')).queryAllByRole('button')).toEqual([]);
  });

  it('filtros vão para o servidor, um de cada vez', async () => {
    get.mockResolvedValue(page([loja()]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    const filtros = screen.getByRole('group', { name: 'Filtrar lojas' });
    expect(within(filtros).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Todas', 'Pausadas pelo DROP', 'Precisam de atenção', 'Em teste']);
    fireEvent.click(within(filtros).getByRole('button', { name: 'Pausadas pelo DROP' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=admin_paused'));
    fireEvent.click(within(filtros).getByRole('button', { name: 'Precisam de atenção' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=attention'));
    expect(within(filtros).getByRole('button', { name: 'Precisam de atenção' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(filtros).getByRole('button', { name: 'Em teste' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=trial'));
    fireEvent.click(within(filtros).getByRole('button', { name: 'Todas' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/stores'));
  });

  it('busca no servidor só 300 ms depois da última tecla', async () => {
    jest.useFakeTimers();
    get.mockResolvedValue(page([loja()]));
    renderList();
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar lojas' }), { target: { value: 'Eletro' } });
    act(() => { jest.advanceTimersByTime(299); });
    expect(get).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(1); });
    expect(get).toHaveBeenLastCalledWith('/admin/stores?q=Eletro');
    await act(async () => { await Promise.resolve(); });
  });

  it('"Carregar mais" com o mesmo filtro, sem repetir', async () => {
    get.mockResolvedValueOnce(page([loja()]))
      .mockResolvedValueOnce(page([loja()], 'c1'))
      .mockResolvedValueOnce(page([loja(), loja({ id: 's3', name: 'Casa Norte' })], null));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar lojas' })).getByRole('button', { name: 'Em teste' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('link', { name: 'Casa Norte' })).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/admin/stores?filter=trial&cursor=c1');
    expect(screen.getAllByRole('link', { name: 'Eletro Center' })).toHaveLength(1);
  });

  it('fora do formato: erro com "Tentar de novo"', async () => {
    get.mockResolvedValueOnce({ data: { items: [loja({ situation: 'sumida' })], nextCursor: null } }).mockResolvedValueOnce(page([loja()]));
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as lojas.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('link', { name: 'Eletro Center' })).toBeInTheDocument();
  });
});

describe('Lojas · 393 px', () => {
  it('cartões com o nome levando à ficha', async () => {
    setViewportWidth(393);
    get.mockResolvedValue(page([loja()]));
    renderList();
    await screen.findByRole('link', { name: 'Eletro Center' });
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Lojas' })).getAllByRole('listitem');
    expect(within(cards[0]).getByRole('link', { name: 'Eletro Center' })).toHaveAttribute('href', '/admin/lojas/s1');
  });
});
