import { render, screen, fireEvent } from '@testing-library/react';
import DadosRecebimento from '../pages/dados-recebimento';
import api from '../lib/api';

const mockPush = jest.fn();
let mockQuery: Record<string, string> = { onboarding: '1' };
let mockSaas: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
let mockAuth: any = { user: { activeRole: 'lojista', role: 'lojista' }, loading: false };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: mockQuery, pathname: '/dados-recebimento' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../components/OnboardingProgress', () => ({ __esModule: true, default: () => <p>passos do motoboy</p> }));
jest.mock('../components/OnboardingFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, children }: any) => <div data-testid="motoboy-shell" data-back={back ?? ''}><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { onboarding: '1' };
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
  (api.get as jest.Mock).mockResolvedValue({ data: { target: 'store', accountStatus: 'none', hasPixKey: false, hasAddress: true } });
});

test('loja: topo com voltar para o checklist Abrir a loja', async () => {
  mockAuth = { user: { activeRole: 'lojista', role: 'lojista' }, loading: false };
  render(<DadosRecebimento />);
  await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.queryByText('passos do motoboy')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('motoboy: casca do motoboy "Onde você recebe"; do onboarding, volta para o cadastro; sem os passos antigos', async () => {
  mockAuth = { user: { activeRole: 'motoboy', role: 'motoboy' }, loading: false };
  (api.get as jest.Mock).mockResolvedValue({ data: { target: 'motoboy', accountStatus: 'none', hasPixKey: false, hasAddress: true } });
  render(<DadosRecebimento />);
  await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.getByRole('heading', { name: 'Onde você recebe' })).toBeInTheDocument();
  expect(screen.getByTestId('motoboy-shell')).toHaveAttribute('data-back', '/motoboy/cadastro');
  expect(screen.queryByText('passos do motoboy')).not.toBeInTheDocument();
  expect(screen.queryByText('Quanto e quando')).not.toBeInTheDocument();
});

test('motoboy fora do onboarding: voltar leva ao Perfil', async () => {
  mockQuery = {};
  mockAuth = { user: { activeRole: 'motoboy', role: 'motoboy' }, loading: false };
  (api.get as jest.Mock).mockResolvedValue({ data: { target: 'motoboy', accountStatus: 'none', hasPixKey: false, hasAddress: true } });
  render(<DadosRecebimento />);
  await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.getByTestId('motoboy-shell')).toHaveAttribute('data-back', '/motoboy/perfil');
});

test('motoboy: erro ao ler o modo de pagamento mostra Alert com "Tentar de novo" e não assume custódia (K29)', async () => {
  const retry = jest.fn();
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: true, retry };
  mockAuth = { user: { activeRole: 'motoboy', role: 'motoboy' }, loading: false };
  render(<DadosRecebimento />);
  expect(screen.getByText('Não carregamos o modo de pagamento.')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('CPF, e-mail, telefone ou chave aleatória')).not.toBeInTheDocument();
  expect(screen.queryByText('Seus saques caem nesta chave Pix.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test('a página continua clara para o motoboy (V7)', () => {
  const { themeForPath } = require('../lib/routeTheme');
  expect(themeForPath('/dados-recebimento')).toBe('light');
});
