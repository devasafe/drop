/**
 * D2 · P4.4 — /motoboy/entregas. Porta motoboy-deliveries.test.tsx ("Em trânsito" no
 * andamento e "Entregue" no histórico); o KPI "Ganhos" (fee × 0,8 na tela) saiu de propósito.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { EntregasScreen } from '../components/motoboy/entregas/EntregasScreen';
import MotoboyEntregasPage from '../pages/motoboy/entregas';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: mockQuery, pathname: '/motoboy/entregas', asPath: '/motoboy/entregas' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
// Assinaturas por callback (load e money.reload têm identidade estável).
const mockSubs = new Map<() => void, string[]>();
jest.mock('../hooks/useAutoRefetch', () => ({
  useAutoRefetch: (events: string | string[], cb: () => void) => {
    const list = typeof events === 'string' ? [events] : events;
    mockSubs.set(cb, list);
  },
}));
const fire = (event: string) => { [...mockSubs.entries()].filter(([, ev]) => ev.includes(event)).forEach(([cb]) => cb()); };
let mockReconnects: Array<() => void> = [];
const mockSocket = {
  on: () => () => undefined,
  onReconnect: (cb: () => void) => { mockReconnects.push(cb); return () => { mockReconnects = mockReconnects.filter((c) => c !== cb); }; },
  isConnected: true,
};
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockLeftover: any;
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

const NOW = new Date('2026-10-14T15:00:00-03:00');
const get = api.get as jest.Mock;

// createdAt (nascimento da entrega) vem bem antes do deliveredAt: a janela do dinheiro é pelo createdAt.
const HIST = [
  { _id: 'h1', orderId: 'ord0004821', status: 'delivered', distance: 4.6, rating: 5, createdAt: '2026-10-14T14:00:00-03:00', deliveredAt: '2026-10-14T14:32:00-03:00' },
  { _id: 'h2', orderId: 'ord0004815', status: 'delivered', distance: 2.1, createdAt: '2026-10-14T12:50:00-03:00', deliveredAt: '2026-10-14T13:10:00-03:00' },
  { _id: 'h3', orderId: 'ord0004836', status: 'cancelled', createdAt: '2026-10-14T12:20:00-03:00', cancelledAt: '2026-10-14T12:40:00-03:00' },
  { _id: 'h4', orderId: 'ord0004790', status: 'delivered', distance: 6, rating: 4, createdAt: '2026-10-13T19:20:00-03:00', deliveredAt: '2026-10-13T19:44:00-03:00' },
  { _id: 'h5', orderId: 'ord0004700', status: 'delivered', distance: 3, createdAt: '2026-09-30T09:00:00-03:00', deliveredAt: '2026-09-30T10:00:00-03:00' },
];
const PAYOUTS = [
  { _id: 'p1', deliveryId: 'h1', orderId: 'ord0004821', amount: 9.6, status: 'pending', blocked: false, createdAt: '2026-10-14T14:32:00-03:00' },
  { _id: 'p2', deliveryId: 'h2', orderId: 'ord0004815', amount: 5.68, status: 'released', blocked: false, createdAt: '2026-10-14T13:10:00-03:00' },
  { _id: 'p4', deliveryId: 'h4', orderId: 'ord0004790', amount: 12, status: 'pending', blocked: true, blockReason: 'reclamação', createdAt: '2026-10-13T19:44:00-03:00' },
];

type PayoutsFn = (page: number) => { payouts: any[]; total: number };
function mockApi({
  ongoing = [] as any[] | Error,
  history = HIST as any[] | Error | Promise<any>,
  payouts = PAYOUTS as any[] | PayoutsFn,
  transfers = [] as any[],
} = {}) {
  get.mockImplementation((u: string, cfg?: any) => {
    if (u === '/deliveries/ongoing') return ongoing instanceof Error ? Promise.reject(ongoing) : Promise.resolve({ data: { deliveries: ongoing } });
    if (u === '/deliveries/history') {
      if (history instanceof Promise) return history;
      return history instanceof Error ? Promise.reject(history) : Promise.resolve({ data: history });
    }
    if (u === '/payouts/my') {
      const page = Number(cfg?.params?.page ?? 1);
      return Promise.resolve({ data: typeof payouts === 'function' ? payouts(page) : { payouts, total: payouts.length } });
    }
    if (u === '/motoboy/transfers') return Promise.resolve({ data: { success: true, data: transfers, nextCursor: null } });
    return Promise.reject(new Error(`n/a ${u}`));
  });
}
const calls = (u: string) => get.mock.calls.filter(([x]) => x === u);

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = {};
  mockReconnects = [];
  mockSubs.clear();
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockLeftover = { hasLeftover: false, loading: false };
  mockApi();
});

test('sem ?seg= e sem corrida ativa: abre Concluídas com os KPIs do mês', async () => {
  render(<EntregasScreen now={NOW} />);
  const kpis = await screen.findByRole('region', { name: 'Resumo do mês' });
  expect(screen.getByRole('tab', { name: /^Concluídas/ })).toHaveAttribute('aria-selected', 'true');
  expect(within(kpis).getByText('Outubro')).toBeInTheDocument();
  expect(within(kpis).getByText('3')).toBeInTheDocument(); // entregues em outubro (h5 é de setembro)
  expect(within(kpis).getByText('4,5')).toBeInTheDocument(); // média das notas (5 e 4)
  expect(within(kpis).getByText('2 notas')).toBeInTheDocument();
  expect(within(kpis).getByText('1')).toBeInTheDocument(); // canceladas
  expect(within(kpis).getByText('25%')).toBeInTheDocument();
  expect(screen.getAllByText(/Entregue/).length).toBeGreaterThan(0); // portado de motoboy-deliveries
  expect(screen.queryByText('Ganhos')).not.toBeInTheDocument(); // fee × 0,8 na tela saiu
});

test('agrupa por dia; total do dia só quando todas as corridas têm valor', async () => {
  render(<EntregasScreen now={NOW} />);
  expect(await screen.findByText('Ontem · R$ 12,00')).toBeInTheDocument();
  expect(screen.getByText('Hoje')).toBeInTheDocument(); // a cancelada de hoje não tem valor → sem total
  expect(screen.getByText('30/09')).toBeInTheDocument();
});

test('valor e badge vêm do repasse; sem repasse, sem valor', async () => {
  render(<EntregasScreen now={NOW} />);
  const r1 = await screen.findByRole('button', { name: /#004821/ });
  await waitFor(() => expect(within(r1).getByText('A liberar')).toBeInTheDocument());
  expect(within(r1).getByText('R$ 9,60')).toBeInTheDocument();
  expect(within(screen.getByRole('button', { name: /#004815/ })).getByText('Liberado')).toBeInTheDocument();
  expect(within(screen.getByRole('button', { name: /#004790/ })).getByText('Bloqueado')).toBeInTheDocument();
  const cancelada = screen.getByRole('button', { name: /#004836/ });
  expect(within(cancelada).queryByText(/R\$/)).not.toBeInTheDocument();
  fireEvent.click(r1);
  expect(mockPush).toHaveBeenCalledWith('/motoboy/entregas/h1');
});

test('filtro Canceladas usa filterHistory', async () => {
  render(<EntregasScreen now={NOW} />);
  await screen.findByRole('button', { name: /#004821/ });
  fireEvent.click(screen.getByRole('button', { name: 'Canceladas' }));
  expect(screen.getByRole('button', { name: /#004836/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /#004821/ })).not.toBeInTheDocument();
});

test('Em andamento: a corrida ativa abre a tela da corrida (portado: "Em trânsito")', async () => {
  mockApi({ ongoing: [{ _id: 'o1', orderId: 'ord000ABCDEF', status: 'picked', distance: 2 }] });
  render(<EntregasScreen now={NOW} />);
  expect(await screen.findByText(/Em trânsito/)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^Em andamento/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: /#ABCDEF/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/corrida/o1');
});

test('?seg=concluidas manda mesmo com corrida ativa; trocar de segmento vai pela URL', async () => {
  mockQuery = { seg: 'concluidas' };
  mockApi({ ongoing: [{ _id: 'o1', orderId: 'ord000ABCDEF', status: 'picked' }] });
  render(<EntregasScreen now={NOW} />);
  await screen.findByRole('region', { name: 'Resumo do mês' });
  fireEvent.click(screen.getByRole('tab', { name: /^Em andamento/ }));
  expect(mockReplace).toHaveBeenCalledWith('/motoboy/entregas?seg=andamento', undefined, { shallow: true });
});

test('direto: badge do Pix por pedido e nenhuma leitura da custódia sem saldo antigo', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockApi({ transfers: [{ id: 't1', orderId: 'ord0004821', amount: 12, status: 'done', createdAt: '2026-10-14T14:32:00-03:00' }] });
  render(<EntregasScreen now={NOW} />);
  const r1 = await screen.findByRole('button', { name: /#004821/ });
  await waitFor(() => expect(within(r1).getByText('Na conta')).toBeInTheDocument());
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/payouts'))).toBe(false);
});

test('modo com erro: a lista aparece, sem nenhum valor, com aviso e Tentar de novo', async () => {
  mockSaas = { ...mockSaas, error: true };
  render(<EntregasScreen now={NOW} />);
  expect(await screen.findByText('Não carregamos os valores das corridas')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /#004821/ })).toBeInTheDocument();
  expect(screen.queryByText('R$ 9,60')).not.toBeInTheDocument();
  expect(screen.queryByText(/A liberar|Liberado|Bloqueado|Na conta/)).not.toBeInTheDocument();
  expect(get.mock.calls.some(([u]) => String(u).startsWith('/payouts'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockSaas.retry).toHaveBeenCalled();
});

test('dinheiro só é lido depois que a lista carrega, com a janela pelo MENOR createdAt (não deliveredAt)', async () => {
  let resolveHist: (v: any) => void = () => undefined;
  const hist = new Promise((r) => { resolveHist = r; });
  // Página 1 termina num repasse entre o menor createdAt (09:00 de 30/09) e o menor deliveredAt (10:00):
  // janela pelo createdAt → ainda não cobriu, lê a página 2; pelo deliveredAt pararia na 1.
  const page1 = [...PAYOUTS, { _id: 'px', deliveryId: 'zz', amount: 1, status: 'released', createdAt: '2026-09-30T09:30:00-03:00' }];
  const page2 = [{ _id: 'py', deliveryId: 'yy', amount: 1, status: 'released', createdAt: '2026-09-29T08:00:00-03:00' }];
  mockApi({ history: hist, payouts: (n) => ({ payouts: n === 1 ? page1 : page2, total: 600 }) });
  render(<EntregasScreen now={NOW} />);
  await act(async () => { await Promise.resolve(); });
  expect(calls('/payouts/my')).toHaveLength(0); // sem lista, nenhuma leitura completa à toa
  await act(async () => { resolveHist({ data: HIST }); });
  const r1 = await screen.findByRole('button', { name: /#004821/ });
  await waitFor(() => expect(within(r1).getByText('A liberar')).toBeInTheDocument());
  expect(calls('/payouts/my')).toHaveLength(2);
  expect(calls('/payouts/my')[1][1]).toEqual({ params: { limit: 200, page: 2 } });
});

test('corrida fora da cobertura (teto de páginas): sem badge, nunca valor parcial', async () => {
  // A lista nunca acaba e cada página é mais recente que todas as corridas: bate o teto sem cobrir.
  mockApi({
    payouts: (n) => ({
      payouts: n === 1 ? PAYOUTS.map((p) => ({ ...p, createdAt: '2026-10-14T14:50:00-03:00' })) : [{ _id: `f${n}`, deliveryId: `z${n}`, amount: 1, status: 'released', createdAt: '2026-10-14T14:45:00-03:00' }],
      total: 99999,
    }),
  });
  render(<EntregasScreen now={NOW} />);
  await screen.findByRole('button', { name: /#004821/ });
  await waitFor(() => expect(calls('/payouts/my')).toHaveLength(10));
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/A liberar|Liberado|Bloqueado/)).not.toBeInTheDocument();
  expect(screen.getByText('Ontem')).toBeInTheDocument(); // sem total do dia
});

test('reconexão relê as duas listas uma vez (sem laço de GET)', async () => {
  render(<EntregasScreen now={NOW} />);
  await screen.findByRole('button', { name: /#004821/ });
  await waitFor(() => expect(calls('/payouts/my')).toHaveLength(1));
  expect(calls('/deliveries/ongoing')).toHaveLength(1);
  expect(calls('/deliveries/history')).toHaveLength(1);
  await act(async () => { mockReconnects.forEach((cb) => cb()); });
  await waitFor(() => expect(calls('/deliveries/history')).toHaveLength(2));
  expect(calls('/deliveries/ongoing')).toHaveLength(2);
  await waitFor(() => expect(calls('/payouts/my')).toHaveLength(2));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(calls('/deliveries/history')).toHaveLength(2);
  expect(calls('/payouts/my')).toHaveLength(2);
});

test.each(['delivery:rejected', 'delivery:assigned_to_me', 'delivery:assigned_to_you', 'delivery:updated', 'delivery:picked'])(
  '%s (sala user:) relê as listas e não relê o dinheiro',
  async (event) => {
    render(<EntregasScreen now={NOW} />);
    await screen.findByRole('button', { name: /#004821/ });
    await waitFor(() => expect(calls('/payouts/my')).toHaveLength(1));
    await act(async () => { fire(event); });
    await waitFor(() => expect(calls('/deliveries/ongoing')).toHaveLength(2));
    expect(calls('/deliveries/history')).toHaveLength(2);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(calls('/payouts/my')).toHaveLength(1);
  },
);

test.each(['delivery:completed', 'delivery:cancelled', 'delivery:return_confirmed'])(
  '%s (mexe no dinheiro) relê as listas e o dinheiro',
  async (event) => {
    render(<EntregasScreen now={NOW} />);
    await screen.findByRole('button', { name: /#004821/ });
    await waitFor(() => expect(calls('/payouts/my')).toHaveLength(1));
    await act(async () => { fire(event); });
    await waitFor(() => expect(calls('/deliveries/history')).toHaveLength(2));
    await waitFor(() => expect(calls('/payouts/my')).toHaveLength(2));
  },
);

test('releitura com erro e lista já na tela: aviso leve com Tentar de novo, sem apagar a lista', async () => {
  render(<EntregasScreen now={NOW} />);
  await screen.findByRole('button', { name: /#004821/ });
  mockApi({ ongoing: new Error('rede'), history: new Error('rede') });
  await act(async () => { mockReconnects.forEach((cb) => cb()); });
  expect(await screen.findByText('Não deu para atualizar agora')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /#004821/ })).toBeInTheDocument();
  expect(screen.queryByText('Não carregamos suas entregas')).not.toBeInTheDocument();
  mockApi();
  const before = calls('/deliveries/history').length;
  fireEvent.click(screen.getAllByRole('button', { name: 'Tentar de novo' })[0]);
  await waitFor(() => expect(calls('/deliveries/history').length).toBe(before + 1));
  await waitFor(() => expect(screen.queryByText('Não deu para atualizar agora')).not.toBeInTheDocument());
});

test('fuso de SP: entregue às 23:00 de 30/09 (02:00 UTC de 01/10) fica fora de outubro e no grupo 30/09', async () => {
  const late = { _id: 'h6', orderId: 'ord0004699', status: 'delivered', distance: 1, createdAt: '2026-10-01T01:30:00Z', deliveredAt: '2026-10-01T02:00:00Z' };
  mockApi({ history: [...HIST.slice(0, 4), late, HIST[4]] });
  render(<EntregasScreen now={NOW} />);
  const kpis = await screen.findByRole('region', { name: 'Resumo do mês' });
  expect(within(kpis).getByText('3')).toBeInTheDocument(); // continua 3 entregues em outubro
  expect(within(kpis).getByText('25%')).toBeInTheDocument(); // e 1 de 4 canceladas
  const set30 = screen.getByRole('region', { name: '30/09' });
  expect(within(set30).getByRole('button', { name: /#004699/ })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '01/10' })).not.toBeInTheDocument();
});

test('as duas listas com erro: erro com Tentar de novo, nunca "vazio"', async () => {
  mockApi({ ongoing: new Error('rede'), history: new Error('rede') });
  render(<EntregasScreen now={NOW} />);
  expect(await screen.findByText('Não carregamos suas entregas')).toBeInTheDocument();
  expect(screen.queryByText('Sua primeira corrida aparece aqui')).not.toBeInTheDocument();
  const before = get.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before));
});

test('sem nenhuma corrida: estado vazio que leva a Corridas', async () => {
  mockApi({ history: [] });
  render(<EntregasScreen now={NOW} />);
  expect(await screen.findByText('Sua primeira corrida aparece aqui')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ficar online' }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy');
});

test('página: casca "Suas entregas"', async () => {
  render(<MotoboyEntregasPage />);
  expect(screen.getByRole('heading', { name: 'Suas entregas' })).toBeInTheDocument();
  await screen.findByRole('tab', { name: /^Concluídas/ });
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'motoboy', 'entregas', 'Entregas.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
