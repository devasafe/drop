import { render, screen, fireEvent } from '@testing-library/react';
import ContaPage from '../pages/conta';
import api from '../lib/api';
import { ROUTES } from '../lib/routes';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Ana Souza', email: 'ana@email.com', activeRole: 'cliente' }, logout: jest.fn(), loading: false }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useSync', () => ({ useAddresses: () => ({ addresses: [{ _id: 'a1', label: 'Casa' }, { _id: 'a2', label: 'Trabalho' }], loading: false, setAddresses: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

beforeEach(() => {
  push.mockClear();
  get.mockImplementation((url: string) => Promise.resolve({ data:
    url === '/wallets/my-wallet' ? { balance: 18.2 }
    : url === '/debts/my-pending' ? { debt: { amount: '4.90', createdAt: '2026-09-01T10:00:00' } }
    : { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } }));
});

test('título, KPI do saldo, taxa com a data e endereços com os rótulos', async () => {
  render(<ContaPage />);
  expect(screen.getByRole('heading', { level: 1, name: 'Conta' })).toBeInTheDocument();
  expect(await screen.findByText('Saldo na carteira')).toBeInTheDocument();
  expect(screen.getByText('usa sozinho na sacola')).toBeInTheDocument();
  expect(await screen.findByText(/De um cancelamento tardio em 01\/09/)).toBeInTheDocument();
  expect(screen.getByText('Casa · Trabalho')).toBeInTheDocument();
});

test('App: notificações, ajuda e privacidade pelos helpers de rota', () => {
  render(<ContaPage />);
  fireEvent.click(screen.getByText('Notificações'));
  expect(push).toHaveBeenLastCalledWith(ROUTES.notificacoes);
  fireEvent.click(screen.getByText('Ajuda e suporte'));
  expect(push).toHaveBeenLastCalledWith(ROUTES.ajuda);
  fireEvent.click(screen.getByText('Privacidade e dados'));
  expect(push).toHaveBeenLastCalledWith(ROUTES.privacidadeConta);
});
