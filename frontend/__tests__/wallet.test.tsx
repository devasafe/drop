import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WalletPage from '../pages/wallet';

const showToast = jest.fn();
const post = jest.fn().mockResolvedValue({ data: { wallet: { balance: 130, totalIncome: 200, totalSpent: 70 } } });
const get = jest.fn().mockImplementation((url: string) =>
  url.includes('/history')
    ? Promise.resolve({ data: { history: [{ date: '2026-08-01T10:00:00', type: 'credit', category: 'refund', amount: 50, reason: 'Reembolso' }] } })
    : url.includes('/client-summary')
    ? Promise.resolve({ data: { available: 150, refundPending: 0, refundReceived: 50, totalSaved: 0 } })
    : Promise.resolve({ data: { balance: 150, totalIncome: 200, totalSpent: 50 } }),
);

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (u: string) => get(u), post: (u: string, b: any) => post(u, b) } }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));

beforeEach(() => { showToast.mockClear(); post.mockClear(); });

describe('Carteira (/wallet)', () => {
  it('mostra o saldo e o extrato', async () => {
    render(<WalletPage />);
    await waitFor(() => expect(screen.getByText(/150,00/)).toBeInTheDocument());
    expect(screen.getByText('Reembolso')).toBeInTheDocument();
  });
  it('Sacar sem dados bancários → toast de erro e não chama a API', async () => {
    render(<WalletPage />);
    await waitFor(() => screen.getByText(/150,00/));
    fireEvent.click(screen.getByText('Sacar saldo'));
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '50' } });
    fireEvent.click(screen.getByText(/solicitar saque/i));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/banc/i), 'error');
    expect(post).not.toHaveBeenCalled();
  });
  it('tocar numa movimentação abre os detalhes', async () => {
    render(<WalletPage />);
    await waitFor(() => screen.getByText(/150,00/));
    fireEvent.click(screen.getByText('Reembolso'));
    expect(await screen.findByText('Detalhes da entrada')).toBeInTheDocument();
    expect(screen.getByText('Entrada')).toBeInTheDocument();
  });
  it('Carregar com valor válido → API de crédito + toast de sucesso', async () => {
    render(<WalletPage />);
    await waitFor(() => screen.getByText(/150,00/));
    fireEvent.click(screen.getByText('Carregar saldo'));
    fireEvent.change(screen.getByLabelText(/valor/i), { target: { value: '30' } });
    fireEvent.click(screen.getByText(/confirmar carregamento/i));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(expect.stringContaining('/credit'), expect.objectContaining({ amount: 30 })),
    );
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });
});
