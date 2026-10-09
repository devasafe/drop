import { render, screen } from '@testing-library/react';
import OnboardingProgress from '../OnboardingProgress';

const mockRouter: any = { query: { onboarding: '1' }, pathname: '/verificacao' };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista' } }),
}));
jest.mock('../../hooks/useSaasConfig', () => ({
  useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }),
}));

describe('OnboardingProgress (modo direto, lojista)', () => {
  test('mostra 3 passos com "Conta Asaas" e sem "Plano"/"Verificar loja"', () => {
    render(<OnboardingProgress />);
    expect(screen.getByText(/Passo 2 de 3/)).toBeInTheDocument();
    expect(screen.getByText('Conta Asaas')).toBeInTheDocument();
    expect(screen.queryByText('Plano')).toBeNull();
    expect(screen.queryByText('Verificar loja')).toBeNull();
  });
});
