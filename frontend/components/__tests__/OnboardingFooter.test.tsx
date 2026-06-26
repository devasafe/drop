// frontend/components/__tests__/OnboardingFooter.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingFooter from '../OnboardingFooter';

const push = jest.fn();
const mockRouter: any = { query: {}, pathname: '/verificacao', push };
let mockRole = 'motoboy';
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: mockRole } }),
}));

beforeEach(() => {
  push.mockClear();
  mockRole = 'motoboy';
  mockRouter.query = { onboarding: '1' };
});

describe('OnboardingFooter', () => {
  test('não renderiza fora do modo onboarding', () => {
    mockRouter.query = {};
    mockRouter.pathname = '/verificacao';
    const { container } = render(<OnboardingFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  test('etapa intermediária: "Continuar" avança para a próxima com o param', async () => {
    mockRouter.pathname = '/verificacao'; // motoboy: próxima = /verificacao-motoboy
    render(<OnboardingFooter />);
    await userEvent.click(screen.getByText('Continuar →'));
    expect(push).toHaveBeenCalledWith('/verificacao-motoboy?onboarding=1');
  });

  test('etapa intermediária: "Pular por agora" vai ao destino final', async () => {
    mockRouter.pathname = '/verificacao';
    render(<OnboardingFooter />);
    await userEvent.click(screen.getByText('Pular por agora →'));
    expect(push).toHaveBeenCalledWith('/motoboy');
  });

  test('última etapa: botão "Ir para o painel" sem "Pular", vai ao destino final sem param', async () => {
    mockRouter.pathname = '/dados-recebimento'; // última do motoboy
    render(<OnboardingFooter />);
    expect(screen.queryByText('Pular por agora →')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Ir para o painel →'));
    expect(push).toHaveBeenCalledWith('/motoboy');
  });

  test('cliente na última etapa mostra "Ir para o app"', () => {
    mockRole = 'cliente';
    mockRouter.pathname = '/verificacao';
    render(<OnboardingFooter />);
    expect(screen.getByText('Ir para o app →')).toBeInTheDocument();
  });
});
