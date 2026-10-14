/**
 * D2 · Etapa 0 — rede de segurança da aba Corridas do motoboy (`pages/motoboy/index.tsx`, DS v2 desde a P3.17).
 * Só o driver é desta tela; as expectativas ficam em `helpers/motoboyRideContract`.
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { createSocketHarness, createServer, installGeoMock, flush, ApiMock, GeoHarness } from './helpers/motoboyHarness';
import { runMotoboyOfferContract, MotoboyOfferDriver, CONTRACT_MOTOBOY_ID } from './helpers/motoboyRideContract';

const mockSocket = createSocketHarness();
const mockPush = jest.fn();

jest.mock('../contexts/SocketContext', () => ({
  __esModule: true,
  default: require('react').createContext(null),
  useSocket: () => mockSocket.api,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy', asPath: '/motoboy', isReady: true }),
}));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../hooks/useMotoboyStatus', () => ({
  useMotoboyStatus: () => ({ online: true, loading: false, setOnline: jest.fn(), gps: 'active' }),
}));
jest.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, permission: 'default', busy: false, enable: jest.fn(), sendTest: jest.fn() }),
}));
jest.mock('../hooks/useUnreadNotifications', () => ({ __esModule: true, useUnreadNotifications: () => 0, default: () => 0 }));
jest.mock('../hooks/useGamificationFeatures', () => ({
  useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: false, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }),
}));
jest.mock('../components/motoboy/corridas/useCorridasSummary', () => ({
  useCorridasSummary: () => ({ summary: { today: { earnings: 0, count: 0 }, week: { earnings: 0, count: 0 } }, error: false, retry: jest.fn() }),
}));
jest.mock('../components/motoboy/corridas/useCourierStatus', () => ({
  useCourierStatus: () => ({ state: 'verified', reload: jest.fn() }),
}));

import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import CorridasPage from '../pages/motoboy/index';

const apiMock = api as unknown as ApiMock;
const server = createServer();
let geo: GeoHarness;

beforeEach(() => {
  mockSocket.reset();
  geo = installGeoMock();
});
afterEach(() => geo.restore());

// O pool passa pelo useDeliveries REAL (K13): o contrato conta os GET /deliveries/available.
function route(url: string) {
  if (url === '/deliveries/available') return Promise.resolve({ data: [...server.offers] });
  if (url === '/deliveries/ongoing' || url === '/deliveries/history') return Promise.resolve({ data: [] });
  return Promise.resolve({ data: {} });
}

/** Deixa a tela assentar (debounce de 300 ms do refetch + respostas) dentro do act. */
const settle = (ms = 400) => act(async () => { await flush(ms); });

const card = (id: string): HTMLElement | null => screen.queryByTestId(`oferta-${id}`);

function acceptButton(id: string): HTMLButtonElement | null {
  const c = card(id);
  return c ? (within(c).queryByRole('button', { name: /^Aceitar por/ }) as HTMLButtonElement | null) : null;
}

const driver: MotoboyOfferDriver = {
  async mount() {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(route);
    mockPush.mockReset();
    render(
      <AuthContext.Provider value={{ user: { _id: CONTRACT_MOTOBOY_ID, name: 'Caio Motoboy', activeRole: 'motoboy' }, token: 'tok' } as any}>
        <CorridasPage />
      </AuthContext.Provider>,
    );
    // A tela relê o pool ao ficar online (debounce de 300 ms): espera essa leitura terminar.
    await settle();
  },
  isOffered(id) {
    return !!card(id);
  },
  canAccept(id) {
    const b = acceptButton(id);
    return !!b && !b.disabled;
  },
  async accept(id) {
    const b = acceptButton(id);
    if (b && !b.disabled) fireEvent.click(b);
    // Resposta do aceite e releitura do pool (409) assentam dentro do act.
    await settle();
  },
  async skip(id) {
    const c = card(id);
    if (c) fireEvent.click(within(c).getByRole('button', { name: 'Pular' }));
    await settle(0);
  },
  openedRideId() {
    const last = mockPush.mock.calls
      .map((c) => String(c[0]))
      .reverse()
      .find((u) => /\/motoboy\/(delivery|corrida)\//.test(u));
    const m = last ? /\/motoboy\/(?:delivery|corrida)\/([^?/#]+)/.exec(last) : null;
    return m ? m[1] : null;
  },
};

runMotoboyOfferContract('aba Corridas DS v2: pages/motoboy/index.tsx', () => ({ api: apiMock, socket: mockSocket, server, geo }), driver);
