import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanoStep } from '../PlanoStep';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-subscription') return Promise.resolve({ data: { currentPlan: 'plan1', planChangeStatus: 'none' } });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
    return Promise.resolve({ data: {} });
  });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
});

test('cards com a comissão à direita e o exemplo de R$ 100; pedir troca avisa o checklist', async () => {
  const onDone = jest.fn();
  render(<PlanoStep onDone={onDone} />);
  expect(await screen.findByText('15%')).toBeInTheDocument();
  expect(screen.getByText('10%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /Pool de motoboys/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Começar com Pool de motoboys' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/store-subscription/request-change', { newPlan: 'plan2' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('troca já pedida para o mesmo plano não pede de novo', async () => {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/settings/store-subscription') return Promise.resolve({ data: { currentPlan: 'plan1', planChangeStatus: 'pending', requestedPlan: 'plan2' } });
    return Promise.resolve({ data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5 } });
  });
  const onDone = jest.fn();
  render(<PlanoStep onDone={onDone} />);
  fireEvent.click(await screen.findByRole('radio', { name: /Pool de motoboys/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Começar com Pool de motoboys' }));
  expect(api.post).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});
