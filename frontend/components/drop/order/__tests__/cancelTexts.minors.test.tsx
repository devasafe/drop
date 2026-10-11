/** Revisão final C2 — M1, M2, M3: textos do cancelamento dizem só o que o sistema cumpre. */
import { render, screen } from '@testing-library/react';
import api from '../../../../lib/api';
import { CancelOrderSheet } from '../CancelOrderSheet';
import { CancellationStatus } from '../CancellationStatus';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
const base = { cancelledBy: 'store' as const, reasonCode: 'not_available', reason: 'Cabo esgotou', createdAt: '2026-09-01T10:14:00', refundAmount: 39.9 };

it('M1: estorno retido (pending) fica "Em análise pelo DROP", sem prazo e sem marcar o banco como feito', () => {
  const { container } = render(<CancellationStatus cancellation={{ ...base, refundStatus: 'pending' }} paymentMethod="pix" />);
  expect(screen.getByText('Em análise pelo DROP')).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/1 dia útil/);
  const banco = screen.getByText('Estorno pedido ao banco').closest('li')!;
  expect(banco.className).not.toMatch(/done/);
});

it('M2: no cartão, a prévia não promete prazo — o estorno aparece na fatura', async () => {
  get.mockResolvedValue({ data: { success: true, data: { cancellable: true, fee: 0, refund: 244, paymentMethod: 'credit_card', paid: true, walletPart: 0, providerPart: 244 } } });
  render(<CancelOrderSheet open orderId="o1" onClose={() => {}} onConfirm={() => {}} />);
  expect(await screen.findByText('R$ 244,00 voltam para o cartão; o estorno aparece na fatura.')).toBeInTheDocument();
  expect(screen.queryByText(/1 dia útil/)).toBeNull();
});

it('M2: no status, cartão estornado não promete "Até 1 dia útil"', () => {
  const { container } = render(<CancellationStatus cancellation={{ ...base }} paymentMethod="credit_card" />);
  expect(container.textContent).not.toMatch(/1 dia útil/);
  expect(screen.getByText('Aparece na fatura do cartão')).toBeInTheDocument();
});

it('M3: atalho de suporte não diz que o pedido já vai anexado', () => {
  render(<CancellationStatus cancellation={{ ...base, refundStatus: 'processed' }} onSupport={() => {}} />);
  expect(screen.queryByText(/já anexado/)).toBeNull();
  expect(screen.getByText('Escolha o pedido e fale com a gente')).toBeInTheDocument();
});
