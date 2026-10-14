/**
 * D2 · Etapa 0 — rede de segurança da tela ATUAL de ganhos do motoboy (`pages/motoboy/wallet.tsx`).
 * Só o driver é desta tela; as expectativas ficam em `helpers/motoboyMoneyContract`.
 * O contrato do saque em conferência NÃO roda aqui: a tela atual não tem esse bloqueio (roda na P4).
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { flush, ApiMock } from './helpers/motoboyHarness';
import { runMotoboyWithdrawContract, MotoboyWithdrawDriver, WalletFixture } from './helpers/motoboyMoneyContract';
import { CONTRACT_MOTOBOY_ID } from './helpers/motoboyRideContract';

const mockToast = jest.fn();
let mockMode: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
let mockLeftover = false;

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/motoboy/wallet', asPath: '/motoboy/wallet' }),
}));
// 'm-1' = CONTRACT_MOTOBOY_ID (a fábrica do jest.mock não pode ler a constante importada).
jest.mock('../contexts/AuthContext', () => ({
  __esModule: true,
  default: require('react').createContext(null),
  useAuth: () => ({ user: { _id: 'm-1', id: 'm-1', name: 'Caio Motoboy', activeRole: 'motoboy', role: 'motoboy' } }),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockMode }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => mockLeftover }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

import api from '../lib/api';
import MotoboyWalletPage from '../pages/motoboy/wallet';

const apiMock = api as unknown as ApiMock;
const ok = (data: any) => Promise.resolve({ data });

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
    return Promise.reject({ response: { status: 404, data: { error: 'n/a' } } });
  };
}

function withdrawButtons(): HTMLButtonElement[] {
  return (screen.queryAllByRole('button', { name: /Sacar/ }) as HTMLButtonElement[]).filter(
    (b) => !b.disabled && !b.closest('[role="dialog"]'),
  );
}

const driver: MotoboyWithdrawDriver = {
  async mount(f) {
    mockMode = { settlementMode: f.mode, directCardEnabled: false, loading: false };
    mockLeftover = !!f.custodyLeftover;
    mockToast.mockReset();
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(route(f));
    await act(async () => { render(<MotoboyWalletPage />); });
    await screen.findByRole('heading', { name: /Ganhos e saques|Repasses recebidos/ });
    await act(async () => { await flush(50); });
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
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /^Sacar/ })); });
  },
  shownText() {
    return [document.body.textContent ?? '', ...mockToast.mock.calls.map((c) => String(c[0]))].join('\n');
  },
};

runMotoboyWithdrawContract('tela atual: pages/motoboy/wallet.tsx', () => apiMock, driver);
