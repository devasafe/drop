import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StuckPixSheet } from '../StuckPixSheet';
import { withdrawalView, isUncertainWithdrawal, PAYOUT_LABEL } from '../moneyLabels';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, post: jest.fn() } }));
const post = api.post as jest.Mock;
const createdAt = new Date(2026, 9, 12, 14, 32).toISOString();
// firstFailedAt é de propósito diferente de createdAt: o prazo conta da criação.
const firstFailedAt = new Date(2026, 9, 12, 16, 50).toISOString();
const t = (over: any = {}) => ({ id: 't1', orderId: 'ord000004821', motoboyName: 'Carlos Lima', status: 'failed', amount: 12, lastError: 'saldo insuficiente', pixKeyMasked: '***.412.***-07', attempts: 2, nextAttemptAt: new Date(2026, 9, 12, 15, 10).toISOString(), createdAt, firstFailedAt, ...over });
const props = { storeId: 's1', blockHours: 24, onClose: jest.fn(), onRetried: jest.fn() };

beforeEach(() => jest.clearAllMocks());

test('explica o motivo, a entrega, a chave, as tentativas e o prazo (a partir de createdAt)', () => {
  render(<StuckPixSheet transfer={t()} {...props} />);
  expect(screen.getByText('O Pix para Carlos não saiu')).toBeInTheDocument();
  expect(screen.getByText('A loja não tem saldo no Asaas para esta transferência')).toBeInTheDocument();
  expect(screen.getByText('#004821')).toBeInTheDocument();
  expect(screen.getByText('R$ 12,00')).toBeInTheDocument();
  expect(screen.getByText('***.412.***-07')).toBeInTheDocument();
  expect(screen.getByText('2 · próxima às 15:10')).toBeInTheDocument();
  expect(screen.getByText('Prazo: 13/10 14:32')).toBeInTheDocument();
});

test('"Tentar agora" chama o retry da loja uma única vez e não diz "enviado"', async () => {
  post.mockResolvedValue({ data: { success: true, data: { transfer: { ...t(), status: 'requested' } } } });
  const onRetried = jest.fn();
  render(<StuckPixSheet transfer={t()} {...props} onRetried={onRetried} />);
  const btn = screen.getByRole('button', { name: 'Tentar agora' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/stores/s1/transfers/t1/retry'));
  expect(await screen.findByText('Pedimos uma nova tentativa. Acompanhe na lista.')).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/enviado/i)).not.toBeInTheDocument();
  expect(onRetried).toHaveBeenCalledWith(expect.objectContaining({ status: 'requested' }));
});

test('429 RETRY_TOO_SOON mostra a mensagem do servidor e não tenta de novo sozinho', async () => {
  post.mockRejectedValue({ response: { status: 429, data: { success: false, error: { message: 'Aguarde 5 minutos entre uma tentativa e outra', code: 'RETRY_TOO_SOON' } } } });
  render(<StuckPixSheet transfer={t()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
  expect(await screen.findByText('Aguarde 5 minutos entre uma tentativa e outra')).toBeInTheDocument();
  expect(post).toHaveBeenCalledTimes(1);
});

test('429 sem mensagem usa o texto padrão', async () => {
  post.mockRejectedValue({ response: { status: 429, data: {} } });
  render(<StuckPixSheet transfer={t()} {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
  expect(await screen.findByText('Você tentou há pouco. Espere 5 minutos para tentar de novo.')).toBeInTheDocument();
});

test('failed_final: está com o admin, sem "Tentar agora"', () => {
  render(<StuckPixSheet transfer={t({ status: 'failed_final' })} {...props} />);
  expect(screen.getByText('A DROP está conferindo. Você não precisa fazer nada.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Tentar agora' })).not.toBeInTheDocument();
  expect(screen.queryByText(/^Prazo:/)).not.toBeInTheDocument();
});

test('uncertain: em conferência pelo admin, nunca sugere tentar de novo', () => {
  render(<StuckPixSheet transfer={t({ status: 'uncertain', lastError: 'UNCERTAIN_RESPONSE' })} {...props} />);
  expect(screen.getByText('Em conferência pelo admin')).toBeInTheDocument();
  expect(screen.getByText('O Pix pode ter saído. A DROP confere no Asaas. Não tente de novo.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Tentar agora' })).not.toBeInTheDocument();
  expect(screen.queryByText(/^Prazo:/)).not.toBeInTheDocument();
});

test('motoboy sem chave: sem prazo e sem "Tentar agora"', () => {
  render(<StuckPixSheet transfer={t({ lastError: 'MOTOBOY_PIX_KEY_MISSING' })} {...props} />);
  expect(screen.getByText('Carlos ainda não cadastrou a chave Pix. Avisamos ele.')).toBeInTheDocument();
  expect(screen.queryByText(/^Prazo:/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Tentar agora' })).not.toBeInTheDocument();
});

test('rótulos de dinheiro', () => {
  expect(PAYOUT_LABEL.released).toBe('Liberado');
  expect(withdrawalView({ status: 'processed' }).label).toBe('Pago');
  expect(withdrawalView({ status: 'approved', uncertainAt: '2026-10-12T10:00:00Z' }).label).toBe('Em conferência');
  expect(isUncertainWithdrawal({ status: 'approved', uncertainAt: '2026-10-12T10:00:00Z' })).toBe(true);
  expect(isUncertainWithdrawal({ status: 'processed', uncertainAt: '2026-10-12T10:00:00Z' })).toBe(false);
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'StuckPixSheet.module.css'), 'utf8'))).toEqual([]);
});
