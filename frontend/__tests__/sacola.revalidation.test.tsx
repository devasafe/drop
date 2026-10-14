import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const push = jest.fn();
const back = jest.fn();
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push, back }) }));
const showToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({ PixPaymentSheet: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));
const retry = jest.fn();
let prices: { status: 'checking' | 'ok' | 'failed'; notice: string | null; retry: () => void } = { status: 'ok', notice: null, retry };
jest.mock('../hooks/useCartRevalidation', () => ({ useCartRevalidation: () => prices }));

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

const payButton = () => screen.getByRole('button', { name: /^Pagar/ });
const hintOf = (btn: HTMLElement) => document.getElementById(btn.getAttribute('aria-describedby') as string);
beforeEach(() => { prices = { status: 'ok', notice: null, retry }; retry.mockClear(); showToast.mockClear(); });

test('conferindo os preços: pagar fica desabilitado e diz por quê', () => {
  prices = { ...prices, status: 'checking' };
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(payButton()).toBeDisabled();
  expect(hintOf(payButton())).toHaveTextContent('Conferindo os preços…');
});

test('conferência falhou: Alert com "Tentar de novo" e pagar continua bloqueado (fail closed)', () => {
  prices = { ...prices, status: 'failed' };
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Não conferimos os preços agora');
  expect(payButton()).toBeDisabled();
  expect(hintOf(payButton())).toHaveTextContent('Não conferimos os preços agora');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(retry).toHaveBeenCalled();
});

test('preços conferidos: pagar liberado', () => {
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(payButton()).toBeEnabled();
});

test('preço mudou na conferência: aviso fixo "Os preços mudaram"', () => {
  prices = { ...prices, notice: 'O preço de RedBull mudou: agora R$ 19,00.' };
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(screen.getByText('Os preços mudaram')).toBeInTheDocument();
  expect(screen.getByText('O preço de RedBull mudou: agora R$ 19,00.')).toBeInTheDocument();
});

test('servidor recusou com PRICE_CHANGED: força conferência nova e avisa até ela terminar', async () => {
  const placeOrder = jest.fn(async () => ({ ok: false, code: 'PRICE_CHANGED', error: 'Os preços mudaram. Confira a sacola.' }));
  mocked.mockReturnValue(hook({ placeOrder }));
  const { rerender } = render(<SacolaPage />);
  fireEvent.click(payButton());
  expect(await screen.findByText('Os preços mudaram')).toBeInTheDocument();
  expect(screen.getByText('Confira os valores novos da sacola antes de pagar.')).toBeInTheDocument();
  expect(showToast).toHaveBeenCalledWith('Os preços mudaram. Confira a sacola.', 'error');
  expect(retry).toHaveBeenCalledTimes(1);
  // A conferência nova roda (pagar bloqueado) e termina ok trazendo o que mudou.
  prices = { ...prices, status: 'checking' };
  rerender(<SacolaPage />);
  expect(payButton()).toBeDisabled();
  prices = { ...prices, status: 'ok', notice: 'O preço de RedBull mudou: agora R$ 25,00.' };
  rerender(<SacolaPage />);
  expect(screen.queryByText('Confira os valores novos da sacola antes de pagar.')).not.toBeInTheDocument();
  expect(screen.getByText('O preço de RedBull mudou: agora R$ 25,00.')).toBeInTheDocument();
  expect(payButton()).toBeEnabled();
});

test('PRICE_CHANGED sem itens (ou malformado): também força conferência nova', async () => {
  const placeOrder = jest.fn(async () => ({ ok: false, code: 'PRICE_CHANGED', error: 'Os preços mudaram. Confira a sacola.' }));
  mocked.mockReturnValue(hook({ placeOrder }));
  render(<SacolaPage />);
  fireEvent.click(payButton());
  await screen.findByText('Os preços mudaram');
  expect(retry).toHaveBeenCalledTimes(1);
});
