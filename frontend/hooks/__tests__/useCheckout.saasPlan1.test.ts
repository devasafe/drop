import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';
import { __resetSaasConfigCache } from '../useSaasConfig';

// Revisão final da Fase 1 (I3): no modo direto não existe Plano 1 — a loja com
// plan === 1 NÃO pode mandar o cliente para /checkout-vitrine (sem motoboy).

const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace }) }));
jest.mock('../../lib/api');
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 1, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => ({ addresses: [], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 50, storeId: 's1' }], add: jest.fn(), clear: jest.fn() }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

function mockSettlement(mode: 'direto' | 'custodia') {
  mockedApi.get.mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/settings/saas' ? { settlementMode: mode, directCardEnabled: false } : { balance: 0 } } as unknown as AxiosResponse)) as any);
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  __resetSaasConfigCache();
  mockedApi.post.mockResolvedValue({ data: { distanceKm: 0 } } as unknown as AxiosResponse);
});

test('modo direto: loja plan 1 NÃO redireciona para /checkout-vitrine e não é tratada como Plano 1', async () => {
  mockSettlement('direto');
  const { result } = renderHook(() => useCheckout());
  await act(async () => {});
  await act(async () => {});
  expect(replace).not.toHaveBeenCalledWith('/checkout-vitrine');
  expect(result.current.isPlan1).toBe(false);
});

test('custódia: loja plan 1 continua indo para /checkout-vitrine', async () => {
  mockSettlement('custodia');
  renderHook(() => useCheckout());
  await act(async () => {});
  await act(async () => {});
  expect(replace).toHaveBeenCalledWith('/checkout-vitrine');
});
