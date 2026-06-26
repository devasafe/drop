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
  test('mostra o banner quando etapa nunca enviada (document.status none, sem pixKey)', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me')
        return Promise.resolve({
          data: {
            verification: {
              email: { status: 'none' },
              document: { status: 'none' },
            },
          },
        });
      if (url === '/onboarding/status') return Promise.resolve({ data: { pixKey: null } });
      return Promise.resolve({ data: {} });
    });
    render(<OnboardingResumeBanner />);
    await waitFor(() =>
      expect(screen.getByText('Continuar configuração →')).toBeInTheDocument(),
    );
  });

  // NOVO comportamento: enviado-mas-pendente (pending) conta como FEITO → banner não aparece.
  test('não renderiza quando etapa pendente (email verified, document pending) — submitted = done', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me')
        return Promise.resolve({
          data: {
            verification: {
              email: { status: 'verified' },
              document: { status: 'pending' },
            },
          },
        });
      if (url === '/onboarding/status') return Promise.resolve({ data: { pixKey: 'x' } });
      return Promise.resolve({ data: {} });
    });
    const { container } = render(<OnboardingResumeBanner />);
    // cliente flow tem só 'identidade' (sem pix), então só /verification/me é chamado.
    // Aguarda exactamente 1 chamada, garantindo que o async chain terminou.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  // documento rejeitado → volta ao banner (rejected ≠ submitted).
  test('mostra o banner quando document.status é rejected', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me')
        return Promise.resolve({
          data: {
            verification: {
              email: { status: 'verified' },
              document: { status: 'rejected' },
            },
          },
        });
      if (url === '/onboarding/status') return Promise.resolve({ data: { pixKey: 'x' } });
      return Promise.resolve({ data: {} });
    });
    render(<OnboardingResumeBanner />);
    await waitFor(() =>
      expect(screen.getByText('Continuar configuração →')).toBeInTheDocument(),
    );
  });

  // falha na chamada primária → banner não aparece (fail-silent).
  test('não renderiza quando /verification/me lança erro (fail-silent)', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/verification/me') return Promise.reject(new Error('network'));
      return Promise.resolve({ data: {} });
    });
    const { container } = render(<OnboardingResumeBanner />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/verification/me'));
    expect(container).toBeEmptyDOMElement();
  });
});
