// frontend/components/__tests__/OnboardingResumeBanner.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import OnboardingResumeBanner from '../OnboardingResumeBanner';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'cliente' } }),
}));

const get = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a) } }));

beforeEach(() => { push.mockClear(); get.mockReset(); });

describe('OnboardingResumeBanner', () => {
  test('mostra o banner quando há etapa pendente (cliente sem email verificado)', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'none' }, document: { status: 'none' } } } });
      if (url === '/onboarding/status') return Promise.resolve({ data: { pixKey: null } });
      return Promise.resolve({ data: {} });
    });
    render(<OnboardingResumeBanner />);
    await waitFor(() => expect(screen.getByText('Continuar configuração →')).toBeInTheDocument());
  });

  test('não renderiza quando tudo está concluído', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } });
      if (url === '/onboarding/status') return Promise.resolve({ data: { pixKey: 'x' } });
      return Promise.resolve({ data: {} });
    });
    const { container } = render(<OnboardingResumeBanner />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/onboarding/status'));
    expect(container).toBeEmptyDOMElement();
  });
});
