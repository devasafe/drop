import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PayoutDetail } from '../PayoutDetail';
import api from '../../../../lib/api';
import { SELLER_ROUTES } from '../../../../lib/sellerRoutes';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn() } }));
const get = api.get as jest.Mock;
const releasedAt = new Date(2026, 9, 12, 9, 40).toISOString();
let payouts: any[];
let invoice: any;
beforeEach(() => {
  jest.clearAllMocks();
  invoice = { _id: 'inv1', invoiceNumber: 'NF-1' };
  payouts = [{ _id: 'py1', orderId: 'ord000004812', amount: 63.15, status: 'released', createdAt: new Date(2026, 9, 12, 8, 57).toISOString(), releasedAt }];
  get.mockImplementation((url: string) => {
    if (url === '/payouts/my?storeId=s1') return Promise.resolve({ data: { payouts } });
    if (url === '/orders/ord000004812') return Promise.resolve({ data: { _id: 'ord000004812', customerName: 'Júlia Martins', paymentMethod: 'pix', paidAt: new Date(2026, 9, 12, 8, 31).toISOString(), deliveryFee: 9.4, totalValue: 83.7, products: [{ productName: 'A', quantity: 4, price: 18.575 }], delivery: { deliveredAt: new Date(2026, 9, 12, 8, 57).toISOString() } } });
    if (url === '/invoices/by-order/ord000004812') return Promise.resolve({ data: invoice });
    return Promise.reject(new Error('n/a'));
  });
});

test('mostra quanto a loja recebe, desde quando pode sacar e o caminho do dinheiro', async () => {
  const onBack = jest.fn();
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={onBack} />);
  expect(await screen.findByRole('heading', { name: 'Pedido #004812' })).toBeInTheDocument();
  expect(screen.getByText('Liberado')).toBeInTheDocument();
  const hero = screen.getByRole('region', { name: 'Você recebe' });
  expect(within(hero).getByText('R$ 63,15')).toBeInTheDocument();
  expect(within(hero).getByText('Disponível para sacar desde 12/10 09:40')).toBeInTheDocument();
  const path_ = await screen.findByRole('region', { name: 'Caminho do dinheiro' });
  expect(within(path_).getByText('Cliente pagou')).toBeInTheDocument();
  expect(within(path_).getByText('08:31')).toBeInTheDocument();
  expect(within(path_).getByText('Liberado pela DROP')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Nota do pedido/ })).toHaveAttribute('href', '/invoice/inv1');
  expect(screen.getByRole('link', { name: /Ver o pedido/ })).toHaveAttribute('href', SELLER_ROUTES.pedido('ord000004812'));
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Dinheiro' }));
  expect(onBack).toHaveBeenCalled();
});

test('usa os horários reais de retirada e entrega da nota', async () => {
  invoice = { _id: 'inv1', pickedAt: new Date(2026, 9, 12, 8, 45).toISOString(), deliveredAt: new Date(2026, 9, 12, 8, 59).toISOString() };
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={jest.fn()} />);
  const path_ = await screen.findByRole('region', { name: 'Caminho do dinheiro' });
  expect(await within(path_).findByText('08:45')).toBeInTheDocument();
  expect(within(path_).getByText('08:59')).toBeInTheDocument();
});

test('bloqueado e cancelado explicam o motivo', async () => {
  payouts = [{ _id: 'py1', orderId: 'ord000004812', amount: 63.15, status: 'cancelled', cancelReason: 'Devolução aprovada', blocked: true, blockReason: 'Devolução em análise', createdAt: '2026-10-12T08:57:00Z' }];
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={jest.fn()} />);
  expect(await screen.findByText('Cancelado: Devolução aprovada')).toBeInTheDocument();
});

test('repasse bloqueado mostra o motivo', async () => {
  payouts = [{ _id: 'py1', orderId: 'ord000004812', amount: 63.15, status: 'pending', blocked: true, blockReason: 'Devolução em análise', createdAt: '2026-10-12T08:57:00Z' }];
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={jest.fn()} />);
  expect(await screen.findByText(/Devolução em análise/)).toBeInTheDocument();
});

test('repasse que não existe', async () => {
  payouts = [];
  render(<PayoutDetail payoutId="zzz" storeId="s1" onBack={jest.fn()} />);
  expect(await screen.findByText('Repasse não encontrado')).toBeInTheDocument();
});

test('mostra só o valor do repasse do servidor, sem somar itens nem frete no cliente', async () => {
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={jest.fn()} />);
  await screen.findByRole('heading', { name: 'Pedido #004812' });
  await screen.findByRole('link', { name: /Nota do pedido/ });
  expect(screen.queryByText(/^Itens/)).toBeNull();
  expect(screen.queryByText(/Frete/)).toBeNull();
  expect(screen.queryByText('R$ 74,30')).toBeNull();
  expect(screen.getAllByText('R$ 63,15')).toHaveLength(1);
});

test('erro de rede não vira "não encontrado"', async () => {
  get.mockImplementation(() => Promise.reject(new Error('net')));
  render(<PayoutDetail payoutId="py1" storeId="s1" onBack={jest.fn()} />);
  expect(await screen.findByText('Não deu para carregar o repasse')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'PayoutDetail.module.css'), 'utf8'))).toEqual([]);
});
