import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DirectMoney } from '../DirectMoney';
import api from '../../../../lib/api';
import { currentMonth } from '../../../../lib/sellerApi';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

let payouts: any[];
beforeEach(() => {
  jest.clearAllMocks();
  payouts = [{ _id: 'p1', amount: 20, status: 'released' }, { _id: 'p2', amount: 10, status: 'released' }, { _id: 'p3', amount: 5, status: 'requested' }];
  get.mockImplementation((url: string) => {
    if (url === `/stores/s1/direct-summary?month=${currentMonth()}`) {
      return Promise.resolve({ data: { success: true, data: { month: currentMonth(), ordersPaid: { count: 92, total: 8412.6 }, motoboyPix: { sentCount: 68, sentTotal: 612.4, stuckCount: 1 }, refunds: { count: 1, total: 189.9 } } } });
    }
    if (url === '/settings/platform-config') return Promise.resolve({ data: { transferBlockHours: 24, storeMinimumWithdraw: '10.00' } });
    if (url === '/stores/s1/transfers') return Promise.resolve({ data: { success: true, data: [{ id: 't1', orderId: 'ord000004821', motoboyName: 'Carlos', status: 'failed', amount: 12, lastError: 'saldo insuficiente', pixKeyMasked: '***', attempts: 2, nextAttemptAt: null, firstFailedAt: '2026-10-12T14:32:00Z' }], nextCursor: null } });
    if (url === '/payouts/my?storeId=s1') return Promise.resolve({ data: { payouts } });
    return Promise.reject(new Error('n/a'));
  });
});

test('resumo do mês vindo do servidor, sem saque nem "Liberado"', async () => {
  const { container } = render(<DirectMoney storeId="s1" hasLeftover={false} />);
  expect(await screen.findByText('R$ 8.412,60')).toBeInTheDocument();
  expect(screen.getByText('92 pedidos pagos · caem direto na sua conta')).toBeInTheDocument();
  expect(screen.getByText('R$ 612,40')).toBeInTheDocument();
  expect(screen.getByText('68 entregas')).toBeInTheDocument();
  expect(screen.getByText('R$ 189,90')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Abrir conta de recebimento/ })).toHaveAttribute('target', '_blank');
  expect(container.textContent).not.toMatch(/Liberado|Sacar para meu Pix|Disponível para sacar/);
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/payouts/my'))).toBe(false);
});

test('Pix parado: alerta e sheet com "Tentar agora"', async () => {
  render(<DirectMoney storeId="s1" hasLeftover={false} />);
  expect(await screen.findByText('Pix ao motoboy parado')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver o que fazer' }));
  expect(screen.getByText('O Pix para Carlos não saiu')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar agora' })).toBeInTheDocument();
});

test('saldo do modo anterior: soma os liberados e saca por /withdrawals/request com storeId', async () => {
  post.mockResolvedValue({ data: { withdrawal: { amount: 30 } } });
  render(<DirectMoney storeId="s1" hasLeftover />);
  expect(await screen.findByText('Saldo do modo anterior — saque para sua chave Pix')).toBeInTheDocument();
  expect(screen.getByText(/R\$ 30,00/, { selector: 'strong' })).toBeInTheDocument();
  fireEvent.click(screen.getByText('Sacar para minha chave Pix'));
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar R$ 30,00' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/request', { amount: 'all', storeId: 's1' }));
  expect(post.mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
});

test('erro no resumo não esconde os Pix aos motoboys', async () => {
  get.mockImplementation((url: string) => {
    if (url.startsWith('/stores/s1/direct-summary')) return Promise.reject(new Error('x'));
    if (url === '/stores/s1/transfers') return Promise.resolve({ data: { success: true, data: [], nextCursor: null } });
    return Promise.reject(new Error('n/a'));
  });
  render(<DirectMoney storeId="s1" hasLeftover={false} />);
  expect(await screen.findByText('Não carregamos o resumo do mês')).toBeInTheDocument();
  expect(await screen.findByText('Pagamentos a motoboys')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'DirectMoney.module.css'), 'utf8'))).toEqual([]);
});
