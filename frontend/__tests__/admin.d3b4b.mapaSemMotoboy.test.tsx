/**
 * D3b-4b · P2.4 — Mapa ao vivo, "Lojas sem motoboy por perto" (spec 7.2): interruptor desligado por padrão; ligado,
 * um pino de alerta por loja e a contagem na legenda; desligar tira; o raio da descrição vem do servidor
 * (dispatch.maxKm); a resposta sem storesWithoutCourier é recusada (fail closed).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import { isOpsMapResponse } from '../lib/adminOps';
import AdminMapaPage from '../pages/admin/mapa';

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
const mockOn = () => () => undefined;
const mockOnReconnect = () => () => undefined;
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: mockOn, onReconnect: mockOnReconnect, isConnected: true, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../lib/logger', () => ({ __esModule: true, default: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() } }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
// O MapLibre (WebGL) não roda no jsdom: o mapa vira a lista dos pinos de loja que ele recebeu.
jest.mock('../components/admin/mapa/OpsMap', () => ({
  __esModule: true,
  default: (p: { stores: { id: string; name: string; kind?: string }[] }) => (
    <ul aria-label="Lojas no mapa">
      {p.stores.map((s) => <li key={s.id} data-kind={s.kind ?? 'waiting'}>{s.name}</li>)}
    </ul>
  ),
}));
jest.mock('../lib/mapConfig', () => ({ ...jest.requireActual('../lib/mapConfig'), hasMapKey: () => true }));
jest.mock('next/dynamic', () => () => require('../components/admin/mapa/OpsMap').default);

const get = api.get as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const MAPA = {
  motoboys: [
    { id: 'm1', name: 'Bruno Reis', lat: -23.56, lng: -46.64, updatedAt: ago(0.5), state: 'free', orderId: null, shortId: null },
  ],
  waiting: [
    { orderId: 'o1', shortId: 'a1b2c3', storeName: 'Sabor da Vila', storeLat: -23.54, storeLng: -46.62, since: ago(6), radiusKm: 3, customerDeciding: false },
  ],
  inDelivery: [],
  dispatch: { initialKm: 3, stepKm: 4, stepSeconds: 10, maxKm: 9, poolTimeoutMin: 8 },
  storesWithoutCourier: [
    { id: 's1', name: 'Pizzaria Sol', lat: -23.6, lng: -46.7 },
    { id: 's2', name: 'Mercado Norte', lat: -23.4, lng: -46.5 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => (url === '/admin/ops/map'
    ? Promise.resolve({ data: MAPA })
    : Promise.reject(new Error(`GET inesperado: ${url}`))));
});

const sem = <T extends object>(o: T, k: string) => { const c = { ...o } as Record<string, unknown>; delete c[k]; return c; };
const interruptor = () => screen.findByRole('switch', { name: 'Lojas sem motoboy por perto' });
const kinds = () => within(screen.getByRole('list', { name: 'Lojas no mapa' })).getAllByRole('listitem')
  .map((li) => li.getAttribute('data-kind'));

describe('lojas sem motoboy por perto', () => {
  it('desligado por padrão: só o pino do pedido aguardando e nada na legenda', async () => {
    render(<AdminMapaPage />);
    const sw = await interruptor();
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(kinds()).toEqual(['waiting']);
    expect(screen.getByRole('list', { name: 'Legenda' })).not.toHaveTextContent('Sem motoboy por perto');
  });

  it('ligado: um pino de alerta por loja e a contagem na legenda; desligar tira', async () => {
    render(<AdminMapaPage />);
    const sw = await interruptor();
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(kinds()).toEqual(['waiting', 'noCourier', 'noCourier']);
    const lojas = screen.getByRole('list', { name: 'Lojas no mapa' });
    expect(lojas).toHaveTextContent('Pizzaria Sol');
    expect(lojas).toHaveTextContent('Mercado Norte');
    expect(screen.getByRole('list', { name: 'Legenda' })).toHaveTextContent('Sem motoboy por perto · 2');

    fireEvent.click(sw);
    expect(kinds()).toEqual(['waiting']);
    expect(screen.getByRole('list', { name: 'Legenda' })).not.toHaveTextContent('Sem motoboy por perto');
  });

  it('ligado e nenhuma loja sem motoboy: a legenda mostra 0', async () => {
    get.mockResolvedValue({ data: { ...MAPA, storesWithoutCourier: [] } });
    render(<AdminMapaPage />);
    fireEvent.click(await interruptor());
    expect(kinds()).toEqual(['waiting']);
    expect(screen.getByRole('list', { name: 'Legenda' })).toHaveTextContent('Sem motoboy por perto · 0');
  });

  it('o raio da descrição vem do servidor (dispatch.maxKm)', async () => {
    render(<AdminMapaPage />);
    await interruptor();
    expect(screen.getByText('Abertas agora, sem ninguém online a até 9 km')).toBeInTheDocument();
  });

  it('formato: storesWithoutCourier é obrigatório, e cada loja tem ponto', () => {
    expect(isOpsMapResponse(MAPA)).toBe(true);
    expect(isOpsMapResponse(sem(MAPA, 'storesWithoutCourier'))).toBe(false);
    expect(isOpsMapResponse({ ...MAPA, storesWithoutCourier: [{ id: 's1', name: 'Pizzaria Sol', lat: null, lng: -46.7 }] })).toBe(false);
    expect(isOpsMapResponse({ ...MAPA, storesWithoutCourier: [{ id: 's1', lat: -23.6, lng: -46.7 }] })).toBe(false);
  });
});

