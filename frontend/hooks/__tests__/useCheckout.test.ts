import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../lib/api';

const push = jest.fn();
const replace = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push, replace }),
}));
jest.mock('../../lib/api');
const savedAddress = {
  _id: 'a1', cep: '20000-000', street: 'Rua X', number: '10', neighborhood: 'Centro',
  city: 'Rio de Janeiro', state: 'RJ', latitude: '-22.91', longitude: '-43.21',
};

const mockUseAddresses = jest.fn();
jest.mock('../useSync', () => ({
  useStores: () => ({ stores: [{ _id: 's1', plan: 2, latitude: '-22.9', longitude: '-43.2' }], loading: false }),
  useAddresses: () => mockUseAddresses(),
}));
jest.mock('../../contexts/CartContext', () => ({
  useCart: () => ({
    cart: [{ productId: 'p1', quantity: 2, price: 50, storeId: 's1' }],
    add: jest.fn(), clear: jest.fn(),
  }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'cliente', activeRole: 'cliente' } }),
}));

import { useCheckout } from '../useCheckout';
const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockedApi.get.mockResolvedValue({ data: { balance: 0 } } as unknown as AxiosResponse);
  mockUseAddresses.mockReturnValue({ addresses: [savedAddress], loading: false, setAddresses: jest.fn() });
});

test('total = subtotal + frete - desconto', async () => {
  const { result } = renderHook(() => useCheckout());
  // subtotal = 2*50 = 100; sem frete/desconto ainda
  expect(result.current.subtotal).toBe(100);
  expect(result.current.total).toBe(100);
  // flush do fetch de carteira/config (assíncrono) antes do teste terminar
  await act(async () => {});
});

test('restaura rascunho salvo e depois salva mudanças de endereço/pagamento', async () => {
  const draft = {
    fields: { cep: '30000-000', street: 'Rua Y', number: '5', neighborhood: 'B', city: 'C', state: 'MG', latitude: '', longitude: '' },
    paymentMethod: 'credit_card',
  };
  localStorage.setItem('checkout_draft', JSON.stringify(draft));

  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush do restore (mount) + fetch de carteira/config

  expect(result.current.address.fields).toEqual(draft.fields);
  expect(result.current.paymentMethod).toBe('credit_card');

  // Mudar o método de pagamento deve reescrever o rascunho persistido.
  act(() => { result.current.setPaymentMethod('pix'); });
  await act(async () => {});
  const saved = JSON.parse(localStorage.getItem('checkout_draft') || '{}');
  expect(saved.paymentMethod).toBe('pix');
  expect(saved.fields).toEqual(draft.fields);
});

test('ignora rascunho corrompido sem quebrar e não sobrescreve com estado vazio antes de hidratar', async () => {
  localStorage.setItem('checkout_draft', '{not valid json');

  const { result } = renderHook(() => useCheckout());
  await act(async () => {});

  expect(result.current.paymentMethod).toBe('pix'); // default, rascunho corrompido foi ignorado
  // depois de hidratar, o auto-save já reescreveu a chave com o estado atual (válido)
  expect(() => JSON.parse(localStorage.getItem('checkout_draft') || '{}')).not.toThrow();
});

test('placeOrder envia payload com idempotentKey e abre pix', async () => {
  // Loja é Plano 2 (entrega integrada) -> canPlace exige distanceKm >= 0.1,
  // que só é calculado via Google Directions após um endereço ser selecionado.
  (window as unknown as { google: unknown }).google = {
    maps: {
      DirectionsService: class {
        route(_req: unknown, cb: (res: { routes: { legs: { distance: { value: number } }[] }[] }, status: string) => void) {
          cb({ routes: [{ legs: [{ distance: { value: 1500 } }] }] }, 'OK');
        }
      },
      TravelMode: { DRIVING: 'DRIVING' },
    },
  };
  mockedApi.post.mockResolvedValueOnce({ data: { order: { _id: 'o1' }, pix: { qrCodePayload: 'x', orderId: 'o1' } } } as unknown as AxiosResponse);
  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush do fetch de carteira/config

  act(() => { result.current.address.selectAddress(0); });
  expect(result.current.distanceKm).toBe(1.5);
  expect(result.current.canPlace).toBe(true);

  await act(async () => { await result.current.placeOrder(); });
  const payload = mockedApi.post.mock.calls.find(c => c[0] === '/orders')?.[1] as Record<string, unknown> | undefined;
  expect(payload?.storeId).toBe('s1');
  expect(payload?.idempotentKey).toBeTruthy();
  expect(payload?.products).toEqual([{ productId: 'p1', quantity: 2, price: 50 }]);
  expect(result.current.pixData?.orderId).toBe('o1');
});

// Regressão do bug crítico da revisão: `cardHolder.cpfCnpj`/`phone` vinham
// SEMPRE vazios porque eram montados a partir de `user` (AuthContext), que
// não tem esses campos — todo pedido de cartão levava 400 do backend (Zod
// exige cpfCnpj 11/14 dígitos e phone 10/11 — validation/schemas.ts). O
// fix busca GET /user/me (que devolve cpf/telefone — userController.ts
// getMe) e expõe `cardHolderDefaults` já com esses campos preenchidos.
test('cardHolderDefaults vem preenchido de GET /user/me, e placeOrder envia cardHolder com cpfCnpj/phone não-vazios pro POST /orders quando paymentMethod=credit_card', async () => {
  (window as unknown as { google: unknown }).google = {
    maps: {
      DirectionsService: class {
        route(_req: unknown, cb: (res: { routes: { legs: { distance: { value: number } }[] }[] }, status: string) => void) {
          cb({ routes: [{ legs: [{ distance: { value: 1500 } }] }] }, 'OK');
        }
      },
      TravelMode: { DRIVING: 'DRIVING' },
    },
  };
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/user/me') {
      return Promise.resolve({ data: { cpf: '24971563792', telefone: '11999999999' } } as unknown as AxiosResponse);
    }
    return Promise.resolve({ data: { balance: 0 } } as unknown as AxiosResponse);
  });
  mockedApi.post.mockResolvedValueOnce({
    data: { order: { _id: 'o2' }, card: { status: 'CONFIRMED', approved: true } },
  } as unknown as AxiosResponse);

  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush de wallet/config/debt/user-me

  act(() => { result.current.address.selectAddress(0); });
  await act(async () => {}); // flush do Directions -> distanceKm

  // O que o CardForm receberia como `holderDefaults` já vem certo do hook.
  expect(result.current.cardHolderDefaults.cpfCnpj).toBe('24971563792');
  expect(result.current.cardHolderDefaults.phone).toBe('11999999999');

  act(() => { result.current.setPaymentMethod('credit_card'); });
  act(() => {
    result.current.setCardPayload({
      valid: true,
      card: { holderName: 'Fulano de Tal', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      cardHolder: result.current.cardHolderDefaults,
    });
  });

  await act(async () => { await result.current.placeOrder(); });

  const payload = mockedApi.post.mock.calls.find(c => c[0] === '/orders')?.[1] as Record<string, unknown> | undefined;
  const cardHolder = payload?.cardHolder as { cpfCnpj?: string; phone?: string } | undefined;
  expect(cardHolder?.cpfCnpj).toBeTruthy();
  expect(cardHolder?.phone).toBeTruthy();
  expect(cardHolder?.cpfCnpj).toMatch(/^\d{11}$|^\d{14}$/);
  expect(cardHolder?.phone).toMatch(/^\d{10,11}$/);
  // não deve abrir sheet de PIX pro fluxo de cartão
  expect(result.current.pixData).toBeNull();
});

test('auto-seleciona o endereço marcado como isDefault assim que a lista carrega', async () => {
  const other = { ...savedAddress, _id: 'a0', isDefault: false };
  const main = { ...savedAddress, _id: 'a1', isDefault: true };
  // Padrão não é o primeiro da lista — confirma que a seleção olha a flag,
  // não apenas cai pro índice 0.
  mockUseAddresses.mockReturnValue({ addresses: [other, main], loading: false, setAddresses: jest.fn() });

  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush do effect de auto-seleção + fetch de carteira/config

  expect(result.current.address.selected?._id).toBe('a1');
});

test('seleção manual após o auto-select não é revertida pro endereço padrão', async () => {
  const other = { ...savedAddress, _id: 'a0', isDefault: false };
  const main = { ...savedAddress, _id: 'a1', isDefault: true };
  mockUseAddresses.mockReturnValue({ addresses: [other, main], loading: false, setAddresses: jest.fn() });

  const { result } = renderHook(() => useCheckout());
  // Nesse ponto o auto-select já rodou (selected = 'a1', o isDefault).
  act(() => { result.current.address.selectAddress(0); }); // usuário troca manualmente
  await act(async () => {});

  expect(result.current.address.selected?._id).toBe('a0');
});

test('expõe pendingDebt vindo de GET /debts/my-pending', async () => {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/debts/my-pending') {
      return Promise.resolve({ data: { debt: { amount: '42.50' } } } as unknown as AxiosResponse);
    }
    return Promise.resolve({ data: { balance: 0 } } as unknown as AxiosResponse);
  });

  const { result } = renderHook(() => useCheckout());
  await act(async () => {});

  expect(result.current.pendingDebt).toBe(42.5);
});

// Regressão do bug crítico da revisão final: cartão de crédito é cobrança
// externa (Asaas), igual PIX — não deveria depender de saldo de carteira.
// Antes do fix, `isWalletInsufficient` considerava qualquer método != 'pix'
// como dependente de saldo, deixando o botão de checkout travado com
// "Saldo insuficiente" pra todo comprador com carteira zerada usando cartão.
test('isWalletInsufficient é false para credit_card mesmo com carteira zerada e total positivo', async () => {
  const { result } = renderHook(() => useCheckout());
  await act(async () => {}); // flush do fetch de carteira (balance: 0, do beforeEach)

  expect(result.current.walletBalance).toBe(0);
  expect(result.current.total).toBeGreaterThan(0);

  act(() => { result.current.setPaymentMethod('credit_card'); });

  expect(result.current.isWalletInsufficient).toBe(false);
});

test('pendingDebt fica null quando não há dívida pendente', async () => {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/debts/my-pending') {
      return Promise.resolve({ data: { debt: null } } as unknown as AxiosResponse);
    }
    return Promise.resolve({ data: { balance: 0 } } as unknown as AxiosResponse);
  });

  const { result } = renderHook(() => useCheckout());
  await act(async () => {});

  expect(result.current.pendingDebt).toBeNull();
});
