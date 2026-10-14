import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const push = jest.fn();
const back = jest.fn();
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push, back }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({ PixPaymentSheet: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const revalidate = jest.fn();
jest.mock('../hooks/useCartRevalidation', () => ({ useCartRevalidation: () => revalidate() }));

import SacolaPage from '../pages/sacola';
import { useCheckout } from '../hooks/useCheckout';

const mocked = useCheckout as jest.MockedFunction<typeof useCheckout>;
const casa = { _id: 'a1', street: 'Av. Paulista', number: '1578', complement: 'ap. 42', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', latitude: '-23.56', longitude: '-46.65' };
const setPaymentMethod = jest.fn();
function hook(over: Record<string, unknown> = {}) {
  return {
    blocked: false,
    address: { loading: false, selected: casa, addresses: [casa], selectAddress: jest.fn(), fields: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' }, setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn() },
    items: [{ productId: 'p1', quantity: 1, price: 229.9, name: 'Fone JBL', storeId: 's1' }, { productId: 'p2', quantity: 1, price: 39.9, name: 'Cabo USB-C', storeId: 's1' }],
    updateQuantity: jest.fn(), removeItem: jest.fn(),
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod,
    walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 269.8, deliveryFee: 7.4, discount: 0, total: 277.2, distanceKm: 2.4, etaMinutes: [25, 35],
    isPlan1: false, canPlace: true, outOfArea: false, quoteError: null, retryQuote: jest.fn(), quoteLoading: false,
    placing: false, isWalletInsufficient: false, placeOrder: jest.fn(async () => ({ ok: true })), pixData: null, closePix: jest.fn(),
    pixNotice: { paymentProvider: null, recipientName: null },
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false, cardPayload: null, setCardPayload: jest.fn(), cardHolderDefaults: {},
    installmentCount: 1, setInstallmentCount: jest.fn(), config: null,
    store: { _id: 's1', name: 'Eletro Center', plan: 2 }, storeOpen: true, opensAt: null,
    ...over,
  } as unknown as ReturnType<typeof useCheckout>;
}
beforeEach(() => { push.mockClear(); back.mockClear(); setPaymentMethod.mockClear(); });


test('a Sacola confere preço, nome e estoque atuais dos itens com o servidor', () => {
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(revalidate).toHaveBeenCalled();
});
