import { render, screen, fireEvent } from '@testing-library/react';
import WalletPage from '../pages/conta/carteira';
import { ROUTES } from '../lib/routes';

const push = jest.fn();
const get = jest.fn((url: string) => Promise.resolve({ data:
  url.includes('/history') ? { history: [{ date: '2026-09-02T10:00:00', type: 'credit', category: 'refund', amount: 39.9, reason: 'Estorno · pedido #4790' }] }
  : url.includes('/client-summary') ? { available: 18.2 }
  : url === '/debts/my-pending' ? { debt: { amount: '4.90', createdAt: '2026-09-01T10:00:00' } }
  : { balance: 18.2 } }));
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1' } }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (u: string) => get(u), post: jest.fn() } }));
jest.mock('../hooks/useAutoRefetch', () => ({ useAutoRefetch: () => {} }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));

test('saldo para usar, a frase do protótipo e voltar para Conta', async () => {
  render(<WalletPage />);
  expect(await screen.findByText('Saldo para usar')).toBeInTheDocument();
  expect(screen.getByText('Entra sozinho na próxima sacola. Não expira.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(push).toHaveBeenCalledWith(ROUTES.conta);
});

test('taxa pendente com "Por que pago isso?"', async () => {
  render(<WalletPage />);
  expect(await screen.findByText('Taxa pendente: R$ 4,90')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Por que pago isso?' }));
  expect(push).toHaveBeenCalledWith(ROUTES.ajuda);
});
