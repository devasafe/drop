/**
 * Lote pré-deploy 2 — item F (R23): "Saldo do modo anterior" ganha o botão "Transferir para
 * minha carteira" na carteira da loja e na do motoboy, com confirmação, erro e recarga.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import SellerWalletPage from '../pages/seller/wallet';
import MotoboyWalletPage from '../pages/motoboy/wallet';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
let mockUser: any = { _id: 'm1', id: 'm1', activeRole: 'motoboy', role: 'motoboy', name: 'M' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const payout = (id: string, amount: number, status: string) => ({ _id: id, amount, status, orderId: `ord${id}XXXXXX`, createdAt: '2026-10-08T10:00:00Z' });

/** Carteira com os payouts dados; depois da transferência, os released somem. */
function mockWallet(walletUrl: string, payoutsBefore: any[]) {
  let transferred = false;
  (api.get as jest.Mock).mockImplementation((u: string) => {
    if (u === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (u.includes('/history')) return Promise.resolve({ data: { history: [] } });
    if (u === walletUrl) return Promise.resolve({ data: { balance: 0, availableBalance: transferred ? 0 : 30 } });
    if (u.startsWith('/payouts/my') && !u.includes('summary')) {
      return Promise.resolve({ data: { payouts: transferred ? payoutsBefore.map((p) => (p.status === 'released' ? { ...p, status: 'paid' } : p)) : payoutsBefore } });
    }
    return Promise.reject(new Error('n/a'));
  });
  return { markTransferred: () => { transferred = true; } };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.alert = jest.fn();
});

describe('carteira da loja', () => {
  beforeEach(() => { mockUser = { _id: 'u1', id: 'u1', storeId: 's1', activeRole: 'lojista', role: 'lojista', name: 'L' }; });

  it('sem repasse liberado → sem botão', async () => {
    mockWallet('/wallets/store/s1', [payout('p1', 30, 'paid'), payout('p2', 10, 'pending')]);
    render(<SellerWalletPage />);
    await screen.findByText('Carteira da Loja');
    expect(screen.queryByText('Transferir para minha carteira')).not.toBeInTheDocument();
  });

  it('com saldo: confirma, chama a rota da loja, recarrega e mostra o caminho de saque', async () => {
    const w = mockWallet('/wallets/store/s1', [payout('p1', 20, 'released'), payout('p2', 10, 'released'), payout('p3', 5, 'pending')]);
    (api.post as jest.Mock).mockImplementation(async (u: string) => {
      if (u === '/wallets/store/s1/transfer-to-owner') { w.markTransferred(); return { data: { success: true, transferred: 30 } }; }
      if (u === '/withdrawals/request-user') return { data: { message: 'ok' } };
      throw new Error('n/a');
    });
    render(<SellerWalletPage />);
    fireEvent.click(await screen.findByText('Transferir para minha carteira'));
    const dialog = screen.getByRole('dialog', { name: 'Transferir para minha carteira' });
    expect(within(dialog).getByText(/30,00/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled(); // só depois de confirmar
    const walletCallsBefore = (api.get as jest.Mock).mock.calls.filter(([u]) => u === '/wallets/store/s1').length;
    fireEvent.click(within(dialog).getByText('Confirmar transferência'));

    expect(await screen.findByText(/transferidos para a sua carteira/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/wallets/store/s1/transfer-to-owner');
    await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter(([u]) => u === '/wallets/store/s1').length).toBeGreaterThan(walletCallsBefore));
    expect(screen.queryByText('Transferir para minha carteira')).not.toBeInTheDocument();

    // caminho de saque (request-user)
    fireEvent.click(screen.getByText('Sacar da minha carteira'));
    fireEvent.change(screen.getByLabelText('Banco'), { target: { value: 'Banco X' } });
    fireEvent.change(screen.getByLabelText('Agência e conta'), { target: { value: '0001 12345-6' } });
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Fulano' } });
    fireEvent.click(screen.getByText('Solicitar saque'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/withdrawals/request-user', {
      amount: 30, bankAccount: { bankName: 'Banco X', accountNumber: '0001 12345-6', ownerName: 'Fulano' },
    }));
    expect(await screen.findByText(/Saque solicitado/)).toBeInTheDocument();
  });

  it('erro na transferência mostra a mensagem e mantém o botão', async () => {
    mockWallet('/wallets/store/s1', [payout('p1', 30, 'released')]);
    (api.post as jest.Mock).mockRejectedValue({ response: { status: 404, data: { error: 'Recurso indisponível' } } });
    render(<SellerWalletPage />);
    fireEvent.click(await screen.findByText('Transferir para minha carteira'));
    fireEvent.click(screen.getByText('Confirmar transferência'));
    expect(await screen.findByText('Recurso indisponível')).toBeInTheDocument();
    expect(screen.queryByText(/transferidos para a sua carteira/)).not.toBeInTheDocument();
  });
});

describe('carteira do motoboy', () => {
  beforeEach(() => { mockUser = { _id: 'm1', id: 'm1', activeRole: 'motoboy', role: 'motoboy', name: 'M' }; });

  it('sem repasse liberado → sem botão', async () => {
    mockWallet('/wallets/motoboy/m1', [payout('p1', 30, 'requested')]);
    render(<MotoboyWalletPage />);
    await screen.findByText('Disponível para saque');
    expect(screen.queryByText('Transferir para minha carteira')).not.toBeInTheDocument();
  });

  it('com saldo: chama a rota do motoboy e recarrega a carteira', async () => {
    const w = mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    (api.post as jest.Mock).mockImplementation(async (u: string) => {
      if (u === '/wallets/motoboy/m1/transfer-to-owner') { w.markTransferred(); return { data: { success: true, transferred: 12.5 } }; }
      throw new Error('n/a');
    });
    render(<MotoboyWalletPage />);
    fireEvent.click(await screen.findByText('Transferir para minha carteira'));
    const before = (api.get as jest.Mock).mock.calls.filter(([u]) => u === '/wallets/motoboy/m1').length;
    fireEvent.click(screen.getByText('Confirmar transferência'));
    expect(await screen.findByText(/transferidos para a sua carteira/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/wallets/motoboy/m1/transfer-to-owner');
    await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter(([u]) => u === '/wallets/motoboy/m1').length).toBeGreaterThan(before));
  });

  it('erro na transferência mostra a mensagem', async () => {
    mockWallet('/wallets/motoboy/m1', [payout('p1', 12.5, 'released')]);
    (api.post as jest.Mock).mockRejectedValue(new Error('rede'));
    render(<MotoboyWalletPage />);
    fireEvent.click(await screen.findByText('Transferir para minha carteira'));
    fireEvent.click(screen.getByText('Confirmar transferência'));
    expect(await screen.findByText('Não foi possível transferir agora. Tente novamente.')).toBeInTheDocument();
  });
});
