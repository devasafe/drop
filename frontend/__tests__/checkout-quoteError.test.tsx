import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Página do checkout: rota indisponível mostra a mensagem própria e um "tentar de novo".
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
const retryQuote = jest.fn();

function hook(quoteError: string | null) {
  return {
    blocked: false,
    address: {
      loading: false, selected: null, addresses: [], selectAddress: jest.fn(),
      fields: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' },
      setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn(),
    },
    items: [{ productId: 'p1', quantity: 1, price: 10, name: 'Item', storeId: 's1' }],
    updateQuantity: jest.fn(), removeItem: jest.fn(),
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(),
    walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 10, deliveryFee: 0, discount: 0, total: 10,
    isPlan1: false, canPlace: quoteError === null, placing: false, isWalletInsufficient: false,
    placeOrder: jest.fn(), closePix: jest.fn(), pixData: null,
    pixNotice: { paymentProvider: null, recipientName: null },
    quoteError, retryQuote,
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false,
  } as unknown as ReturnType<typeof useCheckout>;
}

beforeEach(() => retryQuote.mockReset());

test('quoteError: mostra a mensagem e o botão chama retryQuote', () => {
  mockedUseCheckout.mockReturnValue(hook('Não conseguimos calcular a entrega agora.'));
  render(<CheckoutPage />);
  expect(screen.getAllByText('Não conseguimos calcular a entrega agora.').length).toBeGreaterThan(0);
  expect(screen.queryByText('Confirme o endereço no mapa')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(retryQuote).toHaveBeenCalledTimes(1);
});

test('sem quoteError: sem botão de tentar de novo', () => {
  mockedUseCheckout.mockReturnValue(hook(null));
  render(<CheckoutPage />);
  expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
});
