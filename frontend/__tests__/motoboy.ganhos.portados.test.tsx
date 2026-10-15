/**
 * D2 · P4.11 — garantias de dinheiro da carteira antiga do motoboy (pages/motoboy/wallet),
 * portadas para /motoboy/ganhos com as MESMAS expectativas. O que mudou e por quê:
 *  - o modo agora vem explícito no mock (a tela nova não presume custódia quando o modo falha);
 *  - saldo antigo só existe no direto (useCustodyLeftoverState), então o caso "leftover" roda no direto;
 *  - o saldo antigo vem do agregado do servidor (GET /payouts/my/summary → available, Task 44), então
 *    o mock do caso "leftover" responde essa rota com a soma dos repasses liberados;
 *  - SocketContext mockado: as telas novas releem por useSocket().onReconnect (sem provider no teste);
 *  - rótulos do protótipo: "Recebido" → "Na conta"; "Pagamento pendente da loja" → "Atrasado"/"A caminho";
 *    título "Repasses recebidos"/"Ganhos e saques" → "Ganhos" (lista "Pix recebidos"); "Sacar para meu PIX" → "Sacar no Pix".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MotoboyGanhosPage from '../pages/motoboy/ganhos';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/motoboy/ganhos', asPath: '/motoboy/ganhos' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'm1', id: 'm1', activeRole: 'motoboy', role: 'motoboy', name: 'M' }, can: () => true, loading: false, permissionsLoading: false }),
}));
const mockSocket = { on: () => () => undefined, onReconnect: () => () => undefined, isConnected: true };
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
let mockMode = 'custodia';
let mockLeftover = false;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false, error: false, retry: jest.fn() }) }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ hasLeftover: mockLeftover, loading: false }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => mockLeftover }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'custodia';
  mockLeftover = false;
  window.alert = jest.fn();
});

describe('portado de legacyBalanceCard.test.tsx — carteira do motoboy', () => {
  const payout = (id: string, amount: number, status: string) => ({ _id: id, amount, status, orderId: `ord${id}XXXXXX`, createdAt: '2026-10-08T10:00:00Z' });
  function mockWallet(walletUrl: string, payouts: any[]) {
    const released = payouts.filter((p) => p.status === 'released').reduce((s, p) => s + p.amount, 0);
    (api.get as jest.Mock).mockImplementation((u: string) => {
      if (u.includes('/history')) return Promise.resolve({ data: { history: [] } });
      if (u === walletUrl) return Promise.resolve({ data: { balance: 0, availableBalance: 30 } });
      if (u.startsWith('/payouts/my') && !u.includes('summary')) return Promise.resolve({ data: { payouts } });
      if (u === '/payouts/my/summary') return Promise.resolve({ data: { pending: 0, available: released, requested: 0, paid: 0 } });
      // O saque do saldo antigo confere os saques (uncertain trava), como na custódia.
      if (u === '/withdrawals/my-withdrawals') return Promise.resolve({ data: [] });
      return Promise.reject(new Error('n/a'));
    });
    (api.post as jest.Mock).mockResolvedValue({ data: { withdrawal: { amount: 30 } } });
  }

  it('custódia: sem cartão', async () => {
    mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    render(<MotoboyGanhosPage />);
    await screen.findByText('Disponível para saque');
    expect(screen.queryByRole('region', { name: 'Saldo do modo anterior' })).not.toBeInTheDocument();
  });

  it('direto com saldo antigo: o botão abre o saque por payouts (/withdrawals/request), sem transfer-to-owner', async () => {
    mockMode = 'direto';
    mockLeftover = true;
    mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    render(<MotoboyGanhosPage />);
    fireEvent.click(await screen.findByText('Sacar para minha chave Pix'));
    const dialog = await screen.findByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => /sacar|confirmar/i.test(b.textContent || '') && !/fechar/i.test(b.getAttribute('aria-label') || ''));
    await waitFor(() => expect(confirm).toBeDefined());
    fireEvent.click(confirm!);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/request', expect.anything()));
    expect((api.post as jest.Mock).mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
  });
});

describe('portado de transfers-views.test.tsx — motoboy/wallet: pedido direto', () => {
  test('"Na conta" para done e "Atrasado" para o resto que falhou, sem códigos internos', async () => {
    mockMode = 'direto';
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url === '/motoboy/transfers') {
        return Promise.resolve({ data: { success: true, data: [
          { id: 'a', orderId: 'ordAAAAAA', amount: 8, status: 'done', createdAt: '2026-10-08T10:00:00Z' },
          { id: 'b', orderId: 'ordBBBBBB', amount: 6, status: 'uncertain', createdAt: '2026-10-08T11:00:00Z' },
          { id: 'c', orderId: 'ordCCCCCC', amount: 5, status: 'failed_final', createdAt: '2026-10-08T12:00:00Z' },
        ] } });
      }
      if (url.startsWith('/wallets/motoboy')) return Promise.resolve({ data: { balance: 0, availableBalance: 0 } });
      return Promise.reject(new Error('n/a'));
    });
    render(<MotoboyGanhosPage />);
    expect(await screen.findByText('Na conta')).toBeInTheDocument();
    expect(screen.getAllByText('Atrasado')).toHaveLength(2);
    const html = document.body.innerHTML;
    expect(html).not.toContain('UNCERTAIN');
    expect(html).not.toContain('failed_final');
  });
});

describe('portado de a3.modeNav.test.tsx — motoboy/wallet no modo direto', () => {
  test('só Pix recebidos: sem botão de saque e sem rotas de carteira/payout/saque', async () => {
    mockMode = 'direto';
    (api.get as jest.Mock).mockImplementation((u: string) => {
      if (u === '/motoboy/transfers') {
        return Promise.resolve({ data: { data: [{ id: 't1', orderId: 'ord123456', amount: 9, status: 'done', createdAt: '2026-10-08T10:00:00Z' }], nextCursor: null } });
      }
      return Promise.reject({ response: { status: 404 } });
    });
    render(<MotoboyGanhosPage />);
    await waitFor(() => expect(screen.getByText('Na conta')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Pix recebidos' })).toBeInTheDocument();
    expect(screen.queryByText(/Sacar no Pix|Sacar para meu PIX/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Disponível para saque/i)).not.toBeInTheDocument();
    const urls = (api.get as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.startsWith('/wallets') || u.startsWith('/payouts') || u.startsWith('/withdrawals'))).toBe(false);
    expect(urls).toContain('/motoboy/transfers');
  });

  test('custódia: página como sempre (saldo e saque)', async () => {
    mockMode = 'custodia';
    (api.get as jest.Mock).mockImplementation((u: string) => {
      if (u.startsWith('/wallets/motoboy')) return Promise.resolve({ data: { balance: 0, availableBalance: 30 } });
      return Promise.reject({ response: { status: 404 } });
    });
    render(<MotoboyGanhosPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sacar no Pix' })).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Ganhos' })).toBeInTheDocument();
  });
});

describe('portado de loadMore-lists.test.tsx — carteira do motoboy', () => {
  test('motoboy/ganhos: "Carregar mais" traz mais pagamentos diretos', async () => {
    mockMode = 'direto';
    const t = (id: string, orderId: string) => ({ id, orderId, amount: 8, status: 'done', createdAt: '2026-10-08T10:00:00Z' });
    (api.get as jest.Mock).mockImplementation((u: string, cfg?: any) => {
      if (u !== '/motoboy/transfers') {
        if (u.startsWith('/wallets/motoboy')) return Promise.resolve({ data: { balance: 0, availableBalance: 0 } });
        return Promise.reject(new Error('n/a'));
      }
      if (cfg?.params?.cursor === 'c1') return Promise.resolve({ data: { success: true, data: [t('b', 'ordBBBBBB')], nextCursor: null } });
      return Promise.resolve({ data: { success: true, data: [t('a', 'ordAAAAAA')], nextCursor: 'c1' } });
    });
    render(<MotoboyGanhosPage />);
    expect(await screen.findByText('Entrega #AAAAAA')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Carregar mais'));
    expect(await screen.findByText('Entrega #BBBBBB')).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith('/motoboy/transfers', { params: { cursor: 'c1' } });
    await waitFor(() => expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument());
  });
});
