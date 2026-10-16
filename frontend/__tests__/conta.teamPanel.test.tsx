/**
 * Correção V1 (D3a): no celular a troca de área mora na tela Conta. Quem é da equipe
 * e está como Cliente precisa de um caminho de volta ao painel.
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

beforeEach(() => {
  push.mockClear(); switchRole.mockReset(); apiGet.mockReset();
  apiGet.mockImplementation((url: string) => Promise.resolve({
    data: url === '/role-permissions/me' ? { permissions: ['theme:edit'] } : {},
  }));
});

test('marketing como Cliente vê "Painel da equipe" em "Suas áreas"', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
  render(<ContaPage />);
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Painel da equipe.*Painel administrativo da equipe\./ })).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('cliente puro não vê', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
  render(<ContaPage />);
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('quem já está no papel de equipe não vê', async () => {
  mockUser = { ...base, activeRole: 'marketing', roles: ['cliente', 'marketing'] };
  render(<ContaPage />);
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('tocar troca para o papel de equipe e abre a primeira página do painel que ele pode abrir', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
  switchRole.mockResolvedValue({});
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /Painel da equipe/ }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/seasonal-theme'));
  expect(switchRole).toHaveBeenCalledWith('marketing');
});

test('troca recusada pelo servidor: não navega', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
  switchRole.mockRejectedValue(new Error('403'));
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /Painel da equipe/ }));
  await waitFor(() => expect(switchRole).toHaveBeenCalledWith('marketing'));
  await Promise.resolve();
  expect(apiGet).not.toHaveBeenCalledWith('/role-permissions/me');
  expect(push).not.toHaveBeenCalled();
});
