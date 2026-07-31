import React from 'react';
import { render, screen } from '@testing-library/react';

// ProtectedRoute exige auth — bypassa renderizando os filhos direto.
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
// Stub do PixPaymentSheet (o real faz polling via api) — só queremos saber se renderiza.
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({
  PixPaymentSheet: () => <div>PIX_SHEET_STUB</div>,
}));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));

import CheckoutPage from '../pages/checkout';
import { useCheckout } from '../hooks/useCheckout';

const mockedUseCheckout = useCheckout as jest.MockedFunction<typeof useCheckout>;

function baseHook(overrides: Partial<ReturnType<typeof useCheckout>> = {}) {
  return {
    blocked: false,
    address: {
      loading: false, selected: null, addresses: [], selectAddress: jest.fn(),
      fields: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' },
      setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn(),
    },
    items: [],
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(),
    walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
    isPlan1: false, canPlace: true, placing: false, isWalletInsufficient: false,
    placeOrder: jest.fn(), pixData: null, closePix: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCheckout>;
}

describe('CheckoutPage — render do PixPaymentSheet', () => {
  test('mostra o PixPaymentSheet quando há pixData mesmo com o carrinho vazio (estado pós-pedido)', () => {
    // placeOrder limpa o carrinho ANTES de setar pixData, então items fica vazio
    // no mesmo render em que pixData aparece. O sheet do PIX precisa sobreviver a isso.
    mockedUseCheckout.mockReturnValue(baseHook({
      items: [],
      pixData: { orderId: 'o1', qrCodePayload: 'copia-e-cola' },
    } as unknown as ReturnType<typeof useCheckout>));
    render(<CheckoutPage />);
    expect(screen.getByText('PIX_SHEET_STUB')).toBeInTheDocument();
  });

  test('não renderiza o PixPaymentSheet quando não há pixData', () => {
    mockedUseCheckout.mockReturnValue(baseHook({ items: [], pixData: null }));
    render(<CheckoutPage />);
    expect(screen.queryByText('PIX_SHEET_STUB')).not.toBeInTheDocument();
  });
});
