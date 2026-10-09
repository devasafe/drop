import React from 'react';
import { render, screen } from '@testing-library/react';

// Página do checkout repassa o aviso do Asaas (pixNotice do useCheckout) ao PixPaymentSheet real.
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(() => new Promise(() => {})), post: jest.fn() },
}));

import CheckoutPage from '../pages/checkout';
import { useCheckout } from '../hooks/useCheckout';

const mockedUseCheckout = useCheckout as jest.MockedFunction<typeof useCheckout>;

function hook(pixNotice: { paymentProvider: string | null; recipientName: string | null }) {
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
    placeOrder: jest.fn(), closePix: jest.fn(),
    pixData: { orderId: 'o1', qrCodePayload: 'copia-e-cola' },
    pixNotice,
  } as unknown as ReturnType<typeof useCheckout>;
}

test('pedido direto: o sheet do Pix mostra "processado pelo Asaas" com o nome da loja', () => {
  mockedUseCheckout.mockReturnValue(hook({ paymentProvider: 'asaas_loja', recipientName: 'Pizzaria Boa' }));
  render(<CheckoutPage />);
  expect(screen.getByText('Pix processado pelo Asaas. Recebedor: Pizzaria Boa')).toBeInTheDocument();
});

test('pedido de custódia: sem o aviso do Asaas da loja', () => {
  mockedUseCheckout.mockReturnValue(hook({ paymentProvider: null, recipientName: null }));
  render(<CheckoutPage />);
  expect(screen.queryByText(/processado pelo Asaas/)).not.toBeInTheDocument();
});
