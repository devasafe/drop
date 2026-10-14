/**
 * D2 · Etapa 0 — rede de segurança da tela ATUAL de ofertas do motoboy (`pages/motoboy/index.tsx`).
 * Só o driver é desta tela; as expectativas ficam em `helpers/motoboyRideContract`.
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { createSocketHarness, createServer, installGeoMock, flush, ApiMock, GeoHarness } from './helpers/motoboyHarness';
import { runMotoboyOfferContract, MotoboyOfferDriver, CONTRACT_MOTOBOY_ID } from './helpers/motoboyRideContract';

const mockSocket = createSocketHarness();
const mockPush = jest.fn();
const mockToast = jest.fn();

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
jest.mock('../components/OnboardingResumeBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('../hooks/useMotoboyStatus', () => ({
  useMotoboyStatus: () => ({ online: true, loading: false, setOnline: jest.fn(), gps: 'active' }),
}));
jest.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, permission: 'default', busy: false, enable: jest.fn(), sendTest: jest.fn() }),
}));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }),
}));

import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import MotoboyPage from '../pages/motoboy/index';

const apiMock = api as unknown as ApiMock;
const server = createServer();
let geo: GeoHarness;

beforeEach(() => {
  mockSocket.reset();
  geo = installGeoMock();
});
afterEach(() => geo.restore());

function route(url: string) {
  if (url === '/deliveries/available') return Promise.resolve({ data: [...server.offers] });
  if (url === '/deliveries/ongoing' || url === '/deliveries/history') return Promise.resolve({ data: [] });
  return Promise.resolve({ data: {} });
}

// Ofertas vistas na montagem (o card da tela atual é achado pelo código do pedido).
const seen = new Map<string, any>();

function card(id: string): HTMLElement | null {
  const o = seen.get(id);
  if (!o) return null;
  const code = String(o.orderId || o._id).slice(-6).toUpperCase();
  let el: HTMLElement | null = screen.queryByText(`PEDIDO #${code}`);
  while (el && !within(el).queryByRole('button', { name: /Aceitar por/ })) el = el.parentElement;
  return el;
}

function acceptButton(id: string): HTMLButtonElement | null {
  const c = card(id);
  return c ? (within(c).queryByRole('button', { name: /Aceitar por/ }) as HTMLButtonElement | null) : null;
}

const driver: MotoboyOfferDriver = {
  async mount() {
    seen.clear();
    server.offers.forEach((o) => seen.set(o._id, o));
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(route);
    mockPush.mockReset();
    mockToast.mockReset();
    render(
      <AuthContext.Provider value={{ user: { _id: CONTRACT_MOTOBOY_ID, name: 'Caio Motoboy', activeRole: 'motoboy' }, token: 'tok' } as any}>
        <MotoboyPage />
      </AuthContext.Provider>,
    );
    await screen.findByText('Corridas disponíveis');
    // A tela relê o pool ao ficar online (debounce de 300 ms): espera essa leitura terminar.
    await flush(400);
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
  },
  async skip(id) {
    const c = card(id);
    if (c) fireEvent.click(within(c).getByRole('button', { name: 'Recusar' }));
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

runMotoboyOfferContract('tela atual: pages/motoboy/index.tsx', () => ({ api: apiMock, socket: mockSocket, server, geo }), driver);
