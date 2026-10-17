/**
 * Papel de equipe vira acréscimo (16/10): a pessoa continua cliente. Em Conta, o cartão
 * "Painel da equipe" leva direto ao painel (sem troca de área); as áreas de equipe saem de "Suas áreas".
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContaPage from '../pages/conta';

const push = jest.fn();
const switchRole = jest.fn();
const apiGet = jest.fn();
let mockUser: any;
let mockTeamRoles: string[] = [];
let mockPerms: string[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser, switchRole, logout: jest.fn(), loading: false,
    teamRoles: mockTeamRoles, can: (p: string) => mockPerms.includes(p),
  }),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => false }));
jest.mock('../hooks/useSync', () => ({ useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => apiGet(...a) } }));

const base = { _id: 'u1', name: 'Ana', email: 'ana@email.com' };

beforeEach(() => {
  push.mockClear(); switchRole.mockReset(); apiGet.mockReset();
  apiGet.mockResolvedValue({ data: {} });
  mockTeamRoles = []; mockPerms = [];
});

test('com papel de equipe e aba visível: cartão "Painel da equipe" com os papéis; sem áreas de equipe', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing', 'gerente_motoboys'] };
  mockTeamRoles = ['marketing', 'gerente_motoboys'];
  mockPerms = ['broadcast:send'];
  render(<ContaPage />);
  expect(screen.getByRole('button', { name: /Painel da equipe\s*Marketing · Gerente de motoboys/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Marketing/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Gerente de motoboys/ })).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('o clique leva ao adminHomeHref sem chamar switchRole', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'gerente_motoboys'] };
  mockTeamRoles = ['gerente_motoboys'];
  mockPerms = ['payout:view'];
  render(<ContaPage />);
  fireEvent.click(screen.getByRole('button', { name: /Painel da equipe/ }));
  expect(push).toHaveBeenCalledWith('/admin/payouts');
  expect(switchRole).not.toHaveBeenCalled();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('papel de equipe sem aba visível: sem cartão', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
  mockTeamRoles = ['marketing'];
  render(<ContaPage />);
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('cliente puro não vê o cartão', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
  mockPerms = ['broadcast:send'];
  render(<ContaPage />);
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});

test('o CEO continua com "Administração"', async () => {
  mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'ceo'] };
  render(<ContaPage />);
  expect(screen.getByRole('button', { name: /^Administração/ })).toBeInTheDocument();
  expect(screen.queryByText('Painel da equipe')).not.toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalled());
});
