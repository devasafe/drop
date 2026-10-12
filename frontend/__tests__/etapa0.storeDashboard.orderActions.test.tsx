/**
 * D1 · Etapa 0 — rede de segurança da tela ATUAL do lojista (`store-dashboard`, aba Pedidos).
 * Só o driver é desta tela; as expectativas ficam em `helpers/sellerOrderContract`.
 * Teste de comportamento: intocável.
 */
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { runSellerOrderContract, SellerOrderDriver, RejectReasonCode, ApiMock } from './helpers/sellerOrderContract';

jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/OnboardingResumeBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/StoreBannerUpload', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/OperatingHoursEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationList', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/ChatConversationDetail', () => ({ __esModule: true, default: () => null }));
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: false, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
jest.mock('../hooks/useAutoRefetch', () => ({
  useAutoRefetch: jest.fn(),
  useSocketListener: jest.fn(),
  useSocketToast: jest.fn(),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

let mockQuery: Record<string, string> = { tab: 'orders' };
jest.mock('next/router', () => ({
  useRouter: () => ({ query: mockQuery, push: jest.fn(), replace: jest.fn(), isReady: true }),
}));

import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import StoreDashboard from '../pages/store-dashboard';

const apiMock = api as unknown as ApiMock;
const STORE = { _id: 'store-1', name: 'Loja Teste', isOpen: true, plan: 2 };

// Rótulos dos motivos na Sheet de recusa da tela atual (store-dashboard.tsx:1262-1268).
const LABEL: Record<RejectReasonCode, string> = {
  store_closed: 'Loja fechada',
  store_busy: 'Loja muito ocupada',
  not_available: 'Itens indisponíveis',
  payment_issue: 'Problema de pagamento',
  other: 'Outro motivo',
};

function card(orderId: string): HTMLElement | null {
  const idLine = screen.queryByText(`ID: ${orderId.toUpperCase()}`);
  return idLine ? (idLine.closest('article') as HTMLElement | null) : null;
}

function mustCard(orderId: string): HTMLElement {
  const c = card(orderId);
  if (!c) throw new Error(`pedido ${orderId} não está na tela`);
  return c;
}

const driver: SellerOrderDriver = {
  async mount(orders) {
    mockQuery = { tab: 'orders' };
    apiMock.get.mockReset();
    apiMock.get.mockImplementation((url: string) =>
      url === '/stores/dashboard'
        ? Promise.resolve({ data: { store: STORE, orders, history: [], categories: [] } })
        : Promise.resolve({ data: {} }),
    );
    apiMock.put.mockReset();
    apiMock.put.mockResolvedValue({ data: {} });
    render(
      <AuthContext.Provider value={{ user: { _id: 'u-loja', activeRole: 'lojista' }, token: 'tok' } as any}>
        <StoreDashboard />
      </AuthContext.Provider>,
    );
    await screen.findByText('Pedidos em Andamento');
  },
  isListed(orderId) {
    return !!card(orderId);
  },
  canAccept(orderId) {
    const c = card(orderId);
    return !!c && !!within(c).queryByRole('button', { name: /Aceitar pedido/ });
  },
  async accept(orderId) {
    // A tela atual confirma com window.confirm (mockado como "OK" no beforeEach).
    fireEvent.click(within(mustCard(orderId)).getByRole('button', { name: /Aceitar pedido/ }));
  },
  async reject(orderId, code, customText) {
    fireEvent.click(within(mustCard(orderId)).getByRole('button', { name: /^Rejeitar$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: LABEL[code] }));
    if (code === 'other') {
      fireEvent.change(within(dialog).getByPlaceholderText('Descreva o motivo...'), { target: { value: customText ?? '' } });
    }
    fireEvent.click(within(dialog).getByRole('button', { name: /Rejeitar Pedido/ }));
  },
  async submitPickupPin(orderId, pin) {
    const c = mustCard(orderId);
    fireEvent.change(within(c).getByPlaceholderText('PIN de retirada'), { target: { value: pin } });
    fireEvent.click(within(c).getByRole('button', { name: 'Validar PIN' }));
  },
};

let confirmSpy: jest.SpyInstance;
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

runSellerOrderContract('tela atual: store-dashboard ?tab=orders', () => apiMock, driver);
