/**
 * D2 · Etapa 0 — rede de segurança da tela de ganhos do motoboy, agora a aba Ganhos nova
 * (`pages/motoboy/ganhos`, P4.11; antes `pages/motoboy/wallet.tsx`). Só o driver é desta tela;
 * as expectativas ficam em `helpers/motoboyMoneyContract`, que não muda (C13).
 * A partir da P4.11 roda também o contrato do saque em conferência (`uncertainAt`), que a tela
 * antiga não tinha (K14).
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { flush, ApiMock } from './helpers/motoboyHarness';
import {
  runMotoboyWithdrawContract, runMotoboyWithdrawUncertainContract, MotoboyWithdrawDriver, WalletFixture,
} from './helpers/motoboyMoneyContract';
import { CONTRACT_MOTOBOY_ID } from './helpers/motoboyRideContract';

const mockToast = jest.fn();
let mockMode: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
let mockLeftover = false;
const mockSocket = { on: () => () => undefined, onReconnect: () => () => undefined, isConnected: true };

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/motoboy/ganhos', asPath: '/motoboy/ganhos' }),
}));
// 'm-1' = CONTRACT_MOTOBOY_ID (a fábrica do jest.mock não pode ler a constante importada).
jest.mock('../contexts/AuthContext', () => ({
  __esModule: true,
  default: require('react').createContext(null),
  useAuth: () => ({ user: { _id: 'm-1', id: 'm-1', name: 'Caio Motoboy', activeRole: 'motoboy', role: 'motoboy' } }),
}));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockMode, __resetSaasConfigCache: jest.fn() }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({
  useCustodyLeftoverState: () => ({ hasLeftover: mockLeftover, loading: false }),
  __resetCustodyLeftoverCache: jest.fn(),
}));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => mockLeftover, __resetCustodyLeftoverCache: jest.fn() }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});

import api from '../lib/api';
import MotoboyGanhosPage from '../pages/motoboy/ganhos';

const apiMock = api as unknown as ApiMock;
const ok = (data: any) => Promise.resolve({ data });

/** PlatformConfig completo (as regras só valem com todos os campos): o mínimo vem da fixture. */
const platformConfig = (f: WalletFixture) => ({
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00',
  motoboyMinimumWithdraw: f.minimum.toFixed(2), customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00',
  transferBlockHours: 24, autoApprovePayouts: false, autoApproveWithdrawals: false,
});

function route(f: WalletFixture) {
  return (url: string) => {
    if (url === `/wallets/motoboy/${CONTRACT_MOTOBOY_ID}`) {
      return ok({ _id: 'w-1', owner: CONTRACT_MOTOBOY_ID, ownerType: 'user', balance: f.available, availableBalance: f.available, pendingBalance: 0, totalIncome: f.available, totalSpent: 0 });
    }
    if (url.startsWith(`/wallets/${CONTRACT_MOTOBOY_ID}/history`)) return ok({ history: [] });
    if (url === '/payouts/my') {
      return ok({ payouts: f.available > 0 ? [{ _id: 'p-1', amount: f.available, status: 'released', orderId: 'order-000001', deliveryId: 'd-old', createdAt: '2026-10-10T12:00:00.000Z' }] : [] });
    }
    if (url === '/payouts/my/summary') {
      return ok({ pending: 0, available: f.available, requested: 0, paid: 0, totalEarned: f.available, earnedThisMonth: f.available, earnedToday: 0 });
    }
    if (url === '/motoboy/transfers') return ok({ data: [], nextCursor: null });
    if (url === '/withdrawals/my-withdrawals') return ok(f.withdrawals ?? []);
    if (url === '/settings/platform-config') return ok(platformConfig(f));
    if (url === '/onboarding/status') return ok({ hasPixKey: true });
    if (url === '/invoices/my') return ok({ invoices: [] });
    if (url === '/deliveries/summary') return ok({ today: { earnings: 0, count: 0 }, week: { earnings: 0, count: 0 } });
    return Promise.reject({ response: { status: 404, data: { error: 'n/a' } } });
  };
}

/** Botões de abrir o saque ("Sacar no Pix" na custódia, "Sacar para minha chave Pix" no saldo antigo), fora da sheet. */
function withdrawButtons(): HTMLButtonElement[] {
  return (screen.queryAllByRole('button', { name: /Sacar/ }) as HTMLButtonElement[]).filter(
    (b) => !b.disabled && !b.closest('[role="dialog"]'),
  );
}

const driver: MotoboyWithdrawDriver = {
  async mount(f) {
    mockMode = { settlementMode: f.mode, directCardEnabled: false, loading: false, error: false, retry: jest.fn() };
    mockLeftover = !!f.custodyLeftover;
    mockToast.mockReset();
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(route(f));
    await act(async () => { render(<MotoboyGanhosPage />); });
    await screen.findByRole('heading', { name: 'Ganhos' });
    await act(async () => { await flush(50); });
    expect(screen.queryAllByRole('status', { name: 'Carregando' })).toHaveLength(0);
  },
  canWithdraw() {
    return withdrawButtons().length > 0;
  },
  async withdrawAll() {
    const open = withdrawButtons()[0];
    if (!open) return;
    await act(async () => { fireEvent.click(open); });
    const dialog = await screen.findByRole('dialog');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /^Tudo/ })); });
    const send = within(dialog).queryByRole('button', { name: /^Sacar R\$/ }) as HTMLButtonElement | null;
    if (!send || send.disabled) return;
    await act(async () => { fireEvent.click(send); });
  },
  shownText() {
    return [document.body.textContent ?? '', ...mockToast.mock.calls.map((c) => String(c[0]))].join('\n');
  },
};

runMotoboyWithdrawContract('tela nova: pages/motoboy/ganhos', () => apiMock, driver);
runMotoboyWithdrawUncertainContract('tela nova: pages/motoboy/ganhos', () => apiMock, driver);
