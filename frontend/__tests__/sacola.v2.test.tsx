import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

const push = jest.fn();
const showToast = jest.fn();
const add = jest.fn();
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => ({ cart: [], add }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../hooks/useCheckout', () => ({ useCheckout: jest.fn() }));
jest.mock('../components/drop/checkout/PixPaymentSheet', () => ({
  PixPaymentSheet: (p: { amount?: number; onPaid: (id: string) => void }) => <button onClick={() => p.onPaid('o9')}>{`PIX_STUB ${p.amount}`}</button>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => Promise.resolve({ data: { data: [] } })) } }));

import SacolaPage from '../pages/sacola';
import { useCheckout } from '../hooks/useCheckout';
import { ROUTES, lojaHref, pedidoHref } from '../lib/routes';

const mocked = useCheckout as jest.MockedFunction<typeof useCheckout>;
const casa = { _id: 'a1', street: 'Av. Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', cep: '01310-200', latitude: '-23.56', longitude: '-46.65' };
const items = [
  { productId: 'p1', quantity: 1, price: 229.9, name: 'Fone JBL', storeId: 's1' },
  { productId: 'p2', quantity: 1, price: 39.9, name: 'Cabo USB-C', storeId: 's1' },
];
const updateQuantity = jest.fn();
const removeItem = jest.fn();
const placeOrder = jest.fn(async () => ({ ok: true }));

function hook(over: Record<string, unknown> = {}) {
  return {
    blocked: false,
    address: { loading: false, selected: casa, addresses: [casa], selectAddress: jest.fn(), fields: { cep: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '', latitude: '', longitude: '' }, setField: jest.fn(), lookupCep: jest.fn(), saveAddress: jest.fn() },
    items, updateQuantity, removeItem,
    coupon: { code: '', setCode: jest.fn(), apply: jest.fn(), remove: jest.fn(), message: null, validating: false, discount: 0 },
    paymentMethod: 'pix', setPaymentMethod: jest.fn(),
    walletBalance: 0, useWallet: false, setUseWallet: jest.fn(), pendingDebt: null,
    subtotal: 269.8, deliveryFee: 7.4, discount: 0, total: 277.2, distanceKm: 2.4, etaMinutes: [25, 35],
    isPlan1: false, canPlace: true, outOfArea: false, quoteError: null, retryQuote: jest.fn(), quoteLoading: false,
    placing: false, isWalletInsufficient: false, placeOrder, pixData: null, closePix: jest.fn(),
    pixNotice: { paymentProvider: null, recipientName: null },
    cpfRequired: false, cpf: '', setCpf: jest.fn(), cpfValid: false, cardPayload: null, setCardPayload: jest.fn(), cardHolderDefaults: {},
    installmentCount: 1, setInstallmentCount: jest.fn(), config: null,
    store: { _id: 's1', name: 'Eletro Center', plan: 2 }, storeOpen: true, opensAt: null,
    ...over,
  } as unknown as ReturnType<typeof useCheckout>;
}

beforeEach(() => { push.mockClear(); showToast.mockClear(); add.mockClear(); removeItem.mockClear(); placeOrder.mockClear(); localStorage.clear(); });

test('vazia: diz que está vazia e leva a explorar', () => {
  mocked.mockReturnValue(hook({ items: [] }));
  render(<SacolaPage />);
  expect(screen.getByText('Sua sacola está vazia')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Explorar lojas' }));
  expect(push).toHaveBeenCalledWith(ROUTES.inicio);
});

test('loja, itens, entrega, resumo e botão com valor e método', () => {
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(screen.getByRole('heading', { name: 'Eletro Center' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Adicionar mais' })).toHaveAttribute('href', lojaHref('s1'));
  expect(screen.getByText('Chega em ~35 min')).toBeInTheDocument();
  const resumo = screen.getByRole('region', { name: 'Resumo' });
  expect(within(resumo).getByText('Subtotal (2 itens)')).toBeInTheDocument();
  expect(within(resumo).getByText('Entrega · 2,4 km')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pagar R$ 277,20 com Pix' }));
  expect(placeOrder).toHaveBeenCalled();
});

test('saldo da carteira entra no resumo e no botão', () => {
  mocked.mockReturnValue(hook({ walletBalance: 18.2, useWallet: true }));
  render(<SacolaPage />);
  expect(screen.getByText('Saldo da carteira')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagar R$ 259,00 com Pix' })).toBeInTheDocument();
});

test('remover = levar a 0, com "Desfazer" no toast', () => {
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Remover Fone JBL' }));
  expect(removeItem).toHaveBeenCalledWith('p1');
  const [msg, tone, opts] = showToast.mock.calls[0];
  expect([msg, tone]).toEqual(['Item removido', 'info']);
  expect(opts.action.label).toBe('Desfazer');
  opts.action.onClick();
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quantity: 1 }));
});

test('fora da área: Alert no bloco de entrega com "Trocar endereço" que abre o seletor', () => {
  mocked.mockReturnValue(hook({ outOfArea: true, canPlace: false, etaMinutes: null }));
  render(<SacolaPage />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Eletro Center não entrega neste endereço');
  fireEvent.click(within(alert).getByRole('button', { name: 'Trocar endereço' }));
  expect(screen.getByRole('dialog', { name: 'Onde entregar?' })).toBeInTheDocument();
  expect(screen.getByText('Esta loja não entrega nesse endereço')).toBeInTheDocument();
});

test('loja fechada: avisa quando abre e não deixa pagar', () => {
  mocked.mockReturnValue(hook({ storeOpen: false, opensAt: '09:00' }));
  render(<SacolaPage />);
  expect(screen.getByText('Loja fechada agora')).toBeInTheDocument();
  expect(screen.getByText(/Abre às 09:00/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
  expect(screen.getByText('A loja está fechada agora')).toBeInTheDocument();
});

test('sem endereço: diz o que falta e abre o seletor', () => {
  mocked.mockReturnValue(hook({ address: { ...hook().address, selected: null, addresses: [] }, canPlace: false, etaMinutes: null }));
  render(<SacolaPage />);
  expect(screen.getByText('Adicione um endereço de entrega')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar endereço' }));
  expect(screen.getByText('Você ainda não tem endereço salvo.')).toBeInTheDocument();
});

test('Plano 1: a loja entrega, sem taxa', () => {
  mocked.mockReturnValue(hook({ isPlan1: true, deliveryFee: 0, total: 269.8, etaMinutes: null, distanceKm: 0 }));
  render(<SacolaPage />);
  expect(screen.getByText('A loja mesma entrega')).toBeInTheDocument();
  const resumo = screen.getByRole('region', { name: 'Resumo' });
  expect(within(resumo).getByText('Entrega pela loja')).toBeInTheDocument();
  expect(within(resumo).getByText('Grátis')).toBeInTheDocument();
});

test('erro ao pagar vira toast', async () => {
  placeOrder.mockResolvedValueOnce({ ok: false, error: 'Loja fechada no momento.' } as any);
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Pagar R$ 277,20 com Pix' }));
  await screen.findByRole('button', { name: 'Pagar R$ 277,20 com Pix' });
  expect(showToast).toHaveBeenCalledWith('Loja fechada no momento.', 'error');
});

test('quantidade: "+" e "−" repassam a nova quantidade (porte do CheckoutItems)', () => {
  mocked.mockReturnValue(hook({ items: [{ productId: 'p2', quantity: 3, price: 39.9, name: 'Cabo USB-C', storeId: 's1' }] }));
  updateQuantity.mockClear();
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: /aumentar/i }));
  expect(updateQuantity).toHaveBeenCalledWith('p2', 4);
  fireEvent.click(screen.getByRole('button', { name: /diminuir/i }));
  expect(updateQuantity).toHaveBeenCalledWith('p2', 2);
});

test('trocar endereço: escolher outro no seletor chama selectAddress e fecha (porte do AddressSelector)', () => {
  const selectAddress = jest.fn();
  const outro = { ...casa, _id: 'a2', street: 'Rua Augusta', number: '200' };
  mocked.mockReturnValue(hook({ address: { ...hook().address, addresses: [casa, outro], selectAddress } }));
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
  fireEvent.click(screen.getByRole('button', { name: /Rua Augusta/ }));
  expect(selectAddress).toHaveBeenCalledWith(1);
  expect(screen.queryByRole('dialog', { name: 'Onde entregar?' })).not.toBeInTheDocument();
  expect(localStorage.getItem('drop:deliveryAddressId')).toBe('a2');
});

test('com endereço: mostra a rua e o número no bloco Entrega (porte do AddressSelector)', () => {
  mocked.mockReturnValue(hook());
  render(<SacolaPage />);
  expect(screen.getByText(/Av\. Paulista, 1578/)).toBeInTheDocument();
});

test('NO_ADDRESS: pede para confirmar o endereço e abre o seletor', () => {
  mocked.mockReturnValue(hook({ canPlace: false, etaMinutes: null, deliveryIssue: 'NO_ADDRESS' }));
  render(<SacolaPage />);
  expect(screen.getAllByText('Confirme o endereço no mapa').length).toBeGreaterThan(0);
  expect(screen.queryByText('Calculando entrega…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Trocar endereço' }));
  expect(screen.getByRole('dialog', { name: 'Onde entregar?' })).toBeInTheDocument();
});

test('STORE_NO_LOCATION: diz que a loja não configurou a localização e não deixa pagar', () => {
  mocked.mockReturnValue(hook({ canPlace: false, etaMinutes: null, deliveryIssue: 'STORE_NO_LOCATION' }));
  render(<SacolaPage />);
  expect(screen.getAllByText('Esta loja ainda não configurou a localização.').length).toBeGreaterThan(0);
  expect(screen.queryByText('Calculando entrega…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
});

test('a11y: a dica do botão travado está ligada a ele por aria-describedby', () => {
  mocked.mockReturnValue(hook({ storeOpen: false, opensAt: '09:00' }));
  render(<SacolaPage />);
  const btn = screen.getByRole('button', { name: /^Pagar/ });
  const hintEl = document.getElementById(btn.getAttribute('aria-describedby') as string);
  expect(hintEl).toHaveTextContent('A loja está fechada agora');
});

test('Pix: o sheet mostra o valor da cobrança do servidor e, pago, vai ao pedido', () => {
  mocked.mockReturnValue(hook({ items: [], pixData: { orderId: 'o9', qrCodePayload: 'x', amount: 259 } }));
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'PIX_STUB 259' }));
  expect(push).toHaveBeenCalledWith(pedidoHref('o9'));
});

test('"Adicionar endereço" na sacola sem endereço leva ao cadastro (porte do AddressSelector)', () => {
  mocked.mockReturnValue(hook({ address: { ...hook().address, selected: null, addresses: [] }, canPlace: false, etaMinutes: null }));
  render(<SacolaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar endereço' }));
  fireEvent.click(screen.getByRole('button', { name: 'Novo endereço' }));
  expect(screen.getByRole('dialog', { name: 'Endereço de entrega' })).toBeInTheDocument();
});

test('P11 — Plano 1 sem endereço: não deixa pagar e diz o que falta', () => {
  mocked.mockReturnValue(hook({ isPlan1: true, deliveryFee: 0, total: 269.8, etaMinutes: null, canPlace: true, address: { ...hook().address, selected: null, addresses: [] } }));
  render(<SacolaPage />);
  expect(screen.getByText('Adicione um endereço de entrega')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
});

test('CPF: pedido antes do botão, erro uma vez só', () => {
  mocked.mockReturnValue(hook({ cpfRequired: true, cpf: '123.456.789-00' }));
  render(<SacolaPage />);
  expect(screen.getAllByLabelText(/CPF/i)).toHaveLength(1);
  expect(screen.getAllByText('CPF inválido')).toHaveLength(1);
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
});

test('saldo cobre tudo: "Pagar com o saldo da carteira"', () => {
  mocked.mockReturnValue(hook({ walletBalance: 500, useWallet: true }));
  render(<SacolaPage />);
  expect(screen.getByRole('button', { name: 'Pagar com o saldo da carteira' })).toBeInTheDocument();
});

test('cartão: parcelas visíveis, acréscimo no resumo e botão com a parcela', () => {
  mocked.mockReturnValue(hook({
    paymentMethod: 'credit_card', installmentCount: 3, cardPayload: { valid: true },
    config: { base: 5, perKm: 1, cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 },
  }));
  render(<SacolaPage />);
  expect(screen.getByText('O acréscimo é a taxa da operadora do cartão. No Pix você paga R$ 277,20.')).toBeInTheDocument();
  expect(screen.getByText('Acréscimo do cartão 3x')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar 3x de R\$ [\d.,]+$/ })).toBeInTheDocument();
});

test('F-I2 — Plano 1 fora do raio: mesma mensagem dos outros planos e pagamento bloqueado', () => {
  mocked.mockReturnValue(hook({ isPlan1: true, deliveryFee: 0, total: 269.8, etaMinutes: null, outOfArea: true, canPlace: false }));
  render(<SacolaPage />);
  expect(screen.getByText('Eletro Center não entrega neste endereço')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
  expect(screen.getAllByText('Esta loja não entrega nesse endereço').length).toBeGreaterThan(0);
});

test('F-I2 — Plano 1 fechado pela cotação: "Loja fechada agora" com horário e pagamento bloqueado', () => {
  mocked.mockReturnValue(hook({ isPlan1: true, deliveryFee: 0, total: 269.8, etaMinutes: null, storeOpen: false, opensAt: '09:00' }));
  render(<SacolaPage />);
  expect(screen.getByText('Loja fechada agora')).toBeInTheDocument();
  expect(screen.getByText(/Abre às 09:00/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
});

test('F-I4 — saldo cobrindo o total: não oferece "pagar só com saldo" (o Asaas recusa); o toggle no Pix continua', () => {
  mocked.mockReturnValue(hook({ walletBalance: 500 }));
  render(<SacolaPage />);
  expect(screen.queryByText('Crédito na carteira')).not.toBeInTheDocument();
  expect(screen.getByText('PIX')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /saldo/i })).toBeInTheDocument();
});

test('M6 — rascunho antigo com "wallet" volta para o Pix (nunca fica sem chip)', () => {
  const setPaymentMethod = jest.fn();
  mocked.mockReturnValue(hook({ paymentMethod: 'wallet', walletBalance: 10, setPaymentMethod }));
  render(<SacolaPage />);
  expect(setPaymentMethod).toHaveBeenCalledWith('pix');
});

test('M1 — parcela fora das opções (sacola encolheu): a escolha volta para a opção mostrada', () => {
  const setInstallmentCount = jest.fn();
  mocked.mockReturnValue(hook({
    paymentMethod: 'credit_card', installmentCount: 6, setInstallmentCount, cardPayload: { valid: true }, subtotal: 20, deliveryFee: 0, total: 20,
    config: { base: 5, perKm: 1, cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 },
  }));
  render(<SacolaPage />);
  expect(setInstallmentCount).toHaveBeenCalledWith(1);
  expect(screen.getByRole('button', { name: /^Pagar R\$ [\d.,]+ no cartão$/ })).toBeInTheDocument();
});
