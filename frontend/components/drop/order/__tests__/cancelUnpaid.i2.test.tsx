/**
 * Revisão final C2 — I2. Pedido não pago não promete estorno; saldo da carteira volta para
 * a carteira e só o resto volta para o Pix/cartão (mesma divisão do cancelamento real).
 */
import { render, screen } from '@testing-library/react';
import api from '../../../../lib/api';
import { CancelOrderSheet } from '../CancelOrderSheet';
import { CancellationStatus } from '../CancellationStatus';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
beforeEach(() => get.mockReset());
const prev = (data: any) => get.mockResolvedValue({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, motoboyEnRoute: false, paymentMethod: 'pix', ...data } } });

describe('CancelOrderSheet', () => {
  it('não pago: "Nada foi cobrado" e botão sem valor', async () => {
    prev({ paid: false, walletPart: 0, providerPart: 0 });
    render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
    expect(await screen.findByText('Nada foi cobrado')).toBeInTheDocument();
    expect(screen.queryByText(/voltam para o Pix/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Cancelar e receber/ })).toBeNull();
  });

  it('não pago com saldo reservado: só o saldo volta para a carteira', async () => {
    prev({ paid: false, walletPart: 50, providerPart: 0 });
    render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
    expect(await screen.findByText('Nada foi cobrado no Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 do saldo voltam para a carteira.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar o pedido' })).toBeEnabled();
  });

  it('pago com parte em carteira: divide carteira e Pix', async () => {
    prev({ paid: true, walletPart: 50, providerPart: 194 });
    render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
    expect(await screen.findByText('Cancelamento grátis')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 voltam para a carteira e R$ 194,00 voltam para o Pix em até 1 dia útil.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar e receber R$ 244,00' })).toBeEnabled();
  });
});

describe('CancellationStatus', () => {
  const base = { cancelledBy: 'customer' as const, reasonCode: 'customer_request', reason: 'Mudei de ideia', createdAt: '2026-09-01T10:14:00', refundAmount: 244, refundStatus: 'processed' as const };

  it('cancelado sem pagamento: "Nada foi cobrado", sem "Estorno concluído" nem valor de estorno', () => {
    render(<CancellationStatus cancellation={base} paymentMethod="pix" paymentStatus="pending" />);
    expect(screen.getByText('Nada foi cobrado')).toBeInTheDocument();
    expect(screen.queryByText('Estorno concluído')).toBeNull();
    expect(screen.queryByText(/Estorno de R\$/)).toBeNull();
    expect(screen.queryByText('Dinheiro na sua conta')).toBeNull();
  });

  it('cancelado sem pagamento com saldo usado: diz que o saldo voltou para a carteira', () => {
    render(<CancellationStatus cancellation={base} paymentMethod="pix" paymentStatus="pending" walletApplied={50} />);
    expect(screen.getByText('Nada foi cobrado no Pix')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 do saldo voltaram para a carteira.')).toBeInTheDocument();
  });

  it('pago e estornado continua mostrando o estorno', () => {
    render(<CancellationStatus cancellation={base} paymentMethod="pix" paymentStatus="refunded" />);
    expect(screen.getByText('Estorno concluído')).toBeInTheDocument();
    expect(screen.getByText('Estorno de R$ 244,00')).toBeInTheDocument();
  });
});
