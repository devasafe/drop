/**
 * D3b-1 · P3.3 — Pedidos ao vivo (spec 3.2 e 4.4): KPIs; tabela (situação, loja, motoboy, há, por que importa,
 * total) com a linha abrindo /admin/pedidos/[id]; filtros e loja; "Carregar mais"; vazio e erro com "Tentar de
 * novo"; releitura no evento admin:order_changed (agrupado em 2 s) e na volta do socket; polling de 30 s com o
 * socket caído; sem operation:view o evento não é assinado; no celular a tabela vira cartões.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminPedidosPage from '../pages/admin/pedidos';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/pedidos', asPath: '/admin/pedidos' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
let mockCan: (p: string) => boolean = () => true;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: (p: string) => mockCan(p), loading: false, permissionsLoading: false }),
}));
// Socket de mentira com funções estáveis, como as do SocketContext real (useCallback).
const mockHandlers: Record<string, (payload?: unknown) => void> = {};
let mockReconnect: (() => void) | null = null;
let mockConnected = true;
const mockOn = (event: string, handler: (payload?: unknown) => void) => {
  mockHandlers[event] = handler;
  return () => { delete mockHandlers[event]; };
};
const mockOnReconnect = (cb: () => void) => {
  mockReconnect = cb;
  return () => { mockReconnect = null; };
};
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: mockOn, onReconnect: mockOnReconnect, isConnected: mockConnected, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const ROW_LOJA = {
  id: 'o1', shortId: 'a1b2c3', status: 'pago', deliveryStatus: null, store: { id: 's1', name: 'Sabor da Vila' },
  motoboy: null, createdAt: ago(20), stageSince: ago(14), total: 58.9, attention: 'loja_parada',
};
const ROW_ENTREGA = {
  id: 'o2', shortId: 'd4e5f6', status: 'aguardando_motoboy', deliveryStatus: 'picked', store: { id: 's2', name: 'Pizzaria Sol' },
  motoboy: { id: 'm1', name: 'Carlos Lima' }, createdAt: ago(40), stageSince: ago(8), total: 102, attention: null,
};
const META = {
  active: 7, activePaid: 6, awaitingPix: 1, attention: 2, acceptAvgMin: 4.4, acceptLimitMin: 10,
  findMotoboyAvgMin: null, poolTimeoutMin: 8, deliveredToday: 31, attentionTruncated: false,
};
const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor, meta: META });
const ATENCAO = '/admin/orders?filtro=atencao';

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, error: string): Reply => () => Promise.reject({ response: { status, data: { error } } });
let routes: Record<string, Reply>;
const calls = (url: string) => get.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockCan = () => true;
  mockConnected = true;
  mockReconnect = null;
  Object.keys(mockHandlers).forEach((k) => { delete mockHandlers[k]; });
  routes = { [ATENCAO]: ok(page([ROW_LOJA, ROW_ENTREGA])) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => {
  jest.useRealTimers();
  resetViewport();
});

const tabela = () => screen.findByRole('table', { name: 'Pedidos' });
const filtro = (nome: string) => within(screen.getByRole('group', { name: 'Filtrar pedidos' })).getByRole('button', { name: nome });

describe('KPIs e tabela', () => {
  it('KPIs do meta: em andamento, atenção, aceite e achar motoboy contra o limite, entregues hoje', async () => {
    render(<AdminPedidosPage />);
    const resumo = screen.getByRole('region', { name: 'Resumo dos pedidos' });
    await within(resumo).findByText('Em andamento');
    expect(within(resumo).getByText('Em andamento').parentElement).toHaveTextContent('76 pagos · 1 aguardando Pix');
    expect(within(resumo).getByText('Precisam de atenção').parentElement).toHaveTextContent('2');
    expect(within(resumo).getByText('Aceite médio').parentElement).toHaveTextContent('4 minlimite 10 min');
    expect(within(resumo).getByText('Achar motoboy').parentElement).toHaveTextContent('—limite 8 min');
    expect(within(resumo).getByText('Entregues hoje').parentElement).toHaveTextContent('31');
  });

  it('linhas na ordem do servidor; a linha abre /admin/pedidos/[id]', async () => {
    render(<AdminPedidosPage />);
    const rows = within(await tabela()).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('#a1b2c3');
    expect(rows[1]).toHaveTextContent('Na loja');
    expect(rows[1]).toHaveTextContent('Sabor da Vila');
    expect(rows[1]).toHaveTextContent('—');
    expect(rows[1]).toHaveTextContent('14 min');
    expect(rows[1]).toHaveTextContent('Loja não aceitou');
    expect(rows[1]).toHaveTextContent('R$ 58,90');
    expect(within(rows[1]).getByRole('link', { name: '#a1b2c3' })).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(rows[2]).toHaveTextContent('Em entrega');
    expect(rows[2]).toHaveTextContent('Carlos Lima');
    expect(rows[2]).toHaveTextContent('8 min');
    expect(rows[2]).toHaveTextContent('R$ 102,00');
    expect(get).toHaveBeenCalledWith(ATENCAO);
  });

  it('atenção cortada no teto (I5): "Mostrando os 500 pedidos mais antigos com atenção"', async () => {
    routes[ATENCAO] = ok({ ...page([ROW_LOJA]), meta: { ...META, attentionTruncated: true } });
    render(<AdminPedidosPage />);
    expect(await screen.findByText('Mostrando os 500 pedidos mais antigos com atenção')).toBeInTheDocument();
  });

  it('sem corte: sem o aviso do teto', async () => {
    render(<AdminPedidosPage />);
    await tabela();
    expect(screen.queryByText('Mostrando os 500 pedidos mais antigos com atenção')).toBeNull();
  });

  it('vazio: "Nenhum pedido com esse filtro"', async () => {
    routes[ATENCAO] = ok(page([]));
    render(<AdminPedidosPage />);
    expect(await screen.findByText('Nenhum pedido com esse filtro')).toBeInTheDocument();
  });

  it('erro: mensagem com "Tentar de novo", sem tabela vazia nem KPI zerado', async () => {
    routes[ATENCAO] = fail(500, 'Erro ao listar pedidos');
    render(<AdminPedidosPage />);
    const bloco = screen.getByRole('region', { name: 'Pedidos' });
    expect(await within(bloco).findByRole('alert')).toHaveTextContent('Erro ao listar pedidos');
    expect(screen.queryByText('Nenhum pedido com esse filtro')).toBeNull();
    expect(screen.queryByText('Entregues hoje')).toBeNull();
    routes[ATENCAO] = ok(page([ROW_LOJA]));
    fireEvent.click(within(bloco).getByRole('button', { name: 'Tentar de novo' }));
    expect(within(await tabela()).getByText('Sabor da Vila')).toBeInTheDocument();
  });
});

describe('filtros', () => {
  it('"Atenção" começa marcado', async () => {
    render(<AdminPedidosPage />);
    await tabela();
    expect(filtro('Atenção')).toHaveAttribute('aria-pressed', 'true');
  });

  it.each([
    ['Todos', 'todos'], ['Aguardando Pix', 'aguardando_pix'], ['Na loja', 'na_loja'],
    ['Em entrega', 'em_entrega'], ['Cancelados hoje', 'cancelados_hoje'],
  ])('"%s" relê com ?filtro=%s', async (nome, filtroApi) => {
    routes[`/admin/orders?filtro=${filtroApi}`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    await tabela();
    fireEvent.click(filtro(nome));
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/admin/orders?filtro=${filtroApi}`));
    await waitFor(() => expect(screen.queryByText('#a1b2c3')).toBeNull());
    expect(screen.getByText('#d4e5f6')).toBeInTheDocument();
    expect(filtro(nome)).toHaveAttribute('aria-pressed', 'true');
  });

  it('loja: as lojas da lista viram opções e a escolha relê com &storeId=', async () => {
    routes[`${ATENCAO}&storeId=s2`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    await tabela();
    const loja = screen.getByLabelText('Loja') as HTMLSelectElement;
    expect(Array.from(loja.options).map((o) => o.textContent)).toEqual(['Todas as lojas', 'Pizzaria Sol', 'Sabor da Vila']);
    fireEvent.change(loja, { target: { value: 's2' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith(`${ATENCAO}&storeId=s2`));
    await waitFor(() => expect(screen.queryByText('#a1b2c3')).toBeNull());
  });
});

describe('"Carregar mais"', () => {
  it('traz a próxima página pelo cursor e some na última', async () => {
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });

  it('clique duplo pede a página uma vez só', async () => {
    let release!: () => void;
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = () => new Promise((r) => { release = () => r({ data: page([ROW_ENTREGA]) }); });
    render(<AdminPedidosPage />);
    const btn = await screen.findByRole('button', { name: 'Carregar mais' });
    act(() => { btn.click(); btn.click(); });
    await waitFor(() => expect(typeof release).toBe('function'));
    release();
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    expect(calls(`${ATENCAO}&cursor=c1`)).toBe(1);
  });
});

describe('releitura e erros que preservam a lista', () => {
  it('releitura silenciosa que falha: a tabela fica e aparece o aviso, com "Tentar de novo"', async () => {
    render(<AdminPedidosPage />);
    await tabela();
    routes[ATENCAO] = fail(500, 'Erro ao listar pedidos');
    act(() => { mockReconnect?.(); });
    const aviso = await screen.findByText(/Não deu para atualizar\. Mostrando a última leitura\./);
    expect(screen.getByRole('table', { name: 'Pedidos' })).toBeInTheDocument();
    expect(screen.getByText('Entregues hoje')).toBeInTheDocument();
    expect(screen.queryByText('Sem os números agora (veja o erro na lista).')).toBeNull();
    routes[ATENCAO] = ok(page([ROW_ENTREGA]));
    fireEvent.click(within(aviso.closest('p') as HTMLElement).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull());
    expect(screen.getByText('#d4e5f6')).toBeInTheDocument();
  });

  it('primeira leitura falhou e a releitura também: o erro cheio fica, sem esqueleto nem aviso de última leitura', async () => {
    jest.useFakeTimers();
    mockConnected = false;
    routes[ATENCAO] = fail(500, 'Erro ao listar pedidos');
    render(<AdminPedidosPage />);
    const bloco = screen.getByRole('region', { name: 'Pedidos' });
    expect(await within(bloco).findByRole('alert')).toHaveTextContent('Erro ao listar pedidos');
    const antes = calls(ATENCAO);
    act(() => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(calls(ATENCAO)).toBe(antes + 1));
    expect(await within(bloco).findByRole('alert')).toHaveTextContent('Erro ao listar pedidos');
    expect(within(bloco).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull();
  });

  it('com páginas extras carregadas, o evento não relê e avisa "Há pedidos atualizados"', async () => {
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    const antes = calls(ATENCAO);
    act(() => { mockReconnect?.(); });
    expect(await screen.findByText(/Há pedidos atualizados/)).toBeInTheDocument();
    expect(calls(ATENCAO)).toBe(antes);
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
    expect(screen.getByText('#d4e5f6')).toBeInTheDocument();
  });

  it('"Atualizar" relê a 1ª página e a lista volta a uma página', async () => {
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    act(() => { mockReconnect?.(); });
    await screen.findByText(/Há pedidos atualizados/);
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c7'));
    const antes = calls(ATENCAO);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(calls(ATENCAO)).toBe(antes + 1));
    await waitFor(() => expect(screen.queryByText('#d4e5f6')).toBeNull());
    expect(screen.queryByText(/Há pedidos atualizados/)).toBeNull();
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument();
  });

  it('"Atualizar" que falha mantém as páginas extras; o próximo evento não relê e o aviso continua', async () => {
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = ok(page([ROW_ENTREGA]));
    render(<AdminPedidosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    act(() => { mockReconnect?.(); });
    await screen.findByText(/Há pedidos atualizados/);
    routes[ATENCAO] = fail(500, 'Erro ao listar pedidos');
    const antes = calls(ATENCAO);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(/Não deu para atualizar/);
    expect(calls(ATENCAO)).toBe(antes + 1);
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
    expect(screen.getByText('#d4e5f6')).toBeInTheDocument();
    act(() => { mockReconnect?.(); });
    expect(calls(ATENCAO)).toBe(antes + 1);
    expect(screen.getByText(/Há pedidos atualizados/)).toBeInTheDocument();
    expect(screen.getByText('#d4e5f6')).toBeInTheDocument();
  });

  it('erro no "Carregar mais": o botão vira "Tentar de novo" e a lista fica', async () => {
    routes[ATENCAO] = ok(page([ROW_LOJA], 'c1'));
    routes[`${ATENCAO}&cursor=c1`] = fail(500, 'Falha na próxima página');
    render(<AdminPedidosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Falha na próxima página')).toBeInTheDocument();
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
    routes[`${ATENCAO}&cursor=c1`] = ok(page([ROW_ENTREGA]));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('#d4e5f6')).toBeInTheDocument();
    expect(screen.getByText('#a1b2c3')).toBeInTheDocument();
  });
});

describe('tempo real', () => {
  it('evento admin:order_changed: relê uma vez por janela de 2 s, sem apagar a tabela', async () => {
    jest.useFakeTimers();
    render(<AdminPedidosPage />);
    await tabela();
    const antes = calls(ATENCAO);
    act(() => {
      mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'pago', at: '2026-10-20T15:00:00.000Z' });
      mockHandlers['admin:order_changed']({ orderId: 'o2', status: 'aguardando_motoboy', at: '2026-10-20T15:00:01.000Z' });
    });
    act(() => { jest.advanceTimersByTime(1_999); });
    expect(calls(ATENCAO)).toBe(antes);
    expect(screen.getByRole('table', { name: 'Pedidos' })).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(1); });
    await waitFor(() => expect(calls(ATENCAO)).toBe(antes + 1));
    expect(screen.getByRole('table', { name: 'Pedidos' })).toBeInTheDocument();
  });

  it('o socket voltou: relê na hora', async () => {
    render(<AdminPedidosPage />);
    await tabela();
    const antes = calls(ATENCAO);
    act(() => { mockReconnect?.(); });
    await waitFor(() => expect(calls(ATENCAO)).toBe(antes + 1));
  });

  it('socket caído: "Recarregando a cada 30 s" e polling de 30 s; voltou, o polling para', async () => {
    jest.useFakeTimers();
    mockConnected = false;
    const { rerender } = render(<AdminPedidosPage />);
    await tabela();
    expect(screen.getByText('Recarregando a cada 30 s')).toBeInTheDocument();
    const antes = calls(ATENCAO);
    act(() => { jest.advanceTimersByTime(30_000); });
    await waitFor(() => expect(calls(ATENCAO)).toBe(antes + 1));
    mockConnected = true;
    rerender(<AdminPedidosPage />);
    expect(screen.queryByText('Recarregando a cada 30 s')).toBeNull();
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(calls(ATENCAO)).toBe(antes + 1);
  });

  it('ao desmontar: desassina o evento e a volta do socket e cancela a janela de 2 s', async () => {
    jest.useFakeTimers();
    const { unmount } = render(<AdminPedidosPage />);
    await tabela();
    act(() => { mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'pago', at: '2026-10-20T15:00:00.000Z' }); });
    const antes = calls(ATENCAO);
    unmount();
    expect(mockHandlers['admin:order_changed']).toBeUndefined();
    expect(mockReconnect).toBeNull();
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(calls(ATENCAO)).toBe(antes);
  });

  it('sem operation:view: o evento não é assinado', async () => {
    mockCan = (p) => p !== 'operation:view';
    render(<AdminPedidosPage />);
    await tabela();
    expect(mockHandlers['admin:order_changed']).toBeUndefined();
    expect(mockReconnect).toBeNull();
  });
});

describe('celular', () => {
  it('a tabela vira cartões, e o pedido continua levando ao detalhe', async () => {
    setViewportWidth(390);
    render(<AdminPedidosPage />);
    const lista = await screen.findByRole('list', { name: 'Pedidos' });
    expect(within(lista).getByRole('link', { name: '#a1b2c3' })).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(within(lista).getByText('Loja não aceitou')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
