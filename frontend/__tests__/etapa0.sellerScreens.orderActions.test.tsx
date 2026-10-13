/**
 * D1 · Etapa 0 — rede de segurança das telas NOVAS do lojista: Agora (`/seller/dashboard`) para
 * aceite e recusa, e Pedido (`/seller/pedido/[id]`) para o PIN de retirada. As duas rodam
 * dentro do `SellerPanelProvider` REAL, que carrega os pedidos de GET /stores/dashboard.
 * Só o driver é destas telas; as expectativas ficam em `helpers/sellerOrderContract` (intocável).
 *
 * O GET simula o servidor: o efeito de cada POST que deu certo (aceite → pago, recusa → sai da
 * lista, PIN → retirado) aparece na próxima leitura, como no backend real.
 */
import React, { useState } from 'react';
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { runSellerOrderContract, SellerOrderDriver, ApiMock } from './helpers/sellerOrderContract';

jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../lib/socket', () => ({
  connectSocket: () => ({ connected: false, connect: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() }),
  getSocket: () => null,
}));
jest.mock('../hooks/useAutoRefetch', () => ({
  useAutoRefetch: jest.fn(),
  useSocketListener: jest.fn(),
  useSocketToast: jest.fn(),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 'store-1' }, products: [], loading: false }) }));
jest.mock('../hooks/useSync', () => ({ useOrder: (id?: string) => mockUseOrder(id) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

let mockQuery: Record<string, string> = {};
jest.mock('next/router', () => ({
  useRouter: () => ({ query: mockQuery, push: jest.fn(), replace: jest.fn(), back: jest.fn(), asPath: '/seller/dashboard', pathname: '/seller/dashboard', isReady: true }),
}));

import api from '../lib/api';
import AuthContext from '../contexts/AuthContext';
import { SellerPanelProvider } from '../components/seller/panel/SellerPanelProvider';
import AgoraPage from '../pages/seller/dashboard';
import SellerPedidoPage from '../pages/seller/pedido/[id]';
import { REJECT_REASONS } from '../lib/sellerOrders';
import { SELLER_ROUTES } from '../lib/sellerRoutes';

const apiMock = api as unknown as ApiMock & { delete: jest.Mock };
const STORE = { _id: 'store-1', name: 'Loja Teste', isOpen: true, plan: 2 };

// ── servidor de mentira ──────────────────────────────────────────────────────
let serverOrders: any[] = [];

const clone = (o: any) => ({ ...o, delivery: o.delivery ? { ...o.delivery } : o.delivery });

/** Estado do servidor: os pedidos montados + o efeito de cada POST que já respondeu com sucesso. */
async function serverState(): Promise<any[]> {
  const { calls, results } = apiMock.post.mock;
  const settled = await Promise.allSettled(results.map((r) => (r.type === 'return' ? r.value : Promise.reject(r.value))));
  let list = serverOrders.map(clone);
  calls.forEach((c, i) => {
    if (settled[i]?.status !== 'fulfilled') return;
    const url = String(c[0]);
    let m = url.match(/^\/orders\/([^/]+)\/accept$/);
    if (m) {
      const id = m[1];
      list = list.map((o) => (o._id === id ? { ...o, status: 'pago', acceptedAt: new Date().toISOString() } : o));
      return;
    }
    m = url.match(/^\/orders\/([^/]+)\/reject$/);
    if (m) {
      const id = m[1];
      list = list.filter((o) => o._id !== id);
      return;
    }
    m = url.match(/^\/deliveries\/([^/]+)\/validar-pin-retirada$/);
    if (m) {
      const did = m[1];
      list = list.map((o) => (o.delivery?._id === did ? { ...o, delivery: { ...o.delivery, status: 'picked', pickedAt: new Date().toISOString() } } : o));
    }
  });
  return list;
}

function mockUseOrder(id?: string) {
  const [order, setOrder] = useState<any>(() => {
    const o = serverOrders.find((x) => x._id === id);
    return o ? clone(o) : null;
  });
  return { order, loading: false, setOrder };
}

// ── navegação entre Agora e Pedido com o mesmo provider (como no _app) ───────
type View = { screen: 'agora' } | { screen: 'pedido'; id: string };
let goTo: (v: View) => void = () => undefined;
let currentView: View = { screen: 'agora' };

function Screens() {
  const [view, setView] = useState<View>({ screen: 'agora' });
  goTo = setView;
  currentView = view;
  return view.screen === 'agora' ? <AgoraPage /> : <SellerPedidoPage key={view.id} />;
}

// ── consultas na tela ─────────────────────────────────────────────────────────
const newCard = (orderId: string) => screen.queryByTestId(`novo-${orderId}`);

function mustNewCard(orderId: string): HTMLElement {
  const c = newCard(orderId);
  if (!c) throw new Error(`pedido ${orderId} não está em "Novos pedidos"`);
  return c;
}

/** Na Agora todo pedido em andamento (novo ou não) tem um link para a tela do pedido. */
function isListed(orderId: string): boolean {
  return document.querySelector(`a[href="${SELLER_ROUTES.pedido(orderId)}"]`) !== null;
}

/** Faz o gesto dentro do act e deixa as promessas (POST, recarga do painel) assentarem nele. */
async function gesture(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function showPedido(orderId: string) {
  if (currentView.screen === 'pedido' && currentView.id === orderId) return;
  mockQuery = { id: orderId };
  act(() => goTo({ screen: 'pedido', id: orderId }));
  await screen.findByLabelText(/PIN de 5 dígitos/);
}

const driver: SellerOrderDriver = {
  async mount(orders) {
    serverOrders = orders.map(clone);
    mockQuery = {};
    currentView = { screen: 'agora' };
    apiMock.get.mockReset();
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === '/stores/dashboard') {
        return { data: { store: STORE, orders: await serverState(), history: [], categories: [] } };
      }
      const m = url.match(/^\/orders\/([^/]+)$/);
      if (m) {
        const o = (await serverState()).find((x) => x._id === m[1]);
        if (o) return { data: o };
      }
      throw new Error(`GET ${url} fora do contrato`);
    });
    apiMock.put.mockReset();
    apiMock.put.mockResolvedValue({ data: {} });
    apiMock.delete.mockReset();
    apiMock.delete.mockResolvedValue({ data: {} });
    render(
      <AuthContext.Provider value={{ user: { _id: 'u-loja', id: 'u-loja', activeRole: 'lojista', role: 'lojista' }, token: 'tok', can: () => true } as any}>
        <SellerPanelProvider>
          <Screens />
        </SellerPanelProvider>
      </AuthContext.Provider>,
    );
    await waitFor(() => expect(orders.every((o) => isListed(o._id))).toBe(true));
    // A busca dos números de hoje (fora do contrato) falha e termina aqui, dentro do act.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  },
  isListed,
  canAccept(orderId) {
    const c = newCard(orderId);
    return !!c && !!within(c).queryByRole('button', { name: /aceitar pedido/i });
  },
  async accept(orderId) {
    // Aceite em dois toques no mesmo botão (sem window.confirm).
    const c = mustNewCard(orderId);
    fireEvent.click(within(c).getByRole('button', { name: /aceitar pedido/i }));
    await gesture(() => fireEvent.click(within(c).getByRole('button', { name: /toque de novo/i })));
  },
  async reject(orderId, code, customText) {
    fireEvent.click(within(mustNewCard(orderId)).getByRole('button', { name: 'Recusar' }));
    const reason = REJECT_REASONS.find((r) => r.code === code);
    if (!reason) throw new Error(`motivo ${code} não existe na tela`);
    fireEvent.click(await screen.findByLabelText(reason.label));
    if (code === 'other') {
      fireEvent.change(screen.getByLabelText('Conte o motivo'), { target: { value: customText ?? '' } });
    }
    await gesture(() => fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' })));
  },
  async submitPickupPin(orderId, pin) {
    // O PIN fica na tela do pedido; ela envia sozinha ao completar os 5 dígitos.
    await showPedido(orderId);
    await gesture(() => fireEvent.change(screen.getByLabelText(/PIN de 5 dígitos/), { target: { value: pin } }));
  },
};

runSellerOrderContract('telas novas: Agora + Pedido no SellerPanelProvider', () => apiMock, driver);
