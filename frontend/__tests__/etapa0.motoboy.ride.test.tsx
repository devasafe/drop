/**
 * D2 · Etapa 0 — rede de segurança da tela ATUAL da corrida (`pages/motoboy/delivery/[id].tsx`).
 * Só o driver é desta tela; as expectativas ficam em `helpers/motoboyRideContract`.
 * O contrato do cliente ausente NÃO roda aqui: a tela atual não tem esse fluxo (roda na P3).
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { createSocketHarness, createServer, installGeoMock, ApiMock, GeoHarness } from './helpers/motoboyHarness';
import { runMotoboyRideContract, MotoboyRideDriver, GiveBackCode, RIDE_ID } from './helpers/motoboyRideContract';

const mockSocket = createSocketHarness();
const mockPush = jest.fn();

jest.mock('../contexts/SocketContext', () => ({
  __esModule: true,
  default: require('react').createContext(null),
  useSocket: () => mockSocket.api,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
// 'd-ride' = RIDE_ID do contrato (a fábrica do jest.mock não pode ler a constante importada).
jest.mock('next/router', () => ({
  useRouter: () => ({
    query: { id: 'd-ride' }, push: mockPush, replace: jest.fn(),
    pathname: '/motoboy/delivery/[id]', asPath: '/motoboy/delivery/d-ride', isReady: true,
  }),
}));
jest.mock('../hooks/useRequireAuth', () => ({ __esModule: true, default: () => {} }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import api from '../lib/api';
import MotoboyDeliveryDetail from '../pages/motoboy/delivery/[id]';

const apiMock = api as unknown as ApiMock;
const server = createServer();
let geo: GeoHarness;

beforeEach(() => {
  mockSocket.reset();
  mockPush.mockReset();
  geo = installGeoMock();
});
afterEach(() => geo.restore());

// Rótulos dos motivos no RejectDeliveryModal atual (components/delivery/RejectDeliveryModal.tsx:17-23).
const LABEL: Record<GiveBackCode, string> = {
  motoboy_unavailable: 'Indisponível para continuar',
  delivery_failed: 'Impossível entregar',
  address_invalid: 'Endereço inválido',
};
const PICKUP_HINT = 'Informe este PIN à loja para autorizar a retirada:';

const driver: MotoboyRideDriver = {
  async mount() {
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: string) =>
      url === `/deliveries/${RIDE_ID}`
        ? Promise.resolve({ data: server.ride })
        : Promise.resolve({ data: {} }),
    );
    render(<MotoboyDeliveryDetail />);
    await screen.findByText('Detalhes da entrega');
  },
  stage() {
    if (screen.queryByText(PICKUP_HINT)) return 'pickup';
    if (screen.queryByPlaceholderText('PIN do cliente')) return 'deliver';
    return 'other';
  },
  visiblePickupPin() {
    const pin = screen.queryByText(PICKUP_HINT)?.nextElementSibling?.textContent?.trim();
    return pin || null;
  },
  async submitDeliveryPin(pin) {
    fireEvent.change(screen.getByPlaceholderText('PIN do cliente'), { target: { value: pin } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Finalizar entrega' }));
    });
  },
  completed() {
    return !!screen.queryByText('Entrega finalizada com sucesso!') || mockPush.mock.calls.some((c) => c[0] === '/motoboy');
  },
  async giveBack(code) {
    fireEvent.click(screen.getByRole('button', { name: 'Rejeitar entrega' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`^${LABEL[code]}`) }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Próximo' }));
    // Depois da retirada a tela atual pergunta a ação: devolver ao pool é a única que o servidor aceita.
    const pool = within(dialog).queryByRole('radio', { name: /^Devolver ao pool/ });
    if (pool) {
      fireEvent.click(pool);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Próximo' }));
    }
    const confirm = await within(dialog).findByRole('button', { name: 'Devolver entrega' });
    await act(async () => {
      fireEvent.click(confirm);
    });
  },
  shownText() {
    return document.body.textContent ?? '';
  },
};

runMotoboyRideContract('tela atual: pages/motoboy/delivery/[id].tsx', () => ({ api: apiMock, socket: mockSocket, server, geo }), driver);
