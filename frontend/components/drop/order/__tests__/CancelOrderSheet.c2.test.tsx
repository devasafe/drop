import { render, screen, fireEvent } from '@testing-library/react';
import api from '../../../../lib/api';
import { CancelOrderSheet } from '../CancelOrderSheet';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
beforeEach(() => get.mockReset());

it('motoboy em rota: diz que a entrega fica com ele e quanto volta; o botão mostra o valor', async () => {
  get.mockResolvedValue({ data: { success: true, data: { cancellable: true, fee: 7.4, refund: 236.6, motoboyEnRoute: true, paymentMethod: 'pix' } } });
  const onConfirm = jest.fn();
  render(<CancelOrderSheet open orderId="o1" courierName="Carlos" onClose={() => {}} onConfirm={onConfirm} />);
  expect(await screen.findByText('O Carlos já retirou seu pedido')).toBeInTheDocument();
  expect(screen.getByText(/A entrega \(R\$ 7,40\) fica com ele/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Está demorando demais' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar e receber R$ 236,60' }));
  expect(onConfirm).toHaveBeenCalledWith({ reason: 'Está demorando demais', reasonCode: 'other' });
  expect(get).toHaveBeenCalledWith('/orders/o1/cancel-preview');
});

it('antes da retirada: cancelamento grátis; "Manter o pedido" fecha', async () => {
  get.mockResolvedValue({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, motoboyEnRoute: false, paymentMethod: 'pix' } } });
  const onClose = jest.fn();
  render(<CancelOrderSheet open orderId="o1" onClose={onClose} onConfirm={() => {}} />);
  expect(await screen.findByText('Cancelamento grátis')).toBeInTheDocument();
  expect(screen.getByText('R$ 244,00 voltam para o Pix em até 1 dia útil.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Manter o pedido' }));
  expect(onClose).toHaveBeenCalled();
});

it('fechar e reabrir busca a prévia de novo (o pedido pode ter mudado)', async () => {
  get.mockResolvedValue({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, motoboyEnRoute: false, paymentMethod: 'pix' } } });
  const { rerender } = render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  await screen.findByText('Cancelamento grátis');
  rerender(<CancelOrderSheet open={false} orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  rerender(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  await screen.findByText('Cancelamento grátis');
  expect(get).toHaveBeenCalledTimes(2);
});

it('não dá mais para cancelar: diz e não mostra o botão de cancelar', async () => {
  get.mockResolvedValue({ data: { success: true, data: { cancellable: false, reason: 'STATUS', status: 'entregue' } } });
  render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  expect(await screen.findByText('Este pedido não pode mais ser cancelado')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Cancelar e receber|Cancelar o pedido/ })).toBeNull();
});

it('carregando: o botão de cancelar fica desabilitado até a prévia chegar', async () => {
  let resolve: (v: any) => void = () => {};
  get.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeDisabled();
  resolve({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, paymentMethod: 'pix' } } });
  expect(await screen.findByRole('button', { name: 'Cancelar e receber R$ 244,00' })).toBeEnabled();
});

it('falha da prévia: avisa, não deixa cancelar sem ver o valor e "Tentar de novo" busca outra vez', async () => {
  get.mockRejectedValueOnce(new Error('rede'));
  get.mockResolvedValueOnce({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, paymentMethod: 'pix' } } });
  const onConfirm = jest.fn();
  render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={onConfirm} />);
  expect(await screen.findByText('Não deu para calcular quanto volta')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('button', { name: 'Cancelar e receber R$ 244,00' })).toBeEnabled();
  expect(get).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Não deu para calcular quanto volta')).toBeNull();
});
