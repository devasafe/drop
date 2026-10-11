/** Revisão final C2 — I4. Sacola de loja que saiu do GET /stores: Alert honesto, nunca "Calculando entrega…". */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const push = jest.fn();
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({ PixPaymentSheet: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

import SacolaPage from '../pages/sacola';
import { useCheckout } from '../hooks/useCheckout';

const mocked = useCheckout as jest.MockedFunction<typeof useCheckout>;
const casa = { _id: 'a1', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', latitude: '-23.56', longitude: '-46.65' };
const retryStoreLookup = jest.fn();
function hook(over: Record<string, unknown> = {}) {
  return {
    blocked: false,
    address: { loading: false, selected: casa, addresses: [casa], selectAddress: jest.fn(), fields: {}, setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn() },
    items: [{ productId: 'p1', quantity: 1, price: 229.9, name: 'Fone JBL', storeId: 's1' }],
    updateQuantity: jest.fn(), removeItem: jest.fn(),
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(),
    walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 229.9, deliveryFee: 0, discount: 0, total: 229.9, distanceKm: 0, etaMinutes: null,
    isPlan1: false, canPlace: false, outOfArea: false, quoteError: null, retryQuote: jest.fn(), quoteLoading: false,
    placing: false, isWalletInsufficient: false, placeOrder: jest.fn(async () => ({ ok: true })), pixData: null, closePix: jest.fn(),
    pixNotice: { paymentProvider: null, recipientName: null },
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false, cardPayload: null, setCardPayload: jest.fn(), cardHolderDefaults: {},
    installmentCount: 1, setInstallmentCount: jest.fn(), config: null,
    store: null, storeOpen: true, opensAt: null,
    storeGone: null, storeLookupFailed: false, retryStoreLookup,
    ...over,
  } as unknown as ReturnType<typeof useCheckout>;
}
beforeEach(() => { push.mockClear(); retryStoreLookup.mockClear(); });

test('loja pausada antes de abrir a Sacola: Alert com o nome e pagamento travado', () => {
  mocked.mockReturnValue(hook({ storeGone: { reason: 'unavailable', name: 'Eletro Center' } }));
  render(<SacolaPage />);
  expect(screen.getByText('A Eletro Center não está recebendo pedidos agora')).toBeInTheDocument();
  expect(screen.queryByText('Calculando entrega…')).toBeNull();
  expect(screen.getAllByRole('button', { name: /Pagar/ }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
});

test('loja que não existe mais: "Esta loja não está mais disponível" e "Ver outras lojas"', () => {
  mocked.mockReturnValue(hook({ storeGone: { reason: 'gone' } }));
  render(<SacolaPage />);
  expect(screen.getAllByText('Esta loja não está mais disponível').length).toBeGreaterThan(0);
  expect(screen.queryByText('Calculando entrega…')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver outras lojas' }));
  expect(push).toHaveBeenCalledWith('/inicio');
});

test('falha ao consultar a loja: diz e oferece "Tentar de novo"', () => {
  mocked.mockReturnValue(hook({ storeLookupFailed: true }));
  render(<SacolaPage />);
  expect(screen.queryByText('Calculando entrega…')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(retryStoreLookup).toHaveBeenCalled();
});
