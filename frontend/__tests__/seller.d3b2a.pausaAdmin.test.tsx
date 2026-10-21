/**
 * D3b-2a · P3.5 — loja pausada pelo DROP, do lado do lojista (spec 5.4 e 7): faixa "Loja pausada pelo DROP:
 * <motivo>. Fale com o suporte." no Agora, na Loja e em Horários; abrir, "Abrir agora", pausar e reabrir
 * desligados com o mesmo texto; o 409 STORE_ADMIN_PAUSED (dado velho) mostra a mensagem e relê o painel.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../lib/api';
import AgoraPage from '../pages/seller/dashboard';
import SellerLoja from '../pages/seller/loja';
import SellerHorarios from '../pages/seller/horarios';
import { PauseSheet } from '../components/seller/loja/PauseSheet';
import { adminPauseOf, adminPausedText, storeAdminPausedError } from '../lib/storeAdminPause';

const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), query: {}, asPath: '/seller/dashboard', pathname: '/seller/dashboard', isReady: true }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', id: 'u1', name: 'Ana', email: 'ana@x.com', activeRole: 'lojista', role: 'lojista', roles: ['lojista', 'cliente'] },
    can: () => true, loading: false, permissionsLoading: false, logout: jest.fn(), switchRole: jest.fn(),
  }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, lead, actions, children }: any) => <div>{lead}<h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false, retry: jest.fn() }),
}));
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: [], loading: false }) }));
jest.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, permission: 'default', busy: false, enable: jest.fn(), disable: jest.fn(), sendTest: jest.fn() }),
}));
jest.mock('../components/StoreQRCode', () => ({ __esModule: true, default: () => <div>QR da loja</div> }));
jest.mock('../lib/storeOnboarding', () => ({
  loadStoreOnboarding: () => Promise.resolve({ mode: 'custodia', store: { _id: 's1' }, productsCount: 3, steps: [], current: null, allSubmitted: true, approved: true }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;
const TEXTO = 'Loja pausada pelo DROP: Documentos vencidos. Fale com o suporte.';
const base = { _id: 's1', name: 'Eletro Center', plan: 2, isOpen: true, isVerified: true, operatingHours: null, pausedUntil: null, adminPausedAt: null, adminPauseReason: null };
const pausadaPeloDrop = { ...base, adminPausedAt: '2026-10-20T12:00:00.000Z', adminPauseReason: 'Documentos vencidos' };
const conflito = (data: Record<string, unknown>) => ({ response: { status: 409, data } });
// Os dois formatos reais da P1.5: horário responde direto; pausar e despausar passam pelo formato do errorHandler.
const SELLER_MSG = 'Sua loja está pausada pelo DROP. Fale com o suporte.';
const horarioPausado = (reason: string | null) => conflito({ error: SELLER_MSG, code: 'STORE_ADMIN_PAUSED', reason });
const pausaPausada = (reason: string | null) =>
  conflito({ success: false, error: { message: SELLER_MSG, statusCode: 409, code: 'STORE_ADMIN_PAUSED', reason } });

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { inPanel: false, store: { ...base }, orders: [], refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 0, patchOrder: jest.fn(), removeOrder: jest.fn(), clearNewOrders: jest.fn() };
  get.mockImplementation((url: string) => {
    if (url === '/stores/s1/ratings') return Promise.resolve({ data: [] });
    return Promise.reject(new Error('n/a'));
  });
});

async function renderPage(ui: JSX.Element) {
  const r = render(ui);
  await act(async () => { await Promise.resolve(); });
  return r;
}

describe('lib/storeAdminPause', () => {
  it('pausada = adminPausedAt preenchido; motivo aparado ou null', () => {
    expect(adminPauseOf(base)).toBeNull();
    expect(adminPauseOf(null)).toBeNull();
    expect(adminPauseOf(pausadaPeloDrop)).toEqual({ reason: 'Documentos vencidos' });
    expect(adminPauseOf({ ...pausadaPeloDrop, adminPauseReason: '  ' })).toEqual({ reason: null });
  });

  it('texto da faixa, sem ponto duplicado', () => {
    expect(adminPausedText('Documentos vencidos')).toBe(TEXTO);
    expect(adminPausedText('Documentos vencidos.')).toBe(TEXTO);
    expect(adminPausedText(null)).toBe('Loja pausada pelo DROP. Fale com o suporte.');
  });

  it('409 STORE_ADMIN_PAUSED nos dois formatos da P1.5 (código em `code` ou em `error.code`); outro erro não conta', () => {
    expect(storeAdminPausedError(horarioPausado('Documentos vencidos'))).toEqual({ reason: 'Documentos vencidos' });
    expect(storeAdminPausedError(horarioPausado(null))).toEqual({ reason: null });
    expect(storeAdminPausedError(pausaPausada('Documentos vencidos'))).toEqual({ reason: 'Documentos vencidos' });
    expect(storeAdminPausedError(pausaPausada(null))).toEqual({ reason: null });
    expect(storeAdminPausedError(conflito({ error: 'STORE_ADMIN_PAUSED' }))).toBeNull();
    expect(storeAdminPausedError(conflito({ error: 'Loja fechada', code: 'STORE_CLOSED' }))).toBeNull();
    expect(storeAdminPausedError({ response: { status: 400, data: { code: 'STORE_ADMIN_PAUSED' } } })).toBeNull();
    expect(storeAdminPausedError(new Error('x'))).toBeNull();
  });
});

describe('Agora', () => {
  it('pausada pelo DROP: faixa com o motivo, interruptor desligado com o mesmo texto, sem "Abrir agora" nem "Voltar agora"', async () => {
    mockPanel.store = { ...pausadaPeloDrop, pausedUntil: new Date(Date.now() + 3_600_000).toISOString() };
    await renderPage(<AgoraPage />);
    expect(screen.getAllByText(TEXTO).length).toBeGreaterThanOrEqual(2);
    const chave = screen.getByRole('switch');
    expect(chave).toBeDisabled();
    expect(chave).toHaveAttribute('aria-checked', 'false');
    expect(chave).toHaveAccessibleDescription(TEXTO);
    expect(screen.queryByRole('button', { name: 'Abrir agora' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Voltar agora' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Falar com o suporte' }));
    expect(mockPush).toHaveBeenCalledWith('/seller/ajuda');
  });

  it('sem a pausa do DROP: nada muda (interruptor ligado e sem faixa)', async () => {
    await renderPage(<AgoraPage />);
    expect(screen.queryByText(/Loja pausada pelo DROP/)).toBeNull();
    expect(screen.getByRole('switch')).toBeEnabled();
  });

  it('409 ao abrir (o DROP pausou depois da leitura): a mensagem com o motivo e o painel relê', async () => {
    mockPanel.store = { ...base, isOpen: false };
    put.mockRejectedValue(horarioPausado('Documentos vencidos'));
    await renderPage(<AgoraPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir agora' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/stores/s1/operating-hours', { isOpen: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTO);
    expect(mockPanel.refresh).toHaveBeenCalled();
  });

  it('409 sem motivo no corpo: a mensagem sem o motivo, nunca o código cru', async () => {
    mockPanel.store = { ...base, isOpen: false };
    put.mockRejectedValue(horarioPausado(null));
    await renderPage(<AgoraPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Loja pausada pelo DROP. Fale com o suporte.');
    expect(screen.queryByText(/STORE_ADMIN_PAUSED/)).toBeNull();
  });
});

describe('Loja e Horários', () => {
  it('Loja: faixa e a linha da situação com "Pausar" desligado', async () => {
    mockPanel.store = { ...pausadaPeloDrop };
    await renderPage(<SellerLoja />);
    expect(screen.getAllByText(TEXTO).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Pausada pelo DROP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
  });

  it('Loja: com a pausa do próprio lojista também, "Reabrir agora" desligado', async () => {
    mockPanel.store = { ...pausadaPeloDrop, pausedUntil: new Date(Date.now() + 3_600_000).toISOString() };
    await renderPage(<SellerLoja />);
    expect(screen.getByRole('button', { name: 'Reabrir agora' })).toBeDisabled();
  });

  it('Horários: faixa e "Pausar" desligado', async () => {
    mockPanel.store = { ...pausadaPeloDrop };
    await renderPage(<SellerHorarios />);
    expect(screen.getAllByText(TEXTO).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeDisabled();
  });

  it('PauseSheet: 409 ao pausar mostra a mensagem, fecha e pede a releitura', async () => {
    put.mockRejectedValue(pausaPausada('Documentos vencidos'));
    const onChanged = jest.fn();
    const onClose = jest.fn();
    render(<PauseSheet open storeId="s1" onClose={onClose} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: '30 minutos' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(TEXTO, 'error'));
    expect(onChanged).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });
});
