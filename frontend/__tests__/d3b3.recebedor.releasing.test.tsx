/**
 * D3b-3 · P4.6 (pré-voo F6): o estado `releasing` do repasse chega às telas do recebedor (GET /payouts/my).
 * Nenhuma tela mostra o texto cru "releasing": o rótulo é "Em transferência".
 */
import { render, screen } from '@testing-library/react';
import SellerWalletPage from '../pages/seller/wallet';
import api from '../lib/api';
import { PAYOUT_LABEL, PAYOUT_TONE } from '../components/seller/dinheiro/moneyLabels';
import { moneyBadge, payoutToMoney } from '../lib/motoboyMoney';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', id: 'u1', storeId: 's1', activeRole: 'lojista', role: 'lojista', name: 'L' },
    can: () => true, loading: false, permissionsLoading: false,
  }),
}));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((u: string) => {
    if (u === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (u.includes('/history')) return Promise.resolve({ data: { history: [] } });
    if (u === '/wallets/store/s1') return Promise.resolve({ data: { balance: 0, availableBalance: 0 } });
    if (u.startsWith('/payouts/my') && !u.includes('summary')) {
      return Promise.resolve({ data: { payouts: [{ _id: 'p1', amount: 30, status: 'releasing', orderId: 'ord000004812', createdAt: '2026-10-08T10:00:00Z' }] } });
    }
    return Promise.reject(new Error('n/a'));
  });
});

it('carteira da loja: repasse em liberação aparece como "Em transferência", nunca "releasing"', async () => {
  render(<SellerWalletPage />);
  expect(await screen.findByText('Em transferência')).toBeInTheDocument();
  expect(screen.queryByText('releasing')).toBeNull();
});

it('carteira da loja: a pílula de "Em transferência" usa a cor de "Solicitado" (requested)', async () => {
  render(<SellerWalletPage />);
  const pills = await screen.findAllByText('Em transferência');
  for (const pill of pills) {
    expect(pill).toHaveClass('requested');
    expect(pill).not.toHaveClass('releasing');
  }
});

it('Dinheiro da loja (custódia): rótulo e tom do repasse em liberação', () => {
  expect(PAYOUT_LABEL.releasing).toBe('Em transferência');
  expect(PAYOUT_TONE.releasing).toBe('info');
});

it('app do motoboy: repasse em liberação é "Em transferência" (não cai em "Em conferência")', () => {
  const m = payoutToMoney({ _id: 'p', amount: 10, status: 'releasing', blocked: false, createdAt: '2026-10-14T10:00:00-03:00' })!;
  expect(moneyBadge(m)).toEqual({ label: 'Em transferência', tone: 'info' });
});
