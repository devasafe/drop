/**
 * Conta com vários perfis troca de área pela própria tela Conta (2026-10-12).
 * No celular a Nav antiga (com o AccountMenu) não aparece nas telas do cliente,
 * então sem esta seção quem é cliente + lojista/motoboy ficava preso no app do cliente.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContaPage from '../pages/conta';
import { ROLE_HOME } from '../lib/navConfig';

const push = jest.fn();
const switchRole = jest.fn();
let mockUser: any;
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, switchRole, logout: jest.fn(), loading: false }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useSync', () => ({ useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: {} })) } }));

beforeEach(() => { push.mockClear(); switchRole.mockReset(); });

const base = { _id: 'u1', name: 'Ana', email: 'ana@email.com', activeRole: 'cliente' };

test('com cliente + lojista: "Suas áreas" troca para a loja e abre o painel', async () => {
  mockUser = { ...base, roles: ['cliente', 'lojista'] };
  switchRole.mockResolvedValue({});
  render(<ContaPage />);
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Cliente/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Lojista/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(ROLE_HOME.lojista));
  expect(switchRole).toHaveBeenCalledWith('lojista');
});

test('troca recusada pelo servidor: não navega', async () => {
  mockUser = { ...base, roles: ['cliente', 'motoboy'] };
  switchRole.mockRejectedValue(new Error('403'));
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /Motoboy/ }));
  await waitFor(() => expect(switchRole).toHaveBeenCalledWith('motoboy'));
  expect(push).not.toHaveBeenCalled();
});

test('só cliente: a seção não aparece', () => {
  mockUser = { ...base, roles: ['cliente'] };
  render(<ContaPage />);
  expect(screen.queryByRole('heading', { name: 'Suas áreas' })).not.toBeInTheDocument();
});
