import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

let mockQuery: any = {};
const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), query: mockQuery, asPath: '/seller/dinheiro', pathname: '/seller/dinheiro' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => ({ store: { _id: 's1' }, orders: [], refresh: jest.fn(), newOrderCount: 0 }) }));
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockLeftover: any;
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

import SellerDinheiroPage from '../pages/seller/dinheiro';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const CUSTODY_URLS = ['/wallets/store/', '/withdrawals/my-withdrawals', '/payouts/my'];

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = {};
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false };
  mockLeftover = { hasLeftover: false, loading: false };
  get.mockImplementation((url: string) => {
    if (url === '/wallets/store/s1/summary') return Promise.resolve({ data: { pending: 0, available: 50, requested: 0, paid: 0, nextReleaseAt: null } });
    if (url.startsWith('/payouts/my')) return Promise.resolve({ data: { payouts: [{ _id: 'py1', orderId: 'ord000000001', amount: 30, status: 'released', createdAt: '2026-10-12T10:00:00Z' }] } });
    if (url.startsWith('/withdrawals/my-withdrawals')) return Promise.resolve({ data: [] });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { storeMinimumWithdraw: '10.00', transferBlockHours: 24 } });
    if (url === '/onboarding/status') return Promise.resolve({ data: { hasPixKey: true, pixKey: '***' } });
    if (url.startsWith('/stores/s1/direct-summary')) return Promise.resolve({ data: { success: true, data: { ordersPaid: { count: 3, total: 300 }, motoboyPix: { sentCount: 0, sentTotal: 0, stuckCount: 0 }, refunds: { count: 0, total: 0 } } } });
    if (url === '/stores/s1/transfers') return Promise.resolve({ data: { success: true, data: [], nextCursor: null } });
    return Promise.reject(new Error('n/a'));
  });
});

test('custódia: saldo disponível e saque', async () => {
  render(<SellerDinheiroPage />);
  expect(await screen.findByRole('region', { name: 'Disponível para sacar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar para meu Pix' })).toBeInTheDocument();
  expect(screen.queryByText('Saldo do modo anterior — saque para sua chave Pix')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Assinatura/ })).not.toBeInTheDocument();
});

test('garantia de modo: no direto nunca aparece "Liberado" nem "Sacar" da custódia, nem a API da custódia', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  const { container } = render(<SellerDinheiroPage />);
  expect(await screen.findByRole('region', { name: 'Recebido em vendas' })).toBeInTheDocument();
  await screen.findByText('Pagamentos a motoboys');
  expect(container.textContent).not.toMatch(/Liberado|Sacar para meu Pix|Disponível para sacar|Financeiro/);
  expect(get.mock.calls.some(([u]) => CUSTODY_URLS.some((c) => String(u).startsWith(c)))).toBe(false);
});

test('direto: link para Assinatura e recebimentos (celular não tem "Mais")', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  render(<SellerDinheiroPage />);
  await screen.findByRole('region', { name: 'Recebido em vendas' });
  expect(screen.getByRole('link', { name: /Assinatura/ })).toHaveAttribute('href', '/seller/assinatura');
});

test('garantia de modo: direto com saldo antigo mostra só o card do modo anterior, ainda sem "Liberado"/"Sacar para meu Pix"', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  mockLeftover = { hasLeftover: true, loading: false };
  post.mockResolvedValue({ data: { withdrawal: { amount: 30 } } });
  const { container } = render(<SellerDinheiroPage />);
  expect(await screen.findByText('Saldo do modo anterior — saque para sua chave Pix')).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Liberado|Sacar para meu Pix|Disponível para sacar/);
  fireEvent.click(screen.getByText('Sacar para minha chave Pix'));
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar R$ 30,00' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/request', expect.objectContaining({ storeId: 's1' })));
  expect(post.mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
});

test('enquanto o modo carrega, nenhuma das duas telas aparece', () => {
  mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: true };
  const { container } = render(<SellerDinheiroPage />);
  expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Disponível para sacar|Recebido em vendas|Liberado|Sacar/);
  expect(get).not.toHaveBeenCalled();
});

test('direto esperando o saldo antigo também espera', () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  mockLeftover = { hasLeftover: false, loading: true };
  render(<SellerDinheiroPage />);
  expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  expect(get).not.toHaveBeenCalled();
});

test('custódia com ?repasse= abre o extrato do repasse; o extrato navega por query', async () => {
  render(<SellerDinheiroPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Repasse do pedido #000001' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/dinheiro?repasse=py1');
});

test('?repasse= mostra o detalhe', async () => {
  mockQuery = { repasse: 'py1' };
  render(<SellerDinheiroPage />);
  expect(await screen.findByRole('heading', { name: 'Pedido #000001' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Dinheiro' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/dinheiro');
});

test('?repasse= no modo direto não abre o extrato nem chama a custódia', async () => {
  mockSaas = { settlementMode: 'direto', directCardEnabled: false, loading: false };
  mockQuery = { repasse: 'p1' };
  const { container } = render(<SellerDinheiroPage />);
  await screen.findByRole('region', { name: 'Recebido em vendas' });
  expect(screen.queryByRole('button', { name: 'Voltar para Dinheiro' })).not.toBeInTheDocument();
  expect(container.textContent).not.toMatch(/Extrato do repasse/);
  expect(get.mock.calls.some(([u]) => CUSTODY_URLS.some((c) => String(u).startsWith(c)))).toBe(false);
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'DinheiroPagina.module.css'), 'utf8'))).toEqual([]);
});
