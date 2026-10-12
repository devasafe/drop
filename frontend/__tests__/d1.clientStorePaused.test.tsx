import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const showToast = jest.fn();
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add: jest.fn() }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({ PixPaymentSheet: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

import SacolaPage from '../pages/sacola';
import { useCheckout } from '../hooks/useCheckout';
import { mapStore } from '../lib/mapStore';
import { openStatus } from '../lib/storeHours';
import { StoreCard } from '../components/drop/StoreCard';

const mocked = useCheckout as jest.MockedFunction<typeof useCheckout>;
const casa = { _id: 'a1', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', latitude: '-23.56', longitude: '-46.65' };
const placeOrder = jest.fn();
function hook() {
  return {
    blocked: false,
    address: { loading: false, selected: casa, addresses: [casa], selectAddress: jest.fn(), fields: {}, setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn() },
    items: [{ productId: 'p1', quantity: 1, price: 64.9, name: 'Caderno A5', storeId: 's1' }], updateQuantity: jest.fn(), removeItem: jest.fn(),
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(), walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 64.9, deliveryFee: 0, discount: 0, total: 64.9, distanceKm: 4.1, etaMinutes: null,
    isPlan1: false, canPlace: true, outOfArea: false, quoteError: null, retryQuote: jest.fn(), quoteLoading: false,
    placing: false, isWalletInsufficient: false, placeOrder, pixData: null, closePix: jest.fn(), pixNotice: { paymentProvider: null, recipientName: null },
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false, cardPayload: null, setCardPayload: jest.fn(), cardHolderDefaults: {},
    installmentCount: 1, setInstallmentCount: jest.fn(), config: null,
    store: { _id: 's1', name: 'Papel & Cia', plan: 2 }, storeOpen: true, opensAt: null,
  } as unknown as ReturnType<typeof useCheckout>;
}

describe('loja pausada na vitrine', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-12T12:00:00-03:00')); });
  afterEach(() => { jest.useRealTimers(); });

  it('pausedUntil no futuro: fechada, com "Pausada · volta às 14:30"', () => {
    const store = { name: 'Loja', isOpen: true, pausedUntil: '2026-10-12T14:30:00-03:00' };
    expect(openStatus(store).open).toBe(false);
    const card = mapStore(store);
    expect(card.status).toBe('fechada');
    render(<StoreCard variant="resultado" store={card} onClick={jest.fn()} />);
    expect(screen.getByText('Pausada · volta às 14:30')).toBeInTheDocument();
  });

  it('pausedUntil no passado ou nulo: igual ao de antes', () => {
    const base = { name: 'Loja', isOpen: true };
    expect(mapStore({ ...base, pausedUntil: '2026-10-12T10:00:00-03:00' })).toEqual(mapStore(base));
    expect(mapStore({ ...base, pausedUntil: null }).status).toBe('aberta');
  });
});

describe('sacola: mensagens de pausa', () => {
  beforeEach(() => { showToast.mockClear(); placeOrder.mockReset(); mocked.mockReturnValue(hook()); });
  const pay = () => fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }));

  it('409 PRODUCT_PAUSED mostra a mensagem do produto', async () => {
    placeOrder.mockResolvedValue({ ok: false, error: 'x', code: 'PRODUCT_PAUSED' });
    render(<SacolaPage />); pay();
    await screen.findByRole('button', { name: /^Pagar/ });
    expect(showToast).toHaveBeenCalledWith('Este produto foi pausado pela loja', 'error');
  });

  it('409 STORE_PAUSED mostra a mensagem da loja', async () => {
    placeOrder.mockResolvedValue({ ok: false, error: 'x', code: 'STORE_PAUSED' });
    render(<SacolaPage />); pay();
    await screen.findByRole('button', { name: /^Pagar/ });
    expect(showToast).toHaveBeenCalledWith('A loja pausou os pedidos agora', 'error');
  });
});
