/**
 * D3b-1 · P3.6 — Mapa ao vivo (spec 3.4): "Ao vivo · N online" e legenda com contagem; pontos e cor por estado
 * (com "Sem sinal" acima de 2 min); tocar no ponto mostra nome, estado e pedido; listas "Aguardando motoboy",
 * "Em entrega" e "Despacho"; ninguém online; o mapa que falha (ou sem chave) não derruba as listas; erro de
 * leitura com "Tentar de novo"; polling de 15 s e releitura no evento; no celular o mapa vem antes das listas.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import logger from '../lib/logger';
import AdminMapaPage from '../pages/admin/mapa';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/mapa', asPath: '/admin/mapa' }),
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
// O logger amarra o console.error na importação: o spy do teste não o alcança, então ele é mockado.
jest.mock('../lib/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
// O MapLibre (WebGL) não roda no jsdom: o mapa vira uma lista de pontos com o estado de cada um.
let mockMapFails = false;
jest.mock('../components/admin/mapa/OpsMap', () => ({
  __esModule: true,
  default: (p: { motoboys: { id: string; name: string; state: string }[]; onSelect: (id: string) => void }) => {
    if (mockMapFails) throw new Error('WebGL indisponível');
    return (
      <ul aria-label="Pontos do mapa">
        {p.motoboys.map((m) => (
          <li key={m.id} data-state={m.state}>
            <button type="button" onClick={() => p.onSelect(m.id)}>{m.name}</button>
          </li>
        ))}
      </ul>
    );
  },
}));
let mockHasKey = true;
jest.mock('../lib/mapConfig', () => ({ ...jest.requireActual('../lib/mapConfig'), hasMapKey: () => mockHasKey }));
// next/dynamic devolve o OpsMap (já mockado acima) direto, como em seller-create-store.test.tsx: o teste não depende
// de o carregamento assíncrono do next/dynamic resolver no jest. A exceção dentro do mapa continua indo ao MapBoundary.
jest.mock('next/dynamic', () => () => require('../components/admin/mapa/OpsMap').default);

const get = api.get as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const MAPA = {
  motoboys: [
    { id: 'm1', name: 'Carlos Lima', lat: -23.55, lng: -46.63, updatedAt: ago(0.2), state: 'delivering', orderId: 'o2', shortId: 'd4e5f6' },
    { id: 'm2', name: 'Bruno Reis', lat: -23.56, lng: -46.64, updatedAt: ago(0.5), state: 'free', orderId: null, shortId: null },
    { id: 'm3', name: 'Diego Alves', lat: -23.57, lng: -46.65, updatedAt: ago(3), state: 'free', orderId: null, shortId: null },
  ],
  waiting: [
    { orderId: 'o1', shortId: 'a1b2c3', storeName: 'Sabor da Vila', storeLat: -23.54, storeLng: -46.62, since: ago(6), radiusKm: 3, customerDeciding: false },
    { orderId: 'o3', shortId: 'g7h8i9', storeName: 'Pizzaria Sol', storeLat: null, storeLng: null, since: ago(25), radiusKm: null, customerDeciding: true },
  ],
  inDelivery: [{ orderId: 'o2', shortId: 'd4e5f6', motoboyName: 'Carlos Lima', stage: 'levando' }],
  dispatch: { initialKm: 3, stepKm: 1.5, stepSeconds: 60, maxKm: 12, poolTimeoutMin: 8 },
  storesWithoutCourier: [],
};

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, error: string): Reply => () => Promise.reject({ response: { status, data: { error } } });
let routes: Record<string, Reply>;
const calls = () => get.mock.calls.filter(([u]) => u === '/admin/ops/map').length;

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockMapFails = false;
  mockHasKey = true;
  Object.keys(mockHandlers).forEach((k) => { delete mockHandlers[k]; });
  routes = { '/admin/ops/map': ok(MAPA) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => {
  jest.useRealTimers();
  resetViewport();
});

const pontos = () => screen.findByRole('list', { name: 'Pontos do mapa' });

describe('cabeçalho e pontos', () => {
  it('"Ao vivo · N online" e a legenda com a contagem de cada estado', async () => {
    render(<AdminMapaPage />);
    expect(await screen.findByRole('heading', { name: 'Ao vivo · 3 online' })).toBeInTheDocument();
    const legenda = screen.getByRole('list', { name: 'Legenda' });
    expect(legenda).toHaveTextContent('Livre · 1');
    expect(legenda).toHaveTextContent('Em entrega · 1');
    expect(legenda).toHaveTextContent('Sem sinal · 1');
    expect(get).toHaveBeenCalledWith('/admin/ops/map');
  });

  it('pontos e cor por estado; posição com mais de 2 min vira "Sem sinal"', async () => {
    render(<AdminMapaPage />);
    const items = within(await pontos()).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-state'))).toEqual(['delivering', 'free', 'stale']);
  });

  it('tocar no ponto mostra nome, estado e pedido', async () => {
    render(<AdminMapaPage />);
    fireEvent.click(within(await pontos()).getByRole('button', { name: 'Carlos Lima' }));
    expect(screen.getByRole('status', { name: 'Motoboy selecionado' }))
      .toHaveTextContent('Carlos Lima · Em entrega · #d4e5f6 · levando ao cliente');
    fireEvent.click(within(await pontos()).getByRole('button', { name: 'Bruno Reis' }));
    expect(screen.getByRole('status', { name: 'Motoboy selecionado' })).toHaveTextContent('Bruno Reis · Livre · sem pedido agora');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('status', { name: 'Motoboy selecionado' })).toBeNull();
  });
});

describe('listas', () => {
  it('Aguardando motoboy: pedido, loja, há quanto tempo, raio ou "aberto a todos" e "Cliente decidindo"', async () => {
    render(<AdminMapaPage />);
    const lista = await screen.findByRole('region', { name: 'Aguardando motoboy' });
    const items = within(lista).getAllByRole('listitem');
    expect(within(items[0]).getByRole('link', { name: '#a1b2c3 · Sabor da Vila' })).toHaveAttribute('href', '/admin/pedidos/o1');
    expect(items[0]).toHaveTextContent('há 6 min');
    expect(items[0]).toHaveTextContent('raio 3 km');
    expect(items[0]).not.toHaveTextContent('Cliente decidindo');
    expect(items[1]).toHaveTextContent('#g7h8i9 · Pizzaria Sol');
    expect(items[1]).toHaveTextContent('aberto a todos');
    expect(items[1]).toHaveTextContent('Cliente decidindo');
  });

  it('Em entrega e Despacho (só leitura)', async () => {
    render(<AdminMapaPage />);
    const entrega = await screen.findByRole('region', { name: 'Em entrega' });
    expect(within(entrega).getByRole('link', { name: 'Carlos Lima · #d4e5f6' })).toHaveAttribute('href', '/admin/pedidos/o2');
    expect(entrega).toHaveTextContent('levando ao cliente');
    const despacho = screen.getByRole('region', { name: 'Despacho' });
    expect(within(despacho).getByText('Raio inicial').parentElement).toHaveTextContent('3 km');
    expect(within(despacho).getByText('Aumenta').parentElement).toHaveTextContent('1,5 km a cada 60 s');
    expect(within(despacho).getByText('Teto').parentElement).toHaveTextContent('12 km');
    expect(within(despacho).getByText('Sem motoboy depois de').parentElement).toHaveTextContent('8 min');
    expect(within(despacho).queryByRole('button')).toBeNull();
    // Nome de variável de ambiente não aparece na tela (revisão final).
    expect(despacho).not.toHaveTextContent('DISPATCH_');
  });
});

describe('estados', () => {
  it('ninguém online: "Nenhum motoboy online agora", e as listas continuam', async () => {
    routes['/admin/ops/map'] = ok({ ...MAPA, motoboys: [], inDelivery: [] });
    render(<AdminMapaPage />);
    expect(await screen.findByText('Nenhum motoboy online agora')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ao vivo · 0 online' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Aguardando motoboy' })).getAllByRole('listitem')).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: 'Em entrega' })).getByText('Ninguém em entrega agora')).toBeInTheDocument();
  });

  it('o mapa quebrou: "Mapa indisponível", e as listas continuam', async () => {
    mockMapFails = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AdminMapaPage />);
    expect(await screen.findByText('Mapa indisponível')).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith('[admin/mapa] mapa indisponível', expect.any(Error));
    expect(screen.getByRole('region', { name: 'Aguardando motoboy' })).toHaveTextContent('Sabor da Vila');
    expect(screen.getByRole('region', { name: 'Em entrega' })).toHaveTextContent('Carlos Lima');
    spy.mockRestore();
  });

  it('sem a chave do mapa: "Mapa indisponível" sem tentar montar o MapLibre', async () => {
    mockHasKey = false;
    render(<AdminMapaPage />);
    expect(await screen.findByText('Mapa indisponível')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pontos do mapa' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Aguardando motoboy' })).toHaveTextContent('Sabor da Vila');
  });

  it('erro de leitura: mensagem com "Tentar de novo", nunca "0 online"', async () => {
    routes['/admin/ops/map'] = fail(500, 'Erro ao montar o mapa');
    render(<AdminMapaPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao montar o mapa');
    expect(screen.queryByText(/0 online/)).toBeNull();
    routes['/admin/ops/map'] = ok(MAPA);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Ao vivo · 3 online' })).toBeInTheDocument();
  });
});

describe('atualização', () => {
  it('releitura que falha com dados na tela: mantém o mapa e avisa, com "Tentar de novo"', async () => {
    jest.useFakeTimers();
    render(<AdminMapaPage />);
    await screen.findByRole('heading', { name: 'Ao vivo · 3 online' });
    routes['/admin/ops/map'] = fail(500, 'Erro ao montar o mapa');
    act(() => { jest.advanceTimersByTime(15_000); });
    expect(await screen.findByText(/Não deu para atualizar. Mostrando a última leitura./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ao vivo · 3 online' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    routes['/admin/ops/map'] = ok(MAPA);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull());
  });

  it('polling de 15 s', async () => {
    jest.useFakeTimers();
    render(<AdminMapaPage />);
    await screen.findByRole('heading', { name: 'Ao vivo · 3 online' });
    const antes = calls();
    act(() => { jest.advanceTimersByTime(15_000); });
    await waitFor(() => expect(calls()).toBe(antes + 1));
  });

  it('evento admin:order_changed relê (agrupado em 2 s)', async () => {
    jest.useFakeTimers();
    render(<AdminMapaPage />);
    await screen.findByRole('heading', { name: 'Ao vivo · 3 online' });
    const antes = calls();
    act(() => { mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'aguardando_motoboy', at: '2026-10-20T15:00:00.000Z' }); });
    act(() => { jest.advanceTimersByTime(2_000); });
    await waitFor(() => expect(calls()).toBe(antes + 1));
  });
});

describe('celular', () => {
  // Garante a ordem no DOM; o layout de uma coluna (mapa em cima) vem do CSS (grid de 1 coluna abaixo de 1024 px).
  it('o mapa vem antes das listas', async () => {
    setViewportWidth(390);
    render(<AdminMapaPage />);
    const mapa = await screen.findByRole('region', { name: 'Mapa' });
    const aguardando = screen.getByRole('region', { name: 'Aguardando motoboy' });
    expect(mapa.compareDocumentPosition(aguardando) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
