/**
 * Fix round 1 — R26 (revisa R23): o cartão "Saldo do modo anterior" aparece só no modo direto
 * com saldo antigo (useCustodyLeftover) e leva ao saque por payouts já existente
 * (/withdrawals/request) — nunca chama transfer-to-owner. Na custódia, não aparece.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerWalletPage from '../pages/seller/wallet';
import MotoboyWalletPage from '../pages/motoboy/wallet';
import api from '../lib/api';
import { useCustodyLeftover } from '../hooks/useCustodyLeftover';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
let mockAuth: any = {};
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: jest.fn() }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const leftover = useCustodyLeftover as jest.Mock;
const payout = (id: string, amount: number, status: string) => ({ _id: id, amount, status, orderId: `ord${id}XXXXXX`, createdAt: '2026-10-08T10:00:00Z' });

function mockWallet(walletUrl: string, payouts: any[]) {
  (api.get as jest.Mock).mockImplementation((u: string) => {
    if (u === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (u.includes('/history')) return Promise.resolve({ data: { history: [] } });
    if (u === walletUrl) return Promise.resolve({ data: { balance: 0, availableBalance: 30 } });
    if (u.startsWith('/payouts/my') && !u.includes('summary')) return Promise.resolve({ data: { payouts } });
    return Promise.reject(new Error('n/a'));
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { withdrawal: { amount: 30 } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.alert = jest.fn();
});

const TITLE = 'Saldo do modo anterior — saque para sua chave Pix';

describe('carteira da loja', () => {
  beforeEach(() => { mockAuth = { user: { _id: 'u1', id: 'u1', storeId: 's1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }; });

  it('custódia (sem leftover): sem cartão, mesmo com repasses liberados', async () => {
    leftover.mockReturnValue(false);
    mockWallet('/wallets/store/s1', [payout('p1', 30, 'released')]);
    render(<SellerWalletPage />);
    await screen.findByText('Carteira da Loja');
    expect(screen.queryByRole('region', { name: 'Saldo do modo anterior' })).not.toBeInTheDocument();
  });

  it('direto com leftover mas sem repasse liberado: sem cartão', async () => {
    leftover.mockReturnValue(true);
    mockWallet('/wallets/store/s1', [payout('p1', 30, 'requested')]);
    render(<SellerWalletPage />);
    await screen.findByText('Carteira da Loja');
    expect(screen.queryByRole('region', { name: 'Saldo do modo anterior' })).not.toBeInTheDocument();
  });

  it('direto com saldo antigo: o botão abre o saque por payouts e envia /withdrawals/request com storeId', async () => {
    leftover.mockReturnValue(true);
    mockWallet('/wallets/store/s1', [payout('p1', 20, 'released'), payout('p2', 10, 'released')]);
    render(<SellerWalletPage />);
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 30,00/, { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sacar para minha chave Pix'));
    // o WithdrawSheet existente abre; confirma o saque
    const dialog = await screen.findByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => /sacar|confirmar/i.test(b.textContent || '') && !/fechar/i.test(b.getAttribute('aria-label') || ''));
    fireEvent.click(confirm!);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/request', expect.objectContaining({ storeId: 's1' })));
    expect((api.post as jest.Mock).mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
  });
});

describe('carteira do motoboy', () => {
  beforeEach(() => { mockAuth = { user: { _id: 'm1', id: 'm1', activeRole: 'motoboy', role: 'motoboy', name: 'M' }, can: () => true, loading: false, permissionsLoading: false }; });

  it('custódia: sem cartão', async () => {
    leftover.mockReturnValue(false);
    mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    render(<MotoboyWalletPage />);
    await screen.findByText('Disponível para saque');
    expect(screen.queryByRole('region', { name: 'Saldo do modo anterior' })).not.toBeInTheDocument();
  });

  it('direto com saldo antigo: o botão abre o saque por payouts (/withdrawals/request), sem transfer-to-owner', async () => {
    leftover.mockReturnValue(true);
    mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    render(<MotoboyWalletPage />);
    fireEvent.click(await screen.findByText('Sacar para minha chave Pix'));
    const dialog = await screen.findByRole('dialog');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) => /sacar|confirmar/i.test(b.textContent || '') && !/fechar/i.test(b.getAttribute('aria-label') || ''));
    fireEvent.click(confirm!);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/request', expect.anything()));
    expect((api.post as jest.Mock).mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
  });
});
