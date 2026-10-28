import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StoreStatement } from '../StoreStatement';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const statement = (over: any = {}) => ({
  balance: 11.26,
  reserved: { motoboys: 5.23, refunds: 0, total: 5.23 },
  available: 6.03,
  withdrawTo: '***.***.***-25',
  hasMore: false,
  days: 30,
  items: [
    { id: 'f3', date: '2026-10-28', label: 'Frete ao motoboy · Pedido #ABC123', orderId: 'o1', value: -5.23, balance: 11.26 },
    { id: 'f2', date: '2026-10-28', label: 'Taxa do Pix da venda · Pedido #ABC123', orderId: 'o1', value: -1.99, balance: 16.49 },
    { id: 'f1', date: '2026-10-27', label: 'Venda · Pedido #ABC123', orderId: 'o1', value: 18.48, balance: 18.48 },
  ],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: statement() } });
});

test('saldo, quanto pode sacar, o que fica guardado e o extrato por dia, sem falar em Asaas', async () => {
  const { container } = render(<StoreStatement storeId="s1" minimum={1} />);
  expect(await screen.findByText('R$ 11,26')).toBeInTheDocument();
  expect(screen.getByText('Disponível para sacar: R$ 6,03')).toBeInTheDocument();
  expect(screen.getByText('R$ 5,23 ficam guardados para fretes de motoboy que ainda vão sair.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Venda · Pedido #ABC123' })).toHaveAttribute('href', '/seller/pedido/o1');
  expect(screen.getByText('+ R$ 18,48')).toBeInTheDocument();
  expect(screen.getByText('− R$ 1,99')).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  expect(container.textContent).not.toMatch(/Asaas/);
  expect(get).toHaveBeenCalledWith('/stores/s1/asaas/extrato?days=30');
});

test('o valor guardado diz para o que é', async () => {
  get.mockResolvedValue({ data: { success: true, data: statement({ reserved: { motoboys: 5, refunds: 3, withdrawals: 2, total: 10 } }) } });
  render(<StoreStatement storeId="s1" minimum={1} />);
  expect(await screen.findByText('R$ 10,00 ficam guardados para fretes de motoboy, estornos a clientes e um saque a caminho que ainda vão sair.')).toBeInTheDocument();
});

test('troca de período busca de novo', async () => {
  render(<StoreStatement storeId="s1" minimum={1} />);
  await screen.findByText('R$ 11,26');
  fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/stores/s1/asaas/extrato?days=7'));
});

test('saque pede a senha e vai para a chave do dono', async () => {
  post.mockResolvedValue({ data: { success: true, data: { withdrawal: { id: 'w1' }, uncertain: false } } });
  render(<StoreStatement storeId="s1" minimum={1} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar para meu Pix' }));
  expect(screen.getByText('Para a chave ***.***.***-25')).toBeInTheDocument();
  const confirm = screen.getByRole('button', { name: 'Sacar R$ 6,03' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Sua senha da DROP'), { target: { value: 'Senha123!' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/stores/s1/asaas/saque', { amount: 6.03, password: 'Senha123!' }));
  expect(await screen.findByText('Saque de R$ 6,03 a caminho do seu Pix.')).toBeInTheDocument();
});

test('erro do saque aparece no sheet', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: { code: 'WRONG_PASSWORD', message: 'Senha incorreta.' } } } });
  render(<StoreStatement storeId="s1" minimum={1} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar para meu Pix' }));
  fireEvent.change(screen.getByLabelText('Sua senha da DROP'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 6,03' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta.');
});

test('sem disponível ou sem documento, o saque fica desligado', async () => {
  get.mockResolvedValue({ data: { success: true, data: statement({ available: 0 }) } });
  const { unmount } = render(<StoreStatement storeId="s1" minimum={1} />);
  expect(await screen.findByRole('button', { name: 'Sacar para meu Pix' })).toBeDisabled();
  unmount();
  get.mockResolvedValue({ data: { success: true, data: statement({ withdrawTo: null }) } });
  render(<StoreStatement storeId="s1" minimum={1} />);
  expect(await screen.findByText('Não achamos o CPF ou CNPJ da sua conta de recebimento para o saque.')).toBeInTheDocument();
});

test('chave sem permissão de extrato: explica e deixa tentar de novo', async () => {
  get.mockRejectedValue({ response: { status: 403, data: { error: { message: 'insufficient_permission: sem permissão' } } } });
  render(<StoreStatement storeId="s1" minimum={1} />);
  expect(await screen.findByText(/Libere a permissão de Extrato/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'StoreStatement.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
