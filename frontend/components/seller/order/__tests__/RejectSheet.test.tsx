import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RejectSheet } from '../RejectSheet';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, post: jest.fn(), put: jest.fn() } }));
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;

const order = {
  _id: 'ord000004823', customerName: 'Ana Souza', totalValue: 269.8, status: 'criado',
  products: [{ productId: 'p1', productName: 'Fone JBL Tune 520BT', quantity: 1, price: 229.9 }, { productId: 'p2', productName: 'Cabo USB-C 2 m', quantity: 1, price: 39.9 }],
};

beforeEach(() => { jest.clearAllMocks(); });

test('mostra o valor que volta ao cliente a partir do pedido do servidor', () => {
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  expect(screen.getByText('Recusar o pedido #004823?')).toBeInTheDocument();
  expect(screen.getByText(/Ana Souza recebe R\$ 269,80 de volta/)).toBeInTheDocument();
});

test('sem motivo escolhido o botão fica desligado', () => {
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Recusar pedido' })).toBeDisabled();
});

test('envia reason + reasonCode iguais aos da tela antiga', async () => {
  post.mockResolvedValue({ data: { success: true, orderId: order._id, refundAmount: 269.8, refundStatus: 'processed' } });
  const onRejected = jest.fn();
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={onRejected} />);
  fireEvent.click(screen.getByLabelText('Vou fechar'));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(`/orders/${order._id}/reject`, { reason: 'Loja está fechada no momento', reasonCode: 'store_closed' }));
  expect(await screen.findByText(/R\$ 269,80 voltam para o cliente/)).toBeInTheDocument();
  expect(onRejected).toHaveBeenCalledWith({ refundStatus: 'processed', refundAmount: 269.8 });
});

test('"Outro motivo" manda o texto digitado', async () => {
  post.mockResolvedValue({ data: { success: true, refundStatus: 'processed', refundAmount: 269.8 } });
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Outro motivo'));
  fireEvent.change(screen.getByLabelText('Conte o motivo'), { target: { value: 'Endereço fora da área' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith(`/orders/${order._id}/reject`, { reason: 'Endereço fora da área', reasonCode: 'other' }));
});

test('refundStatus pending diz "em análise pela DROP"', async () => {
  post.mockResolvedValue({ data: { success: true, refundStatus: 'pending', refundAmount: 269.8 } });
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Loja cheia agora'));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  expect(await screen.findByText(/em análise pela DROP/)).toBeInTheDocument();
});

test.each([['failed', { refundStatus: 'failed', refundAmount: 269.8 }], ['ausente', { refundAmount: 269.8 }]])('refundStatus %s não promete o valor', async (_n, data) => {
  post.mockResolvedValue({ data: { success: true, ...data } });
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Loja cheia agora'));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  expect(await screen.findByText(/em análise pela DROP/)).toBeInTheDocument();
  expect(screen.queryByText(/voltam para o cliente/)).not.toBeInTheDocument();
});

test('"Acabou um item" pausa só o produto marcado, por PUT /products/:id/active', async () => {
  post.mockResolvedValue({ data: { success: true, refundStatus: 'processed', refundAmount: 269.8 } });
  put.mockResolvedValue({ data: { success: true, data: { _id: 'p1', isActive: false } } });
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} />);
  fireEvent.click(screen.getByLabelText('Acabou um item'));
  fireEvent.click(screen.getByLabelText('Pausar Fone JBL Tune 520BT até eu repor'));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/products/p1/active', { isActive: false }));
  expect(put).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(`/orders/${order._id}/reject`, { reason: 'Item fora de estoque', reasonCode: 'not_available' });
});

test('409 avisa que o pedido já foi resolvido e chama onAlreadyHandled', async () => {
  post.mockRejectedValue({ response: { status: 409, data: { error: 'Pedido já foi rejeitado/cancelado ou está em processamento' } } });
  const onAlready = jest.fn();
  render(<RejectSheet order={order} onClose={jest.fn()} onRejected={jest.fn()} onAlreadyHandled={onAlready} />);
  fireEvent.click(screen.getByLabelText('Vou fechar'));
  fireEvent.click(screen.getByRole('button', { name: 'Recusar pedido' }));
  expect(await screen.findByText('Este pedido já foi aceito ou cancelado. A lista foi atualizada.')).toBeInTheDocument();
  expect(onAlready).toHaveBeenCalled();
});

test('modo cancelar não promete valor antes da resposta', () => {
  render(<RejectSheet order={{ ...order, status: 'aguardando_motoboy' }} mode="cancelar" onClose={jest.fn()} onRejected={jest.fn()} />);
  expect(screen.getByText('Cancelar o pedido #004823?')).toBeInTheDocument();
  expect(screen.queryByText(/recebe R\$/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'RejectSheet.module.css'), 'utf8'))).toEqual([]);
});
