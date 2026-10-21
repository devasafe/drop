import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const showToast = jest.fn();
let mockSaas: any = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({ PixPaymentSheet: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

import SacolaPage from '../pages/sacola';
import { useCheckout } from '../hooks/useCheckout';

const mocked = useCheckout as jest.MockedFunction<typeof useCheckout>;
const casa = { _id: 'a1', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', latitude: '-23.56', longitude: '-46.65' };
const placeOrder = jest.fn();
function hook(over: Record<string, unknown> = {}) {
  return {
    blocked: false,
    address: { loading: false, selected: casa, addresses: [casa], selectAddress: jest.fn(), fields: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' }, setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn() },
    items: [{ productId: 'p1', quantity: 1, price: 64.9, name: 'Caderno A5', storeId: 's1' }], updateQuantity: jest.fn(), removeItem: jest.fn(),
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(), walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 64.9, deliveryFee: 0, discount: 0, total: 64.9, distanceKm: 4.1, etaMinutes: null,
    isPlan1: false, canPlace: true, outOfArea: false, quoteError: null, retryQuote: jest.fn(), quoteLoading: false,
    placing: false, isWalletInsufficient: false, placeOrder, pixData: null, closePix: jest.fn(), pixNotice: { paymentProvider: null, recipientName: null },
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false, cardPayload: null, setCardPayload: jest.fn(), cardHolderDefaults: {},
    installmentCount: 1, setInstallmentCount: jest.fn(), config: null,
    store: { _id: 's1', name: 'Papel & Cia', plan: 2 }, storeOpen: true, opensAt: null,
    ...over,
  } as unknown as ReturnType<typeof useCheckout>;
}
beforeEach(() => { showToast.mockClear(); placeOrder.mockReset(); mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false }; });

test('vitrine (Plano 1, custódia): selo, "Entregar em", distância e a nota do repasse', () => {
  mocked.mockReturnValue(hook({ isPlan1: true, store: { _id: 's1', name: 'Papel & Cia', plan: 1 } }));
  render(<SacolaPage />);
  expect(screen.getByText('Vitrine')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Entregar em' })).toBeInTheDocument();
  expect(screen.getByText('A loja fica a 4,1 km')).toBeInTheDocument();
  expect(screen.getByText('O dinheiro só vai para a loja quando você confirmar que recebeu.')).toBeInTheDocument();
});

test('modo direto: loja no topo, Pix em linha, cartão desativado com o motivo e para quem vai o Pix', () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  mocked.mockReturnValue(hook({ store: { _id: 's1', name: 'Eletro Center', plan: 2 } }));
  render(<SacolaPage />);
  expect(screen.getByRole('radio', { name: /Pix/ })).toBeChecked();
  expect(screen.getByRole('radio', { name: /Cartão/ })).toBeDisabled();
  expect(screen.getByText('Esta loja ainda não aceita cartão')).toBeInTheDocument();
  expect(screen.getByText(/direto para a Eletro Center/)).toBeInTheDocument();
});

test('modo direto: loja pausou com a sacola aberta → Alert e pagamento travado, sem toast', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  placeOrder.mockResolvedValue({ ok: false, error: 'Esta loja está temporariamente indisponível.', code: 'STORE_BILLING_PAUSED' });
  mocked.mockReturnValue(hook({ store: { _id: 's1', name: 'Eletro Center', plan: 2 } }));
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }));
  expect(await screen.findByText('A Eletro Center não está recebendo pedidos agora')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled());
  expect(showToast).not.toHaveBeenCalled();
});

test('modo direto: loja pausada pelo DROP (STORE_ADMIN_PAUSED) → mesmo Alert da cobrança pausada, sem o motivo interno', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  placeOrder.mockResolvedValue({ ok: false, error: 'Esta loja está temporariamente indisponível.', code: 'STORE_ADMIN_PAUSED' });
  mocked.mockReturnValue(hook({ store: { _id: 's1', name: 'Eletro Center', plan: 2 } }));
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }));
  expect(await screen.findByText('A Eletro Center não está recebendo pedidos agora')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled());
  expect(showToast).not.toHaveBeenCalled();
});
