import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SelectPlan from '../pages/seller/select-plan';
import api from '../lib/api';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockQuery: any = { onboarding: '1' };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: mockQuery, pathname: '/seller/select-plan', isReady: true }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/ModeGate', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { onboarding: '1' };
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-subscription') return Promise.resolve({ data: { currentPlan: 'plan1', planChangeStatus: 'none' } });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
    return Promise.resolve({ data: {} });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: { subscription: { currentPlan: 'plan1', requestedPlan: 'plan2', planChangeStatus: 'pending' } } });
});

test('mostra o exemplo de R$ 100 com a comissão do admin', async () => {
  render(<SelectPlan />);
  expect(await screen.findByText(/você recebe R\$ 85,00/)).toBeInTheDocument();
  expect(screen.getByText(/você recebe R\$ 90,00/)).toBeInTheDocument();
  expect(screen.getByText(/você recebe R\$ 95,00/)).toBeInTheDocument();
});

test('escolher outro plano pede a troca e volta ao checklist', async () => {
  render(<SelectPlan />);
  fireEvent.click(await screen.findByRole('radio', { name: /Pool de motoboys/ }));
  fireEvent.click(screen.getByText('Começar com Pool de motoboys'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/store-subscription/request-change', { newPlan: 'plan2' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
});

test('ficar no plano atual não chama a API', async () => {
  render(<SelectPlan />);
  fireEvent.click(await screen.findByText('Começar com Vitrine'));
  expect(api.post).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('erro do servidor aparece e não navega', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'Você já tem uma alteração de plano pendente de aprovação do CEO' } } });
  render(<SelectPlan />);
  fireEvent.click(await screen.findByRole('radio', { name: /Premium/ }));
  fireEvent.click(screen.getByText('Começar com Premium'));
  expect(await screen.findByText('Você já tem uma alteração de plano pendente de aprovação do CEO')).toBeInTheDocument();
  expect(mockPush).not.toHaveBeenCalled();
});

test('fora do onboarding (loja aberta) leva para Plano e comissão', () => {
  mockQuery = {};
  render(<SelectPlan />);
  expect(mockReplace).toHaveBeenCalledWith('/seller/plano');
});
