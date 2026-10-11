// __tests__/conta.v2.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContaPage from '../pages/conta';
import api from '../lib/api';

const push = jest.fn();
const logout = jest.fn();
let mockQuery: any = {};
let mockSaas: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
let mockLeftover = false;
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: mockQuery }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Ana Souza', email: 'ana@email.com', activeRole: 'cliente' }, logout, loading: false }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../hooks/useCustodyLeftover', () => ({ useCustodyLeftover: () => mockLeftover }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/MeusDadosForm', () => ({ __esModule: true, default: () => <div>MEUS_DADOS_FORM</div> }));
jest.mock('../components/VerificationHub', () => ({ __esModule: true, default: () => <div>VERIFICATION_HUB</div> }));
jest.mock('../components/AddressManager', () => ({ __esModule: true, default: () => <div>ADDRESS_MANAGER</div> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

beforeEach(() => {
  push.mockClear(); logout.mockClear(); mockQuery = {}; mockLeftover = false;
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/wallets/my-wallet') return Promise.resolve({ data: { balance: 18.2 } });
    if (url === '/debts/my-pending') return Promise.resolve({ data: { debt: { amount: '4.90' } } });
    if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } });
    return Promise.resolve({ data: {} });
  });
});

test('índice: pessoa, taxa pendente primeiro, grupos e carteira com saldo', async () => {
  render(<ContaPage />);
  expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  expect(await screen.findByText('Taxa pendente de R$ 4,90')).toBeInTheDocument();
  expect(await screen.findByText('Conta verificada')).toBeInTheDocument();
  ['Endereços', 'Dados pessoais', 'Verificações e segurança', 'Notificações', 'Ajuda e suporte', 'Privacidade e dados', 'Sair'].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
  const carteira = await screen.findByRole('button', { name: /Carteira.*R\$ 18,20/ });
  fireEvent.click(carteira);
  expect(push).toHaveBeenCalledWith('/conta/carteira');
});

test('modo direto: sem Carteira; com saldo do modo anterior, a linha certa', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  const { unmount } = render(<ContaPage />);
  await screen.findByText('Ana Souza');
  expect(screen.queryByRole('button', { name: /Carteira/ })).toBeNull();
  expect(get).not.toHaveBeenCalledWith('/wallets/my-wallet');
  unmount();
  mockLeftover = true;
  render(<ContaPage />);
  expect(screen.getByRole('button', { name: /Saldo do modo anterior/ })).toBeInTheDocument();
});

test('seções inline e deep-link ?secao=', () => {
  mockQuery = { secao: 'enderecos' };
  render(<ContaPage />);
  expect(screen.getByText('ADDRESS_MANAGER')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Conta' }));
  fireEvent.click(screen.getByText('Dados pessoais'));
  expect(screen.getByText('MEUS_DADOS_FORM')).toBeInTheDocument();
});

test('verificação pendente vira aviso com ação; Sair chama logout', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/verification/me' ? { verification: { email: { status: 'pending' } } } : {} }));
  render(<ContaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Verificar agora' }));
  expect(screen.getByText('VERIFICATION_HUB')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Conta' }));
  fireEvent.click(screen.getByText('Sair'));
  await waitFor(() => expect(logout).toHaveBeenCalled());
});
