import { render, screen } from '@testing-library/react';
import VerificationHub from '../VerificationHub';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockUser: any = { activeRole: 'lojista' };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }),
}));
const get = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a) } }));

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } });
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/asaas') return Promise.resolve({ data: { success: true, data: { status: 'valid', consent: { version: 'v1', acceptedAt: 'x' } } } });
    return Promise.resolve({ data: {} });
  });
});

describe('VerificationHub no modo direto', () => {
  test('lojista vê "Conta Asaas" e não vê CNPJ, verificação da loja nem recebimento Pix', async () => {
    mockUser.activeRole = 'lojista';
    render(<VerificationHub />);
    expect(await screen.findByText('Conta Asaas')).toBeInTheDocument();
    expect(screen.queryByText(/CNPJ/)).toBeNull();
    expect(screen.queryByText('Verificação da loja')).toBeNull();
    expect(screen.queryByText('Dados de recebimento')).toBeNull();
    expect(get).not.toHaveBeenCalledWith('/onboarding/status');
  });

  test('motoboy continua vendo o recebimento Pix', async () => {
    mockUser.activeRole = 'motoboy';
    render(<VerificationHub />);
    expect(await screen.findByText('Dados de recebimento')).toBeInTheDocument();
    expect(screen.queryByText('Conta Asaas')).toBeNull();
  });
});
