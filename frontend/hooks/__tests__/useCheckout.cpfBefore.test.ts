/**
 * Task 8: o checkout pede o CPF ANTES do primeiro envio quando /user/me diz que o CPF
 * não é válido ('missing' ou 'invalid') e o método é Pix. Sem `cpfStatus` (resposta antiga)
 * nada muda: o CPF_REQUIRED do servidor continua como rede de segurança.
 */
import { renderHook, act } from '@testing-library/react';
import api from '../../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
const savedAddress = {
  _id: 'a1', cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro',
  city: 'Rio de Janeiro', state: 'RJ', latitude: '-22.91', longitude: '-43.21',
};
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', name: 'Loja', plan: 2, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => ({ addresses: [savedAddress], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 50, storeId: 's1' }], add: jest.fn(), clear: jest.fn() }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

function mockMe(cpfStatus?: string) {
  mockedApi.get.mockImplementation(((url: string) =>
    Promise.resolve({ data: url === '/user/me' ? { cpf: '', telefone: '', ...(cpfStatus ? { cpfStatus } : {}) } : { balance: 0 } })) as any);
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') return Promise.resolve({ data: { distanceKm: 1.5, inArea: true, deliveryFee: 6.5 } });
    if (url === '/orders') return Promise.resolve({ data: { order: { _id: 'o1' }, pix: { qrCodePayload: 'x' } } });
    return Promise.resolve({ data: {} });
  }) as any);
}

async function mount() {
  const hook = renderHook(() => useCheckout());
  await act(async () => {});
  act(() => { hook.result.current.address.selectAddress(0); });
  await act(async () => {});
  return hook;
}

const orderCalls = () => mockedApi.post.mock.calls.filter((c) => c[0] === '/orders');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

test("cpfStatus 'missing' + Pix → cpfRequired já começa true e nada é enviado sem CPF válido", async () => {
  mockMe('missing');
  const { result } = await mount();
  expect(result.current.cpfRequired).toBe(true);
  expect(result.current.cpfValid).toBe(false);

  let r: { ok: boolean; error?: string } = { ok: true };
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r.ok).toBe(false);
  expect(orderCalls()).toHaveLength(0);

  // 11 dígitos com verificador errado: continua travado
  act(() => { result.current.setCpf('123.456.789-00'); });
  expect(result.current.cpfValid).toBe(false);
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r.ok).toBe(false);
  expect(orderCalls()).toHaveLength(0);

  act(() => { result.current.setCpf('390.533.447-05'); });
  expect(result.current.cpfValid).toBe(true);
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r.ok).toBe(true);
  expect((orderCalls()[0][1] as Record<string, unknown>).cpf).toBe('39053344705');
});

test("cpfStatus 'invalid' + Pix → também pede o CPF antes de pagar", async () => {
  mockMe('invalid');
  const { result } = await mount();
  expect(result.current.cpfRequired).toBe(true);
});

test("cpfStatus 'valid' → não pede CPF", async () => {
  mockMe('valid');
  const { result } = await mount();
  expect(result.current.cpfRequired).toBe(false);
});

test('sem cpfStatus (resposta antiga) → não pede CPF de antemão', async () => {
  mockMe();
  const { result } = await mount();
  expect(result.current.cpfRequired).toBe(false);
});

test("cpfStatus 'missing' com cartão → não pede (o CPF do titular vem no cardHolder)", async () => {
  mockMe('missing');
  const { result } = await mount();
  act(() => { result.current.setPaymentMethod('credit_card'); });
  expect(result.current.cpfRequired).toBe(false);
  act(() => { result.current.setPaymentMethod('pix'); });
  expect(result.current.cpfRequired).toBe(true);
});

test('CPF_REQUIRED vindo do servidor: 11 dígitos com verificador errado não reenviam (mesma regra do botão)', async () => {
  mockMe();
  let calls = 0;
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') return Promise.resolve({ data: { distanceKm: 1.5, inArea: true, deliveryFee: 6.5 } });
    if (url === '/orders') {
      calls += 1;
      if (calls === 1) return Promise.reject({ response: { status: 400, data: { error: 'x', code: 'CPF_REQUIRED' } } });
      return Promise.resolve({ data: { order: { _id: 'o2' }, pix: { qrCodePayload: 'x' } } });
    }
    return Promise.resolve({ data: {} });
  }) as any);
  const { result } = await mount();
  let r: { ok: boolean; error?: string } = { ok: true };
  await act(async () => { r = await result.current.placeOrder(); });
  expect(result.current.cpfRequired).toBe(true);
  act(() => { result.current.setCpf('123.456.789-00'); });
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r.ok).toBe(false);
  expect(r.error).toBe('CPF inválido. Confira os números.');
  expect(calls).toBe(1);
});
