// frontend/__tests__/motoboy.ganhos.custodia.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CustodyEarnings } from '../components/motoboy/ganhos/CustodyEarnings';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/ganhos', asPath: '/motoboy/ganhos' }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
// useMotoboyMoney (Task 37): socket, modo e saldo antigo vêm de hooks; aqui a custódia, sem sobra.
const mockSocket = { on: () => () => undefined, onReconnect: () => () => undefined, isConnected: true };
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
const mockSaas = { settlementMode: 'custodia', directCardEnabled: false, loading: false, error: false };
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
const mockLeftover = { hasLeftover: false, loading: false };
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));

const NOW = new Date('2026-10-14T15:00:00-03:00'); // quarta
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const FAIL = { __fail: true };
const PAYOUTS = [
  { _id: 'p1', deliveryId: 'd1', orderId: 'ord0004821', amount: 9.6, status: 'pending', blocked: false, createdAt: '2026-10-14T14:32:00-03:00' },
  { _id: 'p3', deliveryId: 'd3', orderId: 'ord0004790', amount: 12, status: 'pending', blocked: true, blockReason: 'pedido #4790 com reclamação', createdAt: '2026-10-13T19:44:00-03:00' },
  { _id: 'p2', deliveryId: 'd2', orderId: 'ord0004772', amount: 7.04, status: 'released', blocked: false, createdAt: '2026-10-12T10:00:00-03:00' },
  { _id: 'p5', deliveryId: 'd5', orderId: 'ord0004700', amount: 20, status: 'paid', blocked: false, createdAt: '2026-10-05T10:00:00-03:00' },
];
const CFG = {
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00', motoboyMinimumWithdraw: '50.00',
  customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00', transferBlockHours: 24, autoApprovePayouts: false, autoApproveWithdrawals: false,
};

function mockApi(over: Record<string, any> = {}) {
  const routes: Record<string, any> = {
    '/wallets/motoboy/m1': { data: { balance: 0, availableBalance: 318.4 } },
    '/payouts/my': { data: { payouts: PAYOUTS, total: PAYOUTS.length } },
    '/payouts/my/summary': { data: { pending: 47.2, available: 318.4, requested: 0, paid: 20 } },
    '/withdrawals/my-withdrawals': { data: [] },
    '/onboarding/status': { data: { hasPixKey: true, pixKey: '***.412.***-07' } },
    '/invoices/my': { data: { invoices: [{ id: 'i1', invoiceNumber: 'NFS-1', orderId: 'ord0004821', motoboyAmount: '9.60', issuedAt: '2026-10-14T14:33:00-03:00' }] } },
    '/settings/platform-config': { data: CFG },
    // K35: "Esta semana" só do servidor (week.earnings), nunca somado no cliente.
    '/deliveries/summary': { data: { today: { earnings: 9.6, count: 1 }, week: { earnings: 28.64, count: 3 } } },
    ...over,
  };
  get.mockImplementation((u: string) => {
    const v = routes[u];
    if (v === FAIL || v === undefined) return Promise.reject({ response: { status: 500, data: { error: 'x' } } });
    return Promise.resolve(v);
  });
}
const renderIt = (seg: any = 'corridas', onSeg = jest.fn()) => render(<CustodyEarnings motoboyId="m1" seg={seg} onSeg={onSeg} now={NOW} />);
const calls = (u: string) => get.mock.calls.filter(([x]) => x === u).length;

beforeEach(() => { jest.clearAllMocks(); mockApi(); });

test('saldo, "Sacar no Pix" e a linha do mínimo e da chave', async () => {
  renderIt();
  const hero = await screen.findByRole('region', { name: 'Disponível para saque' });
  expect(within(hero).getByText('R$ 318,40')).toBeInTheDocument();
  await waitFor(() => expect(within(hero).getByText('Saque mínimo de R$ 50,00 · cai na chave ***.412.***-07')).toBeInTheDocument());
  expect(within(hero).getByRole('button', { name: 'Sacar no Pix' })).toBeEnabled();
});

test('a liberar (do servidor) e bloqueado (com o motivo)', async () => {
  renderIt();
  expect(await screen.findByText('R$ 47,20 a liberar')).toBeInTheDocument();
  expect(screen.getByText('R$ 12,00 bloqueado')).toBeInTheDocument();
  expect(screen.getByText('Em análise: pedido #4790 com reclamação')).toBeInTheDocument();
});

test('semana: barras com a lista inteira; janela incompleta → total do servidor, sem barras', async () => {
  const { unmount } = renderIt();
  const week = await screen.findByRole('region', { name: 'Esta semana' });
  expect(within(week).getByText('R$ 28,64')).toBeInTheDocument();
  expect(within(week).getByText('3 corridas · melhor dia: terça')).toBeInTheDocument();
  unmount();
  mockApi({ '/payouts/my': { data: { payouts: PAYOUTS.slice(0, 3), total: 400 } } }); // a última carregada ainda é desta semana
  renderIt();
  await screen.findByText('R$ 47,20 a liberar');
  // K35: o total é do servidor e continua; as barras (do cliente) só com a janela inteira.
  const week2 = await screen.findByRole('region', { name: 'Esta semana' });
  expect(within(week2).getByText('R$ 28,64')).toBeInTheDocument();
  expect(within(week2).getByText('3 corridas')).toBeInTheDocument();
  expect(within(week2).queryByText(/melhor dia/)).not.toBeInTheDocument();
  expect(within(week2).queryByText('ter')).not.toBeInTheDocument();
  expect(screen.queryByText(/bloqueado$/)).not.toBeInTheDocument(); // bloqueado também só com a lista inteira
});

test('K35: "Esta semana" vem de /deliveries/summary, não da soma dos repasses', async () => {
  mockApi({ '/deliveries/summary': { data: { today: { earnings: 0, count: 0 }, week: { earnings: 31.5, count: 4 } } } });
  renderIt();
  const week = await screen.findByRole('region', { name: 'Esta semana' });
  expect(within(week).getByText('R$ 31,50')).toBeInTheDocument();
  expect(within(week).getByText('4 corridas · melhor dia: terça')).toBeInTheDocument();
  expect(within(week).queryByText('R$ 28,64')).not.toBeInTheDocument();
});

test('K35: resumo da semana com erro → erro com Tentar de novo, nunca a soma do cliente', async () => {
  mockApi({ '/deliveries/summary': FAIL });
  renderIt();
  const week = await screen.findByRole('region', { name: 'Esta semana' });
  expect(within(week).getByText(/Não carregamos o resumo da semana/)).toBeInTheDocument();
  expect(within(week).queryByText('R$ 28,64')).not.toBeInTheDocument();
  mockApi();
  fireEvent.click(within(week).getByRole('button', { name: 'Tentar de novo' }));
  expect(await within(await screen.findByRole('region', { name: 'Esta semana' })).findByText('R$ 28,64')).toBeInTheDocument();
});

test('saca: abre a sheet e envia /withdrawals/request; recarrega depois', async () => {
  post.mockResolvedValue({ data: { withdrawal: { amount: 318.4 } } });
  renderIt();
  const hero = await screen.findByRole('region', { name: 'Disponível para saque' });
  await waitFor(() => expect(within(hero).getByRole('button', { name: 'Sacar no Pix' })).toBeEnabled());
  await screen.findByRole('button', { name: /Entrega #004821/ });
  const payoutsBefore = calls('/payouts/my');
  fireEvent.click(within(hero).getByRole('button', { name: 'Sacar no Pix' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Não entra neste saque')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sacar R$ 318,40' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/request', { amount: 'all' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Saque de R$ 318,40 pedido. O valor vai para a sua chave Pix.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(calls('/wallets/motoboy/m1')).toBe(2);
  // o dinheiro por corrida (useMotoboyMoney) também relê depois do saque
  await waitFor(() => expect(calls('/payouts/my')).toBeGreaterThanOrEqual(payoutsBefore + 2));
});

test('400 BELOW_MINIMUM_WITHDRAW: o mínimo do servidor passa a valer', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'O saque mínimo é R$ 400,00', code: 'BELOW_MINIMUM_WITHDRAW', minimum: 400 } } });
  renderIt();
  const hero = await screen.findByRole('region', { name: 'Disponível para saque' });
  await waitFor(() => expect(within(hero).getByRole('button', { name: 'Sacar no Pix' })).toBeEnabled());
  fireEvent.click(within(hero).getByRole('button', { name: 'Sacar no Pix' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sacar R$ 318,40' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('O saque mínimo é R$ 400,00');
  expect(within(dialog).getByRole('button', { name: 'Sacar R$ 318,40' })).toBeDisabled();
});

test('servidor pede a chave Pix: aviso com o caminho', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Você ainda não cadastrou uma chave PIX', code: 'PIX_KEY_MISSING', action: '/dados-recebimento' } } });
  renderIt();
  const hero = await screen.findByRole('region', { name: 'Disponível para saque' });
  await waitFor(() => expect(within(hero).getByRole('button', { name: 'Sacar no Pix' })).toBeEnabled());
  fireEvent.click(within(hero).getByRole('button', { name: 'Sacar no Pix' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sacar R$ 318,40' }));
  expect(await screen.findByText('Falta configurar o recebimento')).toBeInTheDocument();
});

test('saque em conferência (uncertain): aviso e botão desligado', async () => {
  mockApi({ '/withdrawals/my-withdrawals': { data: [{ _id: 'w1', amount: 100, status: 'approved', uncertainAt: '2026-10-14T10:00:00-03:00', requestedAt: '2026-10-14T09:00:00-03:00' }] } });
  renderIt();
  expect(await screen.findByText('Saque em conferência')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar no Pix' })).toBeDisabled();
});

test('não conferiu os saques: não deixa sacar (fail closed)', async () => {
  mockApi({ '/withdrawals/my-withdrawals': FAIL });
  renderIt();
  expect(await screen.findByText('Não conferimos seus saques agora.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar no Pix' })).toBeDisabled();
});

test('abaixo do mínimo: botão desligado com quanto falta', async () => {
  mockApi({ '/wallets/motoboy/m1': { data: { balance: 0, availableBalance: 30 } } });
  renderIt();
  expect(await screen.findByText('Faltam R$ 20,00 para o saque mínimo de R$ 50,00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar no Pix' })).toBeDisabled();
});

test('abaixo do mínimo: tentar sacar não envia (0 POST)', async () => {
  mockApi({ '/wallets/motoboy/m1': { data: { balance: 0, availableBalance: 30 } } });
  renderIt();
  await screen.findByText('Faltam R$ 20,00 para o saque mínimo de R$ 50,00');
  const hero = screen.getByRole('region', { name: 'Disponível para saque' });
  fireEvent.click(within(hero).getByRole('button', { name: 'Sacar no Pix' }));
  const dialog = screen.queryByRole('dialog');
  if (dialog) {
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tudo' }));
    const send = within(dialog).queryByRole('button', { name: /^Sacar R\$/ });
    if (send) fireEvent.click(send);
  }
  await new Promise((r) => setTimeout(r, 50));
  expect(post).not.toHaveBeenCalled();
});

test('sem chave Pix: aviso com cadastro e botão desligado', async () => {
  mockApi({ '/onboarding/status': { data: { hasPixKey: false, pixKey: null } } });
  renderIt();
  expect(await screen.findByText('Cadastre sua chave Pix para sacar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sacar no Pix' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar chave' }));
  expect(mockPush).toHaveBeenCalledWith('/dados-recebimento');
});

test('carteira com erro: erro com Tentar de novo, nunca R$ 0,00', async () => {
  mockApi({ '/wallets/motoboy/m1': FAIL });
  renderIt();
  expect(await screen.findByText('Não carregamos seus ganhos')).toBeInTheDocument();
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sacar no Pix' })).not.toBeInTheDocument();
});

test('Corridas: badge do repasse e o detalhe da entrega', async () => {
  renderIt('corridas');
  const row = await screen.findByRole('button', { name: /Entrega #004821/ });
  expect(within(row).getByText('A liberar')).toBeInTheDocument();
  fireEvent.click(row);
  expect(mockPush).toHaveBeenCalledWith('/motoboy/entregas/d1');
});

test('Corridas: repasse dividido por saque é uma corrida só, somada', async () => {
  mockApi({ '/payouts/my': { data: { payouts: [
    { _id: 'p9', deliveryId: 'd9', orderId: 'ord0004900', amount: 3, status: 'requested', blocked: false, createdAt: '2026-10-14T12:00:00-03:00' },
    { _id: 'p8', deliveryId: 'd9', orderId: 'ord0004900', amount: 7, status: 'requested', blocked: false, createdAt: '2026-10-10T12:00:00-03:00' },
  ], total: 2 } } });
  renderIt('corridas');
  const rows = await screen.findAllByRole('button', { name: /Entrega #004900/ });
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText('R$ 10,00')).toBeInTheDocument();
  expect(within(rows[0]).getByText('Saque pedido')).toBeInTheDocument();
});

test('K29: repasses com erro → erro com Tentar de novo que relê; nunca o vazio', async () => {
  mockApi({ '/payouts/my': FAIL });
  renderIt('corridas');
  const panel = await screen.findByRole('tabpanel');
  expect(await within(panel).findByText(/Não carregamos suas corridas/)).toBeInTheDocument();
  expect(screen.queryByText(/Suas corridas aparecem aqui/)).not.toBeInTheDocument();
  const before = calls('/payouts/my');
  mockApi();
  fireEvent.click(within(panel).getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('button', { name: /Entrega #004821/ })).toBeInTheDocument();
  expect(calls('/payouts/my')).toBeGreaterThan(before);
  expect(screen.queryByText(/Não carregamos suas corridas/)).not.toBeInTheDocument();
});

test('Saques: status e o motivo da recusa', async () => {
  mockApi({ '/withdrawals/my-withdrawals': { data: [{ _id: 'w2', amount: 50, status: 'rejected', rejectionReason: 'Chave inválida', requestedAt: '2026-10-13T10:00:00-03:00' }] } });
  renderIt('saques');
  expect(await screen.findByText('Saque Pix')).toBeInTheDocument();
  expect(screen.getByText('Recusado')).toBeInTheDocument();
  expect(screen.getByText('Motivo: Chave inválida')).toBeInTheDocument();
});

test('Notas fiscais: contagem na aba e abre a nota', async () => {
  const onSeg = jest.fn();
  renderIt('notas', onSeg);
  const tab = await screen.findByRole('tab', { name: /^Notas fiscais/ });
  await waitFor(() => expect(tab).toHaveTextContent('1'));
  fireEvent.click(await screen.findByRole('button', { name: /NFS-e NFS-1/ }));
  expect(mockPush).toHaveBeenCalledWith('/invoice/i1');
  fireEvent.click(screen.getByRole('tab', { name: /^Saques/ }));
  expect(onSeg).toHaveBeenCalledWith('saques');
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'components', 'motoboy', 'ganhos', 'Ganhos.module.css'), 'utf8'))).toEqual([]);
});
