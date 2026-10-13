import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CustodyMoney } from '../CustodyMoney';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, asPath: '/seller/dinheiro', pathname: '/seller/dinheiro' }) }));
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

let summary: any;
let withdrawals: any[];
let onboarding: any;
beforeEach(() => {
  jest.clearAllMocks();
  // D10/C16: o backend sempre manda nextReleaseAt null (não há liberação por prazo).
  summary = { pending: 612.3, available: 1842.6, requested: 0, paid: 3100, nextReleaseAt: null };
  withdrawals = [{ _id: 'w1', amount: 1500, status: 'processed', requestedAt: '2026-10-06T12:00:00Z' }];
  onboarding = { hasPixKey: true, pixKey: '**.***.456/0001-**' };
  get.mockImplementation((url: string) => {
    if (url === '/wallets/store/s1/summary') return Promise.resolve({ data: summary });
    if (url === '/payouts/my?storeId=s1') return Promise.resolve({ data: { payouts: [{ _id: 'py1', orderId: 'ord000004812', amount: 63.15, status: 'released', createdAt: '2026-10-12T08:57:00Z', releasedAt: '2026-10-12T09:40:00Z' }, { _id: 'py2', orderId: 'ord000004806', amount: 189, status: 'pending', blocked: true, blockReason: 'Devolução #4806 em análise', createdAt: '2026-10-11T10:00:00Z' }] } });
    if (url === '/withdrawals/my-withdrawals?storeId=s1') return Promise.resolve({ data: withdrawals });
    if (url === '/settings/platform-config') return Promise.resolve({ data: { storeMinimumWithdraw: '10.00', transferBlockHours: 24 } });
    if (url === '/onboarding/status') return Promise.resolve({ data: onboarding });
    return Promise.reject(new Error('n/a'));
  });
});

test('saldo disponível, a receber liberado depois da entrega e para onde vai o dinheiro', async () => {
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  const hero = await screen.findByRole('region', { name: 'Disponível para sacar' });
  expect(within(hero).getByText('R$ 1.842,60')).toBeInTheDocument();
  expect(within(hero).getByText('+ R$ 612,30 a receber, liberado depois da entrega')).toBeInTheDocument();
  expect(screen.queryByText(/liberam/)).not.toBeInTheDocument();
  const flow = screen.getByRole('region', { name: 'Para onde vai o seu dinheiro' });
  expect(within(flow).getByText('A receber')).toBeInTheDocument();
  expect(within(flow).getByText('Liberado')).toBeInTheDocument();
  expect(within(flow).getByText('R$ 3.100,00')).toBeInTheDocument();
  expect(screen.getByText('R$ 189,00 bloqueados')).toBeInTheDocument();
});

test('mesmo se vier uma data em nextReleaseAt, a tela não mostra data de liberação', async () => {
  summary = { ...summary, nextReleaseAt: new Date(2026, 9, 16, 12).toISOString() };
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  const hero = await screen.findByRole('region', { name: 'Disponível para sacar' });
  expect(within(hero).getByText('+ R$ 612,30 a receber, liberado depois da entrega')).toBeInTheDocument();
  expect(screen.queryByText(/16\/10/)).not.toBeInTheDocument();
});

test('sacar tudo manda o payload de sempre e recarrega', async () => {
  post.mockResolvedValue({ data: { withdrawal: { amount: 1842.6 } } });
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar para meu Pix' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/request', { amount: 'all', storeId: 's1' }));
  expect(await screen.findByText('Saque de R$ 1.842,60 pedido. O valor vai para a sua chave Pix.')).toBeInTheDocument();
  expect(post.mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
  await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/wallets/store/s1/summary').length).toBe(2));
});

test('BELOW_MINIMUM_WITHDRAW do servidor aparece no sheet e o envio destrava', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'O saque mínimo é R$ 10,00', code: 'BELOW_MINIMUM_WITHDRAW', minimum: 10 } } });
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar para meu Pix' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('O saque mínimo é R$ 10,00');
  // submitting voltou a false: a trava de envio único do sheet solta e dá para tentar de novo
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
});

test('erro pedindo o recebimento leva para configurar', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Configure o recebimento da loja', code: 'ASAAS_NOT_READY', action: '/dados-recebimento' } } });
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sacar para meu Pix' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sacar R$ 1.842,60' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Configurar agora' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('saldo abaixo do mínimo do servidor: botão desligado com o mínimo escrito', async () => {
  summary = { ...summary, available: 8 };
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  expect(await screen.findByText('O saque mínimo é R$ 10,00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar para meu Pix' })).toBeDisabled();
});

test('saque em conferência (uncertain) bloqueia novo saque', async () => {
  withdrawals = [{ _id: 'w2', amount: 300, status: 'approved', uncertainAt: '2026-10-12T10:00:00Z', requestedAt: '2026-10-12T09:59:00Z' }];
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  expect(await screen.findByText('Saque em conferência')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar para meu Pix' })).toBeDisabled();
});

test('sem chave Pix: pede o cadastro', async () => {
  onboarding = { hasPixKey: false };
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  expect(await screen.findByText('Cadastre sua chave Pix para sacar')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar chave' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('extrato junta repasses e saques; o repasse abre o detalhe', async () => {
  const onOpen = jest.fn();
  render(<CustodyMoney storeId="s1" onOpenPayout={onOpen} />);
  expect(await screen.findByText('+R$ 63,15')).toBeInTheDocument();
  expect(screen.getByText('−R$ 1.500,00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Repasse do pedido #004812' }));
  expect(onOpen).toHaveBeenCalledWith('py1');
  fireEvent.click(screen.getByRole('button', { name: 'Saques' }));
  expect(screen.queryByText('+R$ 63,15')).not.toBeInTheDocument();
});

test('falha ao carregar o saldo: erro com tentar de novo', async () => {
  get.mockImplementation(() => Promise.reject(new Error('offline')));
  render(<CustodyMoney storeId="s1" onOpenPayout={jest.fn()} />);
  expect(await screen.findByText('Não carregamos o seu dinheiro')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'CustodyMoney.module.css'), 'utf8'))).toEqual([]);
});
