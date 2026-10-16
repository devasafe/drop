import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/settings' }) }));
const mockAuth = { user: { _id: 'c1', activeRole: 'ceo', role: 'ceo' }, loading: false, permissionsLoading: false, can: () => true };
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

const CONFIG = {
  _id: 'cfg', commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyMinimumWithdraw: 10, storeMinimumWithdraw: 10,
  motoboyCommissionPercent: 20, cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10,
  storeAcceptTimeoutMin: 10, poolTimeoutMin: 15, customerAbsentWaitMin: 15,
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/settings/platform-config' ? Promise.resolve({ data: CONFIG }) : Promise.resolve({ data: {} }),
  );
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

test('mostra os dois mínimos e salva o da loja', async () => {
  render(<AdminSettings />);
  await screen.findByLabelText('Saque mínimo da loja (R$)');
  expect(field('Saque mínimo da loja (R$)').value).toBe('10');
  expect(field('Saque mínimo do motoboy (R$)').value).toBe('10');

  fireEvent.change(field('Saque mínimo da loja (R$)'), { target: { value: '15' } });
  (api.put as jest.Mock).mockResolvedValue({ data: { config: { ...CONFIG, storeMinimumWithdraw: 15 }, message: 'ok' } });
  fireEvent.click(screen.getByRole('button', { name: /Salvar 1 mudança/ }));

  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/settings/platform-config',
      expect.objectContaining({ storeMinimumWithdraw: 15, motoboyMinimumWithdraw: 10 }),
    ),
  );
});

test('depois de salvar, os campos mantêm os valores salvos (não zeram)', async () => {
  render(<AdminSettings />);
  await screen.findByLabelText('Saque mínimo da loja (R$)');
  fireEvent.change(field('Saque mínimo da loja (R$)'), { target: { value: '15' } });
  (api.put as jest.Mock).mockResolvedValue({ data: { config: { ...CONFIG, storeMinimumWithdraw: 15 }, message: 'ok' } });
  fireEvent.click(screen.getByRole('button', { name: /Salvar 1 mudança/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nenhuma mudança' })).toBeDisabled());
  expect(field('Saque mínimo da loja (R$)').value).toBe('15');
  expect(field('Saque mínimo do motoboy (R$)').value).toBe('10');
});
