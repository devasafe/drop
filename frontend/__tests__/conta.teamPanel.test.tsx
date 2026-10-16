/**
 * Correções V1/V2 (D3a): no celular a troca de área mora na tela Conta. Cada papel de equipe
 * da conta aparece como área própria em "Suas áreas".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContaPage from '../pages/conta';

const push = jest.fn();
const switchRole = jest.fn();
const apiGet = jest.fn();
let mockUser: any;
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, switchRole, logout: jest.fn(), loading: false }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useSync', () => ({ useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => apiGet(...a) } }));

const base = { _id: 'u1', name: 'Ana', email: 'ana@email.com' };
const team = ['cliente', 'marketing', 'gerente_motoboys'];

beforeEach(() => {
  push.mockClear(); switchRole.mockReset(); apiGet.mockReset();
  apiGet.mockImplementation((url: string) => Promise.resolve({
    data: url === '/role-permissions/me' ? { permissions: ['payout:view'] } : {},
  }));
});

test('cada papel de equipe da conta aparece em "Suas áreas", com a descrição', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: team };
  render(<ContaPage />);
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Marketing\s*Avisos, broadcasts e tema do app\./ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Gerente de motoboys\s*Motoboys, verificações e Pix\./ })).toBeInTheDocument();
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('cliente puro não vê área de equipe', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
  render(<ContaPage />);
  expect(screen.queryByText(/Marketing|Gerente/)).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('o CEO continua com "Administração"', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'ceo'] };
  render(<ContaPage />);
  expect(screen.getByRole('button', { name: /^Administração/ })).toBeInTheDocument();
  expect(screen.queryByText(/Marketing|Gerente/)).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('escolher "Gerente de motoboys" troca para o papel e abre a primeira página do painel que ele pode abrir', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: team };
  switchRole.mockResolvedValue({});
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Gerente de motoboys/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/payouts'));
  expect(switchRole).toHaveBeenCalledWith('gerente_motoboys');
});

test('troca recusada pelo servidor: não navega', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: team };
  switchRole.mockRejectedValue(new Error('403'));
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }));
  await waitFor(() => expect(switchRole).toHaveBeenCalledWith('marketing'));
  await Promise.resolve();
  expect(apiGet).not.toHaveBeenCalledWith('/role-permissions/me');
  expect(push).not.toHaveBeenCalled();
});
