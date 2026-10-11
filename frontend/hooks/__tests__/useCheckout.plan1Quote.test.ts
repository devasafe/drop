import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

// Ruling F-I2: a Sacola aplica ao Plano 1 a MESMA cotação (raio e horário) que card, Loja e
// Produto mostram (estimateQuote no servidor) e bloqueia o pagamento fora dela.
let mockIsOpen = true;
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('../../lib/api');
const addr = { _id: 'a1', isDefault: true, cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', latitude: '-22.91', longitude: '-43.21' };
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 1, latitude: '-22.9', longitude: '-43.2', isOpen: mockIsOpen }], loading: false }),
  useAddresses: () => ({ addresses: [addr], loading: false, setAddresses: jest.fn() }),
}));
jest.mock('../../contexts/CartContext', () => ({ useCart: () => ({ cart: [{ productId: 'p1', quantity: 1, price: 10, storeId: 's1' }], clear: jest.fn() }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }) }));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;
const plan1Quote = { storeId: 's1', inArea: true, deliveryFee: 0, distanceKm: 1.2, etaMinutes: [20, 30], fee: 0, freeDelivery: true, open: true, source: 'estimate' };

function setup(quoteOver: Record<string, unknown> | 'fail' = {}) {
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
  mockedApi.post.mockImplementation(((url: string) => {
    if (url === '/orders/quote') {
      return quoteOver === 'fail' ? Promise.reject(new Error('429')) : Promise.resolve({ data: { ...plan1Quote, ...quoteOver } });
    }
    return Promise.resolve({ data: { order: { _id: 'o1' } } });
  }) as any);
}
const orderCalls = () => mockedApi.post.mock.calls.filter(([u]) => u === '/orders');
async function mount() {
  const r = renderHook(() => useCheckout());
  await act(async () => {}); await act(async () => {});
  return r;
}

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); mockIsOpen = true; });

test('Plano 1 fora do raio: fora da área, sem poder pagar e sem POST /orders', async () => {
  setup({ inArea: false, reason: 'OUT_OF_AREA', distanceKm: null, etaMinutes: null, fee: null, freeDelivery: false });
  const { result } = await mount();
  expect(result.current.isPlan1).toBe(true);
  expect(mockedApi.post).toHaveBeenCalledWith('/orders/quote', expect.objectContaining({ storeId: 's1' }));
  expect(result.current.outOfArea).toBe(true);
  expect(result.current.canPlace).toBe(false);
  let r: { ok: boolean; error?: string } = { ok: true };
  await act(async () => { r = await result.current.placeOrder(); });
  expect(r).toEqual({ ok: false, error: 'Esta loja não entrega nesse endereço.' });
  expect(orderCalls()).toHaveLength(0);
});

test('Plano 1 fechado pela cotação (Store.isOpen true, fora do horário): fechada com horário de abertura', async () => {
  setup({ open: false, opensAt: '09:00' });
  const { result } = await mount();
  expect(result.current.storeOpen).toBe(false);
  expect(result.current.opensAt).toBe('09:00');
});

test('Plano 1 dentro do raio e aberto: pode pagar, entrega continua grátis e sem km', async () => {
  setup();
  const { result } = await mount();
  expect(result.current.canPlace).toBe(true);
  expect(result.current.deliveryFee).toBe(0);
  await act(async () => { await result.current.placeOrder(); });
  expect(orderCalls()[0][1]).toMatchObject({ deliveryDistanceKm: 0 });
});

test('Plano 1 com a cotação falhando: bloqueia com a mensagem de tentar de novo (fail closed)', async () => {
  setup('fail');
  const { result } = await mount();
  expect(result.current.canPlace).toBe(false);
  expect(result.current.quoteError).toBe('Não conseguimos calcular a entrega agora.');
});
