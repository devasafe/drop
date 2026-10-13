import { render, screen, fireEvent } from '@testing-library/react';
import DadosRecebimento from '../pages/dados-recebimento';
import api from '../lib/api';

const mockPush = jest.fn();
let mockAuth: any = { user: { activeRole: 'lojista', role: 'lojista' }, loading: false };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: { onboarding: '1' }, pathname: '/dados-recebimento' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../components/OnboardingProgress', () => ({ __esModule: true, default: () => <p>passos do motoboy</p> }));
jest.mock('../components/OnboardingFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
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

test('motoboy: mantém os passos do onboarding dele, sem o voltar da loja', async () => {
  mockAuth = { user: { activeRole: 'motoboy', role: 'motoboy' }, loading: false };
  (api.get as jest.Mock).mockResolvedValue({ data: { target: 'motoboy', accountStatus: 'none', hasPixKey: false, hasAddress: true } });
  render(<DadosRecebimento />);
  await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.getByText('passos do motoboy')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument();
  expect(screen.queryByText('Quanto e quando')).not.toBeInTheDocument();
});
