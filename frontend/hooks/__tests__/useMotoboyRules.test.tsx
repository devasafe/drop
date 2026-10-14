import { renderHook, waitFor, act } from '@testing-library/react';
import { useMotoboyRules } from '../useMotoboyRules';
import api from '../../lib/api';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
const CFG = {
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00', motoboyMinimumWithdraw: '50.00',
  customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00', transferBlockHours: 24,
};

beforeEach(() => get.mockReset());

test('carrega as regras de /settings/platform-config', async () => {
  get.mockResolvedValue({ data: CFG });
  const { result } = renderHook(() => useMotoboyRules());
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(get).toHaveBeenCalledWith('/settings/platform-config');
  expect(result.current.rules?.minimumWithdraw).toBe(50);
  expect(result.current.failed).toBe(false);
});

test('erro ou config estranha → failed, sem regra presumida; retry lê de novo', async () => {
  get.mockRejectedValueOnce(new Error('rede'));
  const { result } = renderHook(() => useMotoboyRules());
  await waitFor(() => expect(result.current.failed).toBe(true));
  expect(result.current.rules).toBeNull();
  get.mockResolvedValueOnce({ data: CFG });
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.rules?.basePerDelivery).toBe(5));
  expect(get).toHaveBeenCalledTimes(2);
});

test('config estranha (campo faltando) → failed com rules null', async () => {
  get.mockResolvedValue({ data: { ...CFG, motoboyMinimumWithdraw: undefined } });
  const { result } = renderHook(() => useMotoboyRules());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rules).toBeNull();
  expect(result.current.failed).toBe(true);
});
