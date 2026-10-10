import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// /checkout-vitrine: depois do POST /orders navega para o pedido criado, tanto no
// formato do Asaas ({ order, pix }) quanto no legado (o próprio pedido).
const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/Icon', () => ({ __esModule: true, default: () => null }));
jest.mock('../contexts/CartContext', () => ({
  useCart: () => ({
    cart: [{ productId: 'p1', quantity: 1, name: 'Item', price: 10, storeId: 's1' }],
    clear: jest.fn(),
  }),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../hooks/useSync', () => ({ useStores: () => ({ stores: [{ _id: 's1', plan: 1, name: 'Loja' }] }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', loading: false }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

import CheckoutVitrinePage from '../pages/checkout-vitrine';
import api from '../lib/api';

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock };

beforeEach(() => {
  push.mockReset();
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url === '/wallets/my-wallet') return { data: { balance: 1000 } };
    if (url === '/user/me') {
      return { data: { mainAddress: { street: 'Rua X', number: '1', neighborhood: 'Centro', city: 'Rio', state: 'RJ', cep: '20000-000' } } };
    }
    return { data: {} };
  });
});

async function confirm() {
  render(<CheckoutVitrinePage />);
  await waitFor(() => expect(screen.getByDisplayValue('Rua X')).toBeInTheDocument());
  const btn = screen.getByRole('button', { name: 'Confirmar Pedido' });
  await waitFor(() => expect(btn).not.toBeDisabled());
  fireEvent.click(btn);
}

test('resposta do Asaas ({ order, pix }) navega para o id do pedido', async () => {
  mockedApi.post.mockResolvedValue({ data: { order: { _id: 'ord-asaas' }, pix: { id: 'pay_1' } } });
  await confirm();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/store-order/ord-asaas'));
});

test('resposta legada (o próprio pedido) continua navegando', async () => {
  mockedApi.post.mockResolvedValue({ data: { _id: 'ord-legado' } });
  await confirm();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/store-order/ord-legado'));
});
