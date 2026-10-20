/**
 * Pendência B da D3b-1 — Precisa de mim se atualiza sozinha: admin:order_changed (agrupado em 2 s) e polling de
 * 60 s releem a fila E o resumo sem apagar a tela; a releitura que falha mantém os dados e avisa; resposta
 * fora de ordem é descartada; timers e listeners saem no unmount.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { OPERACAO_POLL_MS } from '../lib/adminOps';
import AdminOperacaoPage from '../pages/admin/operacao';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/operacao', asPath: '/admin/operacao' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
const mockHandlers: Record<string, (payload?: unknown) => void> = {};
const mockOn = (event: string, handler: (payload?: unknown) => void) => {
  mockHandlers[event] = handler;
  return () => { delete mockHandlers[event]; };
};
const mockOnReconnect = () => () => undefined;
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: mockOn, onReconnect: mockOnReconnect, isConnected: true, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;

const summary = (orders: number) => ({
  today: {
    gmv: 100, gmvLastWeekSameTime: 90, orders, ordersActive: 1, cancelPct: 0, cancelLate: 0,
    motoboysOnline: 2, motoboysDelivering: 1, motoboysFree: 1,
  },
  perHour: [{ hour: 10, count: 1 }],
  health: { storeAcceptAvgMin: 4, findMotoboyAvgMin: 3, deliveryAvgMin: 18 },
});
const queue = (title: string) => ({
  groups: [{
    type: 'withdrawal', group: 'person_waiting', count: 1,
    items: [{ id: 'w1', title, context: '', since: new Date().toISOString(), tag: 'Esperando', href: '/admin/withdrawals' }],
  }],
});

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (): Reply => () => Promise.reject({ response: { status: 500, data: { error: 'Erro do servidor' } } });
let routes: Record<string, Reply>;
const calls = (url: string) => get.mock.calls.filter((c) => c[0] === url).length;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  routes = { '/admin/ops/summary': ok(summary(10)), '/admin/queue': ok(queue('Saque de Carlos')) };
  get.mockImplementation((url: string) => routes[url]());
});
afterEach(() => {
  act(() => { jest.clearAllTimers(); });
  jest.useRealTimers();
});

const aberta = async () => {
  render(<AdminOperacaoPage />);
  await screen.findByText('Saque de Carlos');
};

describe('Precisa de mim ao vivo', () => {
  it('o intervalo é de 60 s', () => {
    expect(OPERACAO_POLL_MS).toBe(60_000);
  });

  it('admin:order_changed relê a fila e o resumo (agrupado em 2 s), sem apagar a tela', async () => {
    await aberta();
    const [s, q] = [calls('/admin/ops/summary'), calls('/admin/queue')];
    routes['/admin/queue'] = ok(queue('Saque de Dona Rita'));
    await act(async () => { mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'pago', at: '2026-10-20T15:00:00.000Z' }); });
    expect(calls('/admin/queue')).toBe(q);
    await act(async () => { jest.advanceTimersByTime(2_000); });
    expect(await screen.findByText('Saque de Dona Rita')).toBeInTheDocument();
    expect(calls('/admin/queue')).toBe(q + 1);
    expect(calls('/admin/ops/summary')).toBe(s + 1);
  });

  it('polling de 60 s relê a fila e o resumo', async () => {
    await aberta();
    const [s, q] = [calls('/admin/ops/summary'), calls('/admin/queue')];
    await act(async () => { jest.advanceTimersByTime(OPERACAO_POLL_MS - 5_000); });
    expect(calls('/admin/queue')).toBe(q);
    routes['/admin/ops/summary'] = ok(summary(11));
    await act(async () => { jest.advanceTimersByTime(5_000); });
    await waitFor(() => expect(calls('/admin/queue')).toBe(q + 1));
    expect(calls('/admin/ops/summary')).toBe(s + 1);
    expect(await screen.findByText('11')).toBeInTheDocument();
  });

  it('releitura que falha mantém os dados, avisa e "Tentar de novo" relê', async () => {
    await aberta();
    routes['/admin/queue'] = fail();
    await act(async () => { jest.advanceTimersByTime(OPERACAO_POLL_MS); });
    expect(await screen.findByText(/Não deu para atualizar. Mostrando a última leitura./)).toBeInTheDocument();
    expect(screen.getByText('Saque de Carlos')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    routes['/admin/queue'] = ok(queue('Saque de Dona Rita'));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Saque de Dona Rita')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull());
  });

  it('sem dados anteriores, o erro é o da leitura cheia (sem o aviso de última leitura)', async () => {
    routes['/admin/queue'] = fail();
    render(<AdminOperacaoPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro do servidor');
    expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull();
  });

  it('resposta antiga que chega depois da nova é descartada', async () => {
    await aberta();
    let soltaAntiga: (v: unknown) => void = () => undefined;
    routes['/admin/queue'] = () => new Promise((r) => { soltaAntiga = r; });
    await act(async () => { jest.advanceTimersByTime(OPERACAO_POLL_MS); });
    routes['/admin/queue'] = ok(queue('Saque novo'));
    await act(async () => { jest.advanceTimersByTime(OPERACAO_POLL_MS); });
    expect(await screen.findByText('Saque novo')).toBeInTheDocument();
    await act(async () => { soltaAntiga({ data: queue('Saque velho') }); });
    expect(screen.getByText('Saque novo')).toBeInTheDocument();
    expect(screen.queryByText('Saque velho')).toBeNull();
  });

  it('unmount limpa o polling e o listener do evento', async () => {
    const { unmount } = render(<AdminOperacaoPage />);
    await screen.findByText('Saque de Carlos');
    unmount();
    expect(mockHandlers['admin:order_changed']).toBeUndefined();
    const antes = get.mock.calls.length;
    await act(async () => { jest.advanceTimersByTime(OPERACAO_POLL_MS * 3); });
    expect(get.mock.calls.length).toBe(antes);
  });
});
