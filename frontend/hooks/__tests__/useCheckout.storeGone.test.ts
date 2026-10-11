/**
 * Revisão final C2 — I4. A loja do carrinho não veio no GET /stores (pausada pela mensalidade,
 * removida ou a lista falhou): o useCheckout consulta GET /stores/:id em vez de deixar a Sacola
 * presa em "Calculando entrega…".
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [], loading: false }),
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

function mockStore(reply: () => Promise<unknown>) {
  mockedApi.get.mockImplementation(((url: string) => {
    if (url === '/stores/s1') return reply();
    return Promise.resolve({ data: {} });
  }) as any);
}
const notFound = (data: unknown) => () => Promise.reject({ response: { status: 404, data } });

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.post.mockResolvedValue({ data: {} } as any);
});

test('loja pausada (STORE_UNAVAILABLE): devolve o nome do resumo e trava', async () => {
  mockStore(notFound({ error: 'Store not found', code: 'STORE_UNAVAILABLE', store: { _id: 's1', name: 'Eletro Center' } }));
  const { result } = renderHook(() => useCheckout());
  await waitFor(() => expect(result.current.storeGone).toEqual({ reason: 'unavailable', name: 'Eletro Center' }));
  expect(mockedApi.get).toHaveBeenCalledWith('/stores/s1');
  expect(result.current.canPlace).toBe(false);
});

test('outro 404: loja não existe mais', async () => {
  mockStore(notFound({ error: 'Store not found' }));
  const { result } = renderHook(() => useCheckout());
  await waitFor(() => expect(result.current.storeGone).toEqual({ reason: 'gone' }));
});

test('a loja existe (a lista falhou): usa o detalhe como loja da sacola', async () => {
  mockStore(() => Promise.resolve({ data: { _id: 's1', name: 'Eletro Center', plan: 2, latitude: '-22.9', longitude: '-43.2' } }));
  const { result } = renderHook(() => useCheckout());
  await waitFor(() => expect(result.current.store).toEqual({ _id: 's1', name: 'Eletro Center', plan: 2 }));
  expect(result.current.storeGone).toBeNull();
});

test('erro de rede: storeLookupFailed e retry consulta de novo', async () => {
  let calls = 0;
  mockStore(() => { calls += 1; return calls === 1 ? Promise.reject(new Error('rede')) : Promise.resolve({ data: { _id: 's1', name: 'Eletro Center', plan: 2 } }); });
  const { result } = renderHook(() => useCheckout());
  await waitFor(() => expect(result.current.storeLookupFailed).toBe(true));
  await act(async () => { result.current.retryStoreLookup(); });
  await waitFor(() => expect(result.current.store?.name).toBe('Eletro Center'));
  expect(result.current.storeLookupFailed).toBe(false);
});
