// frontend/__tests__/motoboy.ganhos.direto.test.tsx
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DirectEarnings } from '../components/motoboy/ganhos/DirectEarnings';
import api from '../lib/api';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/ganhos', asPath: '/motoboy/ganhos' }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
// Releitura por reconexão (useSocket().onReconnect): o teste guarda o callback para disparar.
const mockReconnect: { cb: (() => void) | null } = { cb: null };
const mockSocket = {
  on: () => () => undefined,
  onReconnect: (cb: () => void) => { mockReconnect.cb = cb; return () => { if (mockReconnect.cb === cb) mockReconnect.cb = null; }; },
  isConnected: true,
};
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));

const NOW = new Date('2026-10-14T15:00:00-03:00');
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const TRANSFERS = [
  { id: 't1', orderId: 'ord0004821', amount: 12, status: 'failed', createdAt: '2026-10-14T14:32:00-03:00' },
  { id: 't2', orderId: 'ord0004819', amount: 7.1, status: 'done', createdAt: '2026-10-14T13:58:00-03:00', doneAt: '2026-10-14T13:58:05-03:00' },
  { id: 't3', orderId: 'ord0004815', amount: 6.6, status: 'done', createdAt: '2026-10-14T13:10:00-03:00' },
  { id: 't4', orderId: 'ord0004800', amount: 10, status: 'done', createdAt: '2026-10-12T10:00:00-03:00' },
  { id: 't5', orderId: 'ord0004700', amount: 5, status: 'done', createdAt: '2026-10-05T10:00:00-03:00' },
];
const CFG = {
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00', motoboyMinimumWithdraw: '50.00',
  customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00', transferBlockHours: 24,
};
const FAIL = { __fail: true };

function mockApi(over: Record<string, any> = {}) {
  const routes: Record<string, any> = {
    '/motoboy/transfers': { data: { success: true, data: TRANSFERS, nextCursor: null } },
    '/onboarding/status': { data: { hasPixKey: true, pixKey: '***.412.***-07' } },
    '/settings/platform-config': { data: CFG },
    '/payouts/my': { data: { payouts: [] } },
    // K35: "Esta semana" só do servidor. O resumo soma o Pix de toda entrega da semana (o atrasado
    // também), então difere de propósito da soma dos Pix que caíram (R$ 23,70 · 3).
    '/deliveries/summary': { data: { today: { earnings: 25.7, count: 3 }, week: { earnings: 35.7, count: 4 } } },
    ...over,
  };
  get.mockImplementation((u: string) => {
    const v = routes[u];
    if (v === FAIL || v === undefined) return Promise.reject({ response: { status: 500, data: { error: 'x' } } });
    return Promise.resolve(v);
  });
}
const calls = (u: string) => get.mock.calls.filter(([x]) => x === u).length;

beforeEach(() => { jest.clearAllMocks(); mockReconnect.cb = null; mockApi(); });

test('Recebido hoje só com Pix que caíram; semana do servidor (K35); A caminho com os atrasados', async () => {
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  const hoje = await screen.findByRole('region', { name: 'Recebido hoje' });
  expect(within(hoje).getByText('R$ 13,70')).toBeInTheDocument();
  await waitFor(() => expect(within(hoje).getByText('2 entregas · direto na sua chave ***.412.***-07')).toBeInTheDocument());
  const kpis = screen.getByRole('region', { name: 'Resumo dos repasses' });
  await waitFor(() => expect(within(kpis).getByText('R$ 35,70')).toBeInTheDocument());
  expect(within(kpis).getByText('4 entregas')).toBeInTheDocument();
  expect(within(kpis).queryByText('R$ 23,70')).not.toBeInTheDocument(); // nunca a soma do cliente
  expect(within(kpis).getByText('R$ 12,00')).toBeInTheDocument();
  expect(within(kpis).getByText('1 Pix atrasado')).toBeInTheDocument();
});

test('K35: resumo da semana com erro → erro com Tentar de novo que relê, nunca a soma do cliente', async () => {
  mockApi({ '/deliveries/summary': FAIL });
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  const kpis = await screen.findByRole('region', { name: 'Resumo dos repasses' });
  expect(await within(kpis).findByText(/Não carregamos o resumo da semana/)).toBeInTheDocument();
  expect(within(kpis).queryByText('R$ 23,70')).not.toBeInTheDocument();
  expect(within(kpis).getByText('R$ 12,00')).toBeInTheDocument(); // A caminho segue (lista inteira)
  mockApi();
  fireEvent.click(within(kpis).getByRole('button', { name: 'Tentar de novo' }));
  expect(await within(screen.getByRole('region', { name: 'Resumo dos repasses' })).findByText('R$ 35,70')).toBeInTheDocument();
});

test('Pix atrasado: aviso e sheet só informativa, sem nenhuma chamada de envio', async () => {
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('R$ 12,00 da loja');
  expect(within(dialog).getByText('A loja vai tentar de novo.')).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /tentar|reenviar/i })).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Falar com o suporte' }));
  expect(mockPush).toHaveBeenCalledWith('/suporte');
});

test('a linha atrasada também abre a sheet; a linha que caiu não é botão', async () => {
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  const row = await screen.findByRole('button', { name: /Entrega #004821/ });
  expect(within(row).getByText('Atrasado')).toBeInTheDocument(); // rótulo de transferView (K30)
  fireEvent.click(row);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Entrega #004821');
  expect(screen.queryByRole('button', { name: /Entrega #004819/ })).not.toBeInTheDocument();
  expect(screen.getByText('Entrega #004819')).toBeInTheDocument();
});

test('janela incompleta (há mais páginas e tudo é de hoje): sem Recebido hoje nem A caminho; semana do servidor; lista continua', async () => {
  mockApi({ '/motoboy/transfers': { data: { success: true, data: TRANSFERS.slice(0, 3), nextCursor: 'c1' } } });
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  expect(await screen.findByText('Entrega #004819')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Recebido hoje' })).not.toBeInTheDocument();
  const kpis = screen.getByRole('region', { name: 'Resumo dos repasses' });
  expect(await within(kpis).findByText('R$ 35,70')).toBeInTheDocument();
  expect(within(kpis).queryByText('A caminho')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument();
});

test('erro ao ler os repasses: erro com Tentar de novo, nunca o vazio', async () => {
  mockApi({ '/motoboy/transfers': FAIL });
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  expect(await screen.findByText('Não carregamos seus repasses')).toBeInTheDocument();
  expect(screen.queryByText('Nenhum Pix ainda')).not.toBeInTheDocument();
  mockApi();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Entrega #004819')).toBeInTheDocument();
});

test('Carregar mais: resposta velha (lista relida no meio) não entra na lista nova', async () => {
  let resolveMore: (v: any) => void = () => undefined;
  const firstPage = { data: { success: true, data: TRANSFERS.slice(0, 3), nextCursor: 'c1' } };
  const base = get.getMockImplementation() as (u: string, cfg?: any) => Promise<any>;
  get.mockImplementation((u: string, cfg?: any) => {
    if (u === '/motoboy/transfers' && cfg?.params?.cursor === 'c1') return new Promise((r) => { resolveMore = r; });
    if (u === '/motoboy/transfers') return Promise.resolve(firstPage);
    return base(u, cfg);
  });
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  await waitFor(() => expect(get).toHaveBeenCalledWith('/motoboy/transfers', { params: { cursor: 'c1' } }));
  const before = calls('/motoboy/transfers');
  act(() => { mockReconnect.cb?.(); }); // reconexão: relê a lista (nova geração)
  await waitFor(() => expect(calls('/motoboy/transfers')).toBe(before + 1));
  await screen.findByText('Entrega #004819');
  await act(async () => { resolveMore({ data: { success: true, data: [TRANSFERS[3]], nextCursor: null } }); });
  expect(screen.queryByText('Entrega #004800')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeInTheDocument();
});

test('Carregar mais junta a página seguinte sem repetir', async () => {
  get.mockImplementation((u: string, cfg?: any) => {
    if (u === '/motoboy/transfers' && cfg?.params?.cursor === 'c1') {
      return Promise.resolve({ data: { success: true, data: [TRANSFERS[2], TRANSFERS[3]], nextCursor: null } });
    }
    if (u === '/motoboy/transfers') return Promise.resolve({ data: { success: true, data: TRANSFERS.slice(0, 3), nextCursor: 'c1' } });
    if (u === '/onboarding/status') return Promise.resolve({ data: { hasPixKey: true, pixKey: '***.412.***-07' } });
    if (u === '/settings/platform-config') return Promise.resolve({ data: CFG });
    if (u === '/deliveries/summary') return Promise.resolve({ data: { week: { earnings: 35.7, count: 4 } } });
    return Promise.reject(new Error('x'));
  });
  render(<DirectEarnings hasLeftover={false} now={NOW} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  expect(await screen.findByText('Entrega #004800')).toBeInTheDocument();
  expect(screen.getAllByText('Entrega #004815')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  expect(await screen.findByRole('region', { name: 'Recebido hoje' })).toBeInTheDocument(); // agora a janela está inteira
});

test('garantia de modo: sem saldo antigo, nada da custódia', async () => {
  const { container } = render(<DirectEarnings hasLeftover={false} now={NOW} />);
  await screen.findByText('Entrega #004819');
  expect(container.textContent).not.toMatch(/Sacar no Pix|Disponível para saque|modo anterior/);
  expect(get.mock.calls.some(([u]) => ['/wallets', '/payouts', '/withdrawals'].some((p) => String(u).startsWith(p)))).toBe(false);
});

test('saldo do modo anterior: card, sheet com o mínimo e saque por /withdrawals/request', async () => {
  mockApi({ '/payouts/my': { data: { payouts: [
    { _id: 'a', amount: 30, status: 'released' }, { _id: 'b', amount: 22.5, status: 'released' }, { _id: 'c', amount: 5, status: 'pending' },
  ] } } });
  post.mockResolvedValue({ data: { withdrawal: { amount: 52.5 } } });
  render(<DirectEarnings hasLeftover now={NOW} />);
  expect(await screen.findByText('Saldo do modo anterior — saque para sua chave Pix')).toBeInTheDocument();
  expect(screen.getByText('R$ 52,50')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Sacar para minha chave Pix'));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByText('Saque mínimo de R$ 50,00')).toBeInTheDocument());
  expect(calls('/payouts/my')).toBe(1);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sacar R$ 52,50' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/request', { amount: 'all' }));
  expect(post.mock.calls.some(([u]) => String(u).includes('transfer-to-owner'))).toBe(false);
  // K27: o Alert "Pix atrasado" também é role=status; a confirmação é achada pelo texto.
  expect(await screen.findByText('Saque de R$ 52,50 a caminho da sua chave Pix.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(calls('/payouts/my')).toBe(2)); // relê o saldo depois do saque
});

test('saque do saldo antigo com erro: sheet aberta com o erro, sem confirmação', async () => {
  mockApi({ '/payouts/my': { data: { payouts: [{ _id: 'a', amount: 60, status: 'released' }] } } });
  post.mockRejectedValue({ response: { status: 400, data: { error: 'O saque mínimo é R$ 80,00', code: 'BELOW_MINIMUM_WITHDRAW', minimum: 80 } } });
  render(<DirectEarnings hasLeftover now={NOW} />);
  fireEvent.click(await screen.findByText('Sacar para minha chave Pix'));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Sacar R$ 60,00' })).toBeEnabled());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sacar R$ 60,00' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('O saque mínimo é R$ 80,00');
  expect(within(dialog).getByText('Saque mínimo de R$ 80,00')).toBeInTheDocument();
  expect(screen.queryByText(/a caminho da sua chave Pix\./)).not.toBeInTheDocument();
  expect(calls('/payouts/my')).toBe(1);
});

test('saldo antigo abaixo do mínimo: fica para a equipe resolver, sem envio', async () => {
  mockApi({ '/payouts/my': { data: { payouts: [{ _id: 'a', amount: 8, status: 'released' }] } } });
  render(<DirectEarnings hasLeftover now={NOW} />);
  fireEvent.click(await screen.findByText('Sacar para minha chave Pix'));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByText('Saldo abaixo do mínimo')).toBeInTheDocument());
  expect(within(dialog).getByText(/fale com o suporte/)).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Sacar R$ 8,00' })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});

test('saldo antigo aparece mesmo com a lista de Pix em erro', async () => {
  mockApi({ '/motoboy/transfers': FAIL, '/payouts/my': { data: { payouts: [{ _id: 'a', amount: 60, status: 'released' }] } } });
  render(<DirectEarnings hasLeftover now={NOW} />);
  expect(await screen.findByText('Saldo do modo anterior — saque para sua chave Pix')).toBeInTheDocument();
  expect(await screen.findByText('Não carregamos seus repasses')).toBeInTheDocument();
});

test('K29: saldo antigo com erro → erro com Tentar de novo que relê; nunca some calado nem vira R$ 0,00', async () => {
  mockApi({ '/payouts/my': FAIL });
  render(<DirectEarnings hasLeftover now={NOW} />);
  const box = await screen.findByRole('region', { name: 'Saldo do modo anterior' });
  expect(within(box).getByText('Não carregamos o saldo do modo anterior')).toBeInTheDocument();
  expect(within(box).queryByText('R$ 0,00')).not.toBeInTheDocument();
  expect(screen.queryByText('Sacar para minha chave Pix')).not.toBeInTheDocument();
  expect(screen.queryByText(/Sacar no Pix|Disponível para saque/)).not.toBeInTheDocument(); // nunca presume custódia
  await screen.findByText('Entrega #004819'); // o resto da tela segue
  mockApi({ '/payouts/my': { data: { payouts: [{ _id: 'a', amount: 60, status: 'released' }] } } });
  fireEvent.click(within(box).getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Saldo do modo anterior — saque para sua chave Pix')).toBeInTheDocument();
  expect(screen.queryByText('Não carregamos o saldo do modo anterior')).not.toBeInTheDocument();
  expect(calls('/payouts/my')).toBe(2);
});
