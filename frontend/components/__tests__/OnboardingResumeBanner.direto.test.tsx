import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OnboardingResumeBanner from '../OnboardingResumeBanner';
import { __resetSaasConfigCache } from '../../hooks/useSaasConfig';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'lojista' } }) }));
const get = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => get(...a) } }));

const verifOk = { data: { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } };
function setup(asaas: any) {
  get.mockImplementation((url: string) => {
    if (url === '/settings/saas') return Promise.resolve({ data: { settlementMode: 'direto' } });
    if (url === '/verification/me') return Promise.resolve(verifOk);
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/asaas') return Promise.resolve({ data: { success: true, data: asaas } });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  push.mockClear();
  get.mockReset();
  __resetSaasConfigCache();
});

describe('OnboardingResumeBanner (modo direto, lojista)', () => {
  test('Asaas não conectada: banner leva a /seller/pagamentos', async () => {
    setup({ status: 'none', consent: null });
    render(<OnboardingResumeBanner />);
    fireEvent.click(await screen.findByText('Continuar configuração →'));
    expect(push).toHaveBeenCalledWith('/seller/pagamentos?onboarding=1');
  });

  test('Asaas válida com consent: sem banner, sem /onboarding/status nem verificação de loja', async () => {
    setup({ status: 'valid', consent: { version: 'v1', acceptedAt: 'x' } });
    const { container } = render(<OnboardingResumeBanner />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/stores/s1/asaas'));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(get).not.toHaveBeenCalledWith('/onboarding/status');
    expect(get).not.toHaveBeenCalledWith('/verification/store/s1');
  });

  test('Asaas válida mas sem consent continua pendente', async () => {
    setup({ status: 'valid', consent: null });
    render(<OnboardingResumeBanner />);
    expect(await screen.findByText('Continuar configuração →')).toBeInTheDocument();
  });
});
