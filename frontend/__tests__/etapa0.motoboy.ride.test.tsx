/**
 * D2 · Etapa 0 — rede de segurança da corrida, agora na tela nova (`pages/motoboy/corrida/[id].tsx`, P3.13).
 * Só o driver é desta tela; as expectativas ficam em `helpers/motoboyRideContract`.
 * Roda também o contrato do cliente ausente (C13/K12), que a tela antiga não tinha.
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react';
import { createSocketHarness, createServer, installGeoMock, ApiMock, GeoHarness, callsTo, flush } from './helpers/motoboyHarness';
import {
  runMotoboyRideContract, runMotoboyAbsentContract, MotoboyRideDriver, MotoboyAbsentDriver, RIDE_ID,
} from './helpers/motoboyRideContract';

const mockSocket = createSocketHarness();
const mockPush = jest.fn();
const mockReplace = jest.fn();
// 'd-ride' = RIDE_ID do contrato (a fábrica do jest.mock não pode ler a constante importada).
// A query é mutável: o driver do cliente ausente abre a corrida com ?etapa=ausente (K12).
let mockQuery: Record<string, string> = { id: 'd-ride' };

jest.mock('../contexts/SocketContext', () => ({
  __esModule: true,
  default: require('react').createContext(null),
  useSocket: () => mockSocket.api,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('next/router', () => ({
  useRouter: () => ({
    query: mockQuery, push: mockPush, replace: mockReplace,
    pathname: '/motoboy/corrida/[id]', asPath: '/motoboy/corrida/d-ride', isReady: true,
  }),
}));
jest.mock('../hooks/useRequireAuth', () => ({ __esModule: true, default: () => {} }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// Casca do painel (bloco das Convenções da P3): título como heading, sem o PanelShell real.
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, back, bare, children }: any) => (
    <div data-shell={bare ? 'bare' : 'top'} data-back={back || ''}>{!bare && <h1>{title}</h1>}{actions}{children}</div>
  );
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm-1', _id: 'm-1', name: 'Motoboy Contrato', role: 'motoboy' } }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', loading: false, error: false }) }));
jest.mock('../hooks/useGamificationFeatures', () => ({
  useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: false, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }),
}));

import api from '../lib/api';
import CorridaPage from '../pages/motoboy/corrida/[id]';
import { PROBLEM_OPTIONS } from '../components/motoboy/corrida/ProblemSheet';

const apiMock = api as unknown as ApiMock;
const server = createServer();
let geo: GeoHarness;

beforeEach(() => {
  mockSocket.reset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockQuery = { id: RIDE_ID };
  geo = installGeoMock();
});
afterEach(() => geo.restore());

/** Monta a corrida e espera a 1ª leitura do servidor chegar à tela. */
async function mountRide() {
  apiMock.get.mockReset();
  apiMock.get.mockImplementation((url: string) =>
    url === `/deliveries/${RIDE_ID}`
      ? Promise.resolve({ data: server.ride })
      : Promise.resolve({ data: {} }),
  );
  render(<CorridaPage />);
  await waitFor(() => expect(callsTo(apiMock.get, `/deliveries/${RIDE_ID}`).length).toBeGreaterThan(0));
  await act(async () => { await flush(); });
}

const PROBLEM_BUTTON = /^Tive um problema na (retirada|entrega)$/;

const driver: MotoboyRideDriver = {
  mount: mountRide,
  stage() {
    if (screen.queryByTestId('pin-retirada')) return 'pickup';
    if (screen.queryByRole('heading', { name: 'Entregar ao cliente' }) && screen.queryByLabelText('Código do cliente')) return 'deliver';
    return 'other';
  },
  visiblePickupPin() {
    const pin = screen.queryByTestId('pin-retirada')?.textContent?.trim();
    return pin && pin !== '—' ? pin : null;
  },
  async submitDeliveryPin(pin) {
    fireEvent.change(screen.getByLabelText('Código do cliente'), { target: { value: pin } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Finalizar entrega' }));
    });
  },
  completed() {
    return !!screen.queryByText('Entrega concluída');
  },
  async giveBack(code) {
    const etapa = driver.stage() === 'pickup' ? 'retirar' : 'entregar';
    // K10: a opção com o mesmo código na etapa; se a etapa não a tiver, a 1ª opção de devolver.
    const rejects = PROBLEM_OPTIONS[etapa].filter((o) => o.kind === 'reject');
    const option = rejects.find((o) => o.code === code) ?? rejects[0];
    const problem = screen.queryByRole('button', { name: PROBLEM_BUTTON });
    if (problem) {
      fireEvent.click(problem);
    } else {
      // Retirada atrasada: o caminho é o "Devolver corrida" do bloco "Se não der para esperar",
      // que abre a sheet já num motivo; "Voltar" leva à lista de motivos.
      fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Voltar' }));
    }
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`^${option.label}`) }));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Devolver corrida' }));
    });
  },
  shownText() {
    return document.body.textContent ?? '';
  },
};

runMotoboyRideContract('tela nova: pages/motoboy/corrida/[id].tsx', () => ({ api: apiMock, socket: mockSocket, server, geo }), driver);

const ABSENT_BUTTON = /^Encerrar como ausente/;

const absentDriver: MotoboyAbsentDriver = {
  async mount() {
    mockQuery = { id: RIDE_ID, etapa: 'ausente' };
    await mountRide();
    await screen.findByRole('heading', { name: 'Cliente não atende' });
  },
  canMarkAbsent() {
    const b = screen.queryByRole('button', { name: ABSENT_BUTTON }) as HTMLButtonElement | null;
    return !!b && !b.disabled;
  },
  async markAbsent() {
    const b = screen.queryByRole('button', { name: ABSENT_BUTTON });
    if (!b) return;
    await act(async () => {
      fireEvent.click(b);
    });
  },
  shownText() {
    return document.body.textContent ?? '';
  },
};

runMotoboyAbsentContract('tela nova: pages/motoboy/corrida/[id].tsx', () => ({ api: apiMock, socket: mockSocket, server, geo }), absentDriver);
