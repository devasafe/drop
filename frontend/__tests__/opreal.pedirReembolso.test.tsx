import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc123def456' }, push: jest.fn(), replace, back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const showToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast }) }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => mockGet(...a), post: (...a: any[]) => mockPost(...a) } }));
import PedirReembolsoPage from '../pages/pedido/[id]/reembolso';

const order = { _id: 'abc123def456', storeName: 'Eletro Center', status: 'entregue', totalValue: 244, deliveryFee: 14.1, products: [{ productId: 'p1', productName: 'Fone JBL 520BT', quantity: 1, price: 229.9 }] };
let amounts: any;

beforeEach(() => {
  jest.clearAllMocks();
  amounts = { defeito: 244, errado: 244, arrependimento: 244 };
  mockGet.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/preview') ? { amounts } : order }));
  mockPost.mockResolvedValue({ data: { _id: 'rr1', status: 'aguardando_loja' } });
});

/** Caso B (DS v2, "Pedir reembolso"): motivo, foto opcional, valor escrito, enviar à loja. */
test('mostra o produto e já vem em "Veio com defeito", com o valor que volta', async () => {
  render(<PedirReembolsoPage />);
  expect(await screen.findByText('Fone JBL 520BT')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /Veio com defeito/ })).toBeChecked();
  expect(await screen.findByText('Volta tudo: R$ 244,00')).toBeInTheDocument();
});

test('arrependimento depois de 7 dias: diz que a entrega não volta', async () => {
  amounts = { defeito: 244, errado: 244, arrependimento: 229.9 };
  render(<PedirReembolsoPage />);
  fireEvent.click(await screen.findByRole('radio', { name: /Me arrependi/ }));
  expect(await screen.findByText('Volta R$ 229,90')).toBeInTheDocument();
  expect(screen.getByText(/a entrega já foi feita/)).toBeInTheDocument();
});

test('enviar manda motivo, comentário e como devolver, e vai para a aba Reembolsos', async () => {
  render(<PedirReembolsoPage />);
  fireEvent.click(await screen.findByRole('radio', { name: /Veio diferente do pedido/ }));
  fireEvent.change(screen.getByLabelText(/Conte o que aconteceu/), { target: { value: 'Veio o preto, pedi o branco.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido à loja' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalled());
  const [url, body] = mockPost.mock.calls[0];
  expect(url).toBe('/orders/abc123def456/return-request');
  expect(body).toBeInstanceOf(FormData);
  expect((body as FormData).get('reason')).toBe('errado');
  expect((body as FormData).get('note')).toBe('Veio o preto, pedi o branco.');
  expect((body as FormData).get('mode')).toBe('motoboy');
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/pedidos?tab=reembolsos'));
});

test('como devolver: motoboy por padrão; no arrependimento avisa que o cliente paga a corrida', async () => {
  render(<PedirReembolsoPage />);
  expect(await screen.findByRole('radio', { name: /Um motoboy busca comigo/ })).toBeChecked();
  expect(screen.getByText('Grátis: a loja paga a corrida')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /Me arrependi/ }));
  expect(screen.getByText('Você paga a corrida por Pix depois que a loja aprovar')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: /Levo na loja/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido à loja' }));
  await waitFor(() => expect(mockPost).toHaveBeenCalled());
  expect((mockPost.mock.calls[0][1] as FormData).get('mode')).toBe('loja');
});

test('erro do servidor vira toast e fica na tela', async () => {
  mockPost.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Já existe um pedido de reembolso para este pedido' } } });
  render(<PedirReembolsoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enviar pedido à loja' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Já existe um pedido de reembolso para este pedido', 'error'));
  expect(replace).not.toHaveBeenCalled();
});

test('pedido que não pode ter reembolso pelo app: explica e oferece o suporte', async () => {
  mockGet.mockImplementation((url: string) => (url.endsWith('/preview')
    ? Promise.reject({ response: { status: 409, data: { error: 'Este pedido não pode ter reembolso pelo app. Fale com o suporte.', code: 'RETURN_NOT_AVAILABLE' } } })
    : Promise.resolve({ data: order })));
  render(<PedirReembolsoPage />);
  expect(await screen.findByText('Este pedido não pode ter reembolso pelo app. Fale com o suporte.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Enviar pedido à loja' })).not.toBeInTheDocument();
});
