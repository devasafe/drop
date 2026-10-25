/**
 * D3b-2b · P3.5 — lojista:
 * - /seller/plano: o pedido de troca aceita um motivo opcional (até 500), que vai aparado e só quando escrito;
 * - mensalidade cancelada (ruling 8): /seller/assinatura e o cartão do Agora dizem até quando a loja vende. A
 *   mensalidade nunca bloqueia a cancelada (onStatus(..., false)): depois do período o texto é só informativo
 *   ("Mensalidade cancelada · vendeu até DD/MM"); quem tira a loja do ar é a pausa do DROP (onda final);
 * - lib/saasBilling: "vende até" (o `sellsUntil` que o servidor manda; a tela não recalcula a cobertura) e bloqueio.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerPlano from '../pages/seller/plano';
import SellerAssinatura from '../pages/seller/assinatura';
import { SaasPausedCard } from '../components/seller/agora/SaasPausedCard';
import api from '../lib/api';
import {
  formatDayMonth, saasCancelledSellsUntil, saasStatusMessage, saasStoreBlocked,
} from '../lib/saasBilling';

let mockBilling: Record<string, unknown> = {};
const mockPanel = {
  inPanel: true, loading: false, refresh: jest.fn(), orders: [], newOrderCount: 0,
  store: { _id: 's1', plan: 2, customCommissionRate: null, featuredBannerUrl: null },
};

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/plano' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista', storeId: 's1' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() }),
}));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ loading: false, hasLeftover: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const billing = (over: Record<string, unknown> = {}) => ({
  status: 'active', trialEndsAt: null, paidUntil: '2030-11-17T12:00:00.000Z', fee: 149,
  nextPayment: null, blocked: false, pendingReason: null, payments: [], blockAt: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockBilling = billing();
  get.mockImplementation((url: string) => {
    if (url === '/settings/store-subscription') return Promise.resolve({ data: { currentPlan: 'plan2', requestedPlan: null, planChangeStatus: 'none' } });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
    if (url === '/analytics/store/overview') {
      return Promise.resolve({ data: { current: { revenue: 1000, orders: 10, productsSold: 10, avgTicket: 100, cancellationRate: 0 } } });
    }
    if (url === '/stores/s1/saas-billing') return Promise.resolve({ data: { success: true, data: mockBilling } });
    return Promise.resolve({ data: {} });
  });
  post.mockResolvedValue({ data: { subscription: { currentPlan: 'plan2', requestedPlan: 'plan3', planChangeStatus: 'pending' } } });
});

describe('/seller/plano: motivo opcional no pedido de troca', () => {
  it('escrito: vai aparado no corpo', async () => {
    render(<ToastProvider><SellerPlano /></ToastProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar para Premium' }));
    const motivo = await screen.findByLabelText('Motivo para o DROP (opcional)');
    expect(motivo).toHaveAttribute('maxlength', '500');
    fireEvent.change(motivo, { target: { value: '  Quero o banner no Início  ' } });
    fireEvent.click(screen.getByText('Pedir troca'));
    await waitFor(() => expect(post).toHaveBeenCalledWith(
      '/settings/store-subscription/request-change', { newPlan: 'plan3', reason: 'Quero o banner no Início' },
    ));
  });

  it('em branco (ou só espaços): o corpo é o de hoje, sem reason; abrir de novo começa vazio', async () => {
    render(<ToastProvider><SellerPlano /></ToastProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar para Premium' }));
    fireEvent.change(await screen.findByLabelText('Motivo para o DROP (opcional)'), { target: { value: 'rascunho' } });
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar para Vitrine' }));
    const motivo = await screen.findByLabelText('Motivo para o DROP (opcional)');
    expect(motivo).toHaveValue('');
    fireEvent.change(motivo, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Pedir troca'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/settings/store-subscription/request-change', { newPlan: 'plan1' }));
  });
});

describe('mensalidade cancelada no lojista', () => {
  it('/seller/assinatura dentro do período: "Cancelada · vende até DD/MM" e o que acontece depois', async () => {
    mockBilling = billing({
      status: 'cancelled', paidUntil: '2030-11-17T00:00:00.000Z', cancelledAt: '2026-10-20T12:00:00.000Z', sellsUntil: '2030-11-18T02:59:59.999Z',
    });
    render(<SellerAssinatura />);
    expect(await screen.findByText('Cancelada · vende até 17/11')).toBeInTheDocument();
    expect(screen.getByText(
      'A cobrança parou. Depois dessa data a loja sai da vitrine e não recebe pedidos novos. Para continuar, fale com o suporte.',
    )).toBeInTheDocument();
  });

  // Onda final: depois do período o aviso é informativo (sem bloqueio); a pausa do DROP tem a faixa própria.
  it('/seller/assinatura depois do período: "Mensalidade cancelada · vendeu até DD/MM", sem o aviso vermelho', async () => {
    mockBilling = billing({ status: 'cancelled', paidUntil: '2026-01-10T00:00:00.000Z', sellsUntil: '2026-01-11T02:59:59.999Z' });
    render(<SellerAssinatura />);
    expect(await screen.findByText('Mensalidade cancelada · vendeu até 10/01')).toBeInTheDocument();
    expect(screen.queryByText('A loja não recebe pedidos novos. Para voltar a vender, fale com o suporte.')).not.toBeInTheDocument();
    expect(screen.getByText('A cobrança parou. Para continuar, fale com o suporte.')).toBeInTheDocument();
    expect(screen.getByLabelText('Situação').className).not.toMatch(/blkDanger/);
  });

  it('Agora, dentro do período: avisa até quando vende e não bloqueia a loja', async () => {
    mockBilling = { status: 'cancelled', trialEndsAt: '2030-11-01T12:00:00.000Z', paidUntil: null, sellsUntil: '2030-11-02T02:59:59.999Z' };
    const onStatus = jest.fn();
    render(<SaasPausedCard storeId="s1" onStatus={onStatus} />);
    expect(await screen.findByText('Mensalidade cancelada')).toBeInTheDocument();
    expect(screen.getByText('Você vende até 01/11. Depois disso a loja sai da vitrine e não recebe pedidos novos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Falar com o suporte' })).toHaveAttribute('href', '/seller/ajuda');
    expect(onStatus).toHaveBeenCalledWith('cancelled', false);
  });

  it('Agora, depois do período: aviso informativo "vendeu até" e a mensalidade não bloqueia a loja', async () => {
    mockBilling = { status: 'cancelled', trialEndsAt: '2026-01-01T12:00:00.000Z', paidUntil: '2026-02-01T00:00:00.000Z', sellsUntil: '2026-02-02T02:59:59.999Z' };
    const onStatus = jest.fn();
    render(<SaasPausedCard storeId="s1" onStatus={onStatus} />);
    expect(await screen.findByText('Mensalidade cancelada · vendeu até 01/02')).toBeInTheDocument();
    expect(screen.queryByText('Assinatura cancelada')).not.toBeInTheDocument();
    expect(screen.queryByText('Fale com a DROP para voltar a vender.')).not.toBeInTheDocument();
    expect(onStatus).toHaveBeenCalledWith('cancelled', false);
  });
});

it('lib/saasBilling: "vende até" pelo sellsUntil do servidor, bloqueio e DD/MM', () => {
  const now = new Date('2026-10-21T15:00:00.000Z');
  // sellsUntil = último instante coberto (P2): 18/11 02:59:59.999Z é 17/11 23:59 em Brasília.
  expect(saasCancelledSellsUntil({ status: 'cancelled', sellsUntil: '2026-11-18T02:59:59.999Z' }, now)).toBe('2026-11-18T02:59:59.999Z');
  expect(saasCancelledSellsUntil({ status: 'cancelled', sellsUntil: '2026-10-11T02:59:59.999Z' }, now)).toBeNull();
  expect(saasCancelledSellsUntil({ status: 'cancelled' }, now)).toBeNull(); // sem o campo: bloqueada, como hoje
  expect(saasCancelledSellsUntil({ status: 'active', sellsUntil: null }, now)).toBeNull();
  expect(saasStoreBlocked({ status: 'cancelled', sellsUntil: '2026-11-18T02:59:59.999Z' })).toBe(false);
  // onda final: só `paused` bloqueia; a cancelada vencida não (o bloqueio dela é a pausa do DROP)
  expect(saasStoreBlocked({ status: 'cancelled', sellsUntil: null })).toBe(false);
  expect(saasStoreBlocked({ status: 'cancelled', sellsUntil: '2026-10-11T02:59:59.999Z' })).toBe(false);
  expect(saasStoreBlocked({ status: 'paused', sellsUntil: null })).toBe(true);
  expect(saasStoreBlocked({ status: 'past_due', sellsUntil: null })).toBe(false);
  expect(formatDayMonth('2026-10-16T03:00:00.000Z')).toBe('16/10');
  expect(formatDayMonth(null)).toBe('');
  expect(saasStatusMessage({ status: 'cancelled', paidUntil: '2026-11-17T00:00:00.000Z', trialEndsAt: null, sellsUntil: '2026-11-18T02:59:59.999Z' }, now))
    .toBe('Cancelada · vende até 17/11');
  expect(saasStatusMessage({ status: 'cancelled', paidUntil: null, trialEndsAt: null, sellsUntil: '2026-10-11T02:59:59.999Z' }, now))
    .toBe('Mensalidade cancelada · vendeu até 10/10');
  expect(saasStatusMessage({ status: 'cancelled', paidUntil: null, trialEndsAt: null, sellsUntil: null }, now)).toBe('Mensalidade cancelada');
});
