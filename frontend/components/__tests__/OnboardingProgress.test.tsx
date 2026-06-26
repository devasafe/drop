// frontend/components/__tests__/OnboardingProgress.test.tsx
import { render, screen } from '@testing-library/react';
import OnboardingProgress from '../OnboardingProgress';

const mockRouter: any = { query: {}, pathname: '/verificacao' };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'lojista' } }),
}));

describe('OnboardingProgress', () => {
  test('não renderiza fora do modo onboarding', () => {
    mockRouter.query = {};
    mockRouter.pathname = '/verificacao';
    const { container } = render(<OnboardingProgress />);
    expect(container).toBeEmptyDOMElement();
  });

  test('mostra "Passo X de Y" no modo onboarding', () => {
    mockRouter.query = { onboarding: '1' };
    mockRouter.pathname = '/verificacao';
    render(<OnboardingProgress />);
    expect(screen.getByText(/Passo 1 de 4/)).toBeInTheDocument();
    expect(screen.getByText(/Sua identidade/)).toBeInTheDocument();
  });

  test('não renderiza se a rota não pertence ao fluxo do papel', () => {
    mockRouter.query = { onboarding: '1' };
    mockRouter.pathname = '/rota-qualquer';
    const { container } = render(<OnboardingProgress />);
    expect(container).toBeEmptyDOMElement();
  });
});
