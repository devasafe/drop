/**
 * D3b-1 · P3.4 — Pedido · visão do admin (spec 3.3): topo com situação, loja, cliente, total, modo e o aviso de
 * PIN oculto; linha do tempo com horário, "+N min" e "—" na etapa sem horário, ações do admin e cancelado em
 * vermelho com motivo, autor e culpa; itens; dinheiro do pedido (custódia e SaaS); pessoas sem CPF nem e-mail;
 * estorno pendente no topo; erro com "Tentar de novo"; releitura quando o evento traz este pedido.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminPedidoPage from '../pages/admin/pedidos/[id]';

let mockQuery: Record<string, string> = { id: 'o1' };
jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: mockQuery, isReady: true, pathname: '/admin/pedidos/[id]', asPath: '/admin/pedidos/o1' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
const mockHandlers: Record<string, (payload?: unknown) => void> = {};
const mockOn = (event: string, handler: (payload?: unknown) => void) => {
  mockHandlers[event] = handler;
  return () => { delete mockHandlers[event]; };
};
const mockOnReconnect = () => () => undefined;
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: mockOn, onReconnect: mockOnReconnect, isConnected: true, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;

const DETAIL = {
  id: 'o1', shortId: 'a1b2c3', status: 'aguardando_motoboy', deliveryStatus: 'assigned', settlementMode: 'custody',
  store: { id: 's1', name: 'Sabor da Vila' },
  customer: { id: 'c1', name: 'Ana Souza', ordersCount: 12, cancellations30d: 1 },
  motoboy: { id: 'm1', name: 'Carlos Lima', vehicle: 'Honda CG', plate: 'ABC1D23', rating: 4.8 },
  timeline: [
    { key: 'created', at: '2026-10-20T13:00:00.000Z', sincePrevMin: null },
    { key: 'paid', at: '2026-10-20T13:02:00.000Z', sincePrevMin: 2 },
    { key: 'accepted', at: null, sincePrevMin: null },
    { key: 'assigned', at: '2026-10-20T13:10:00.000Z', sincePrevMin: 8 },
    { key: 'picked', at: null, sincePrevMin: null },
    { key: 'delivered', at: null, sincePrevMin: null },
  ],
  adminActions: [],
  items: [
    { name: 'X-Burguer', quantity: 2, unitPrice: 25, total: 50 },
    { name: 'Refri lata', quantity: 1, unitPrice: 6, total: 6 },
  ],
  money: {
    subtotal: 56, deliveryFee: 8.9, couponDiscount: 5, walletApplied: 0, paidByCustomer: 59.9,
    storeShare: 49.28, motoboyShare: 8.9, platformShare: 6.72,
    payouts: [
      { id: 'p1', recipientType: 'store', amount: 49.28, status: 'pending' },
      { id: 'p2', recipientType: 'motoboy', amount: 8.9, status: 'released' },
    ],
    motoboyTransfer: null,
  },
  cancellation: null,
  refundPending: false,
  allowedActions: [],
};
const CANCELADO = {
  ...DETAIL,
  status: 'cancelado', deliveryStatus: 'cancelled',
  timeline: [
    { key: 'created', at: '2026-10-20T13:00:00.000Z', sincePrevMin: null },
    { key: 'paid', at: '2026-10-20T13:02:00.000Z', sincePrevMin: 2 },
    { key: 'accepted', at: '2026-10-20T13:05:00.000Z', sincePrevMin: 3 },
    { key: 'assigned', at: '2026-10-20T13:10:00.000Z', sincePrevMin: 5 },
    { key: 'cancelled', at: '2026-10-20T13:20:00.000Z', sincePrevMin: 10 },
  ],
  adminActions: [
    { id: 'a1', action: 'reassign', actorName: 'Marina Rocha', reason: 'Motoboy parado há 25 min', faultParty: null, at: '2026-10-20T13:15:00.000Z' },
    { id: 'a2', action: 'cancel', actorName: 'Marina Rocha', reason: 'Loja fechou sem avisar', faultParty: 'store', at: '2026-10-20T13:20:01.000Z' },
  ],
  cancellation: {
    cancelledBy: 'admin', faultParty: 'store', reason: 'Loja fechou sem avisar', adminName: 'Marina Rocha',
    at: '2026-10-20T13:20:00.000Z', refundStatus: 'pending',
  },
  refundPending: true,
};

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const fail = (status: number, data: Record<string, unknown>): Reply => () => Promise.reject({ response: { status, data } });
let routes: Record<string, Reply>;
const calls = (url: string) => get.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { id: 'o1' };
  Object.keys(mockHandlers).forEach((k) => { delete mockHandlers[k]; });
  routes = { '/admin/orders/o1': ok(DETAIL) };
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});
afterEach(() => jest.useRealTimers());

const regiao = (nome: string) => screen.findByRole('region', { name: nome });
const fact = (region: HTMLElement, label: string) => within(region).getByText(label).parentElement as HTMLElement;
const etapas = (region: HTMLElement) => within(region).getAllByRole('listitem');

describe('topo', () => {
  it('situação, loja, cliente, total, modo e o aviso de PIN oculto', async () => {
    render(<AdminPedidoPage />);
    const resumo = await regiao('Resumo do pedido');
    expect(screen.getByRole('heading', { level: 1, name: 'Pedido #a1b2c3' })).toBeInTheDocument();
    expect(within(resumo).getByText('Motoboy indo à loja')).toBeInTheDocument();
    expect(fact(resumo, 'Loja')).toHaveTextContent('Sabor da Vila');
    expect(fact(resumo, 'Cliente')).toHaveTextContent('Ana Souza');
    expect(fact(resumo, 'Total')).toHaveTextContent('R$ 59,90');
    expect(fact(resumo, 'Modo')).toHaveTextContent('Custódia');
    expect(within(resumo).getByText('PIN de retirada e de entrega ocultos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Pedidos ao vivo' })).toHaveAttribute('href', '/admin/pedidos');
    expect(get).toHaveBeenCalledWith('/admin/orders/o1');
  });

  it('nunca mostra PIN, CPF nem e-mail, mesmo se viessem no corpo', async () => {
    routes['/admin/orders/o1'] = ok({
      ...DETAIL, pickupPin: '4821', deliveryPin: '9307',
      customer: { ...DETAIL.customer, email: 'ana@exemplo.com', cpf: '123.456.789-09' },
    });
    render(<AdminPedidoPage />);
    await regiao('Resumo do pedido');
    expect(document.body).not.toHaveTextContent('4821');
    expect(document.body).not.toHaveTextContent('9307');
    expect(document.body).not.toHaveTextContent('ana@exemplo.com');
    expect(document.body).not.toHaveTextContent('123.456.789-09');
  });

  it('sem estorno pendente: sem o aviso', async () => {
    render(<AdminPedidoPage />);
    await regiao('Resumo do pedido');
    expect(screen.queryByText('Estorno pendente')).toBeNull();
  });
});

describe('linha do tempo', () => {
  it('horário de São Paulo, "+N min" e "—" na etapa sem horário', async () => {
    render(<AdminPedidoPage />);
    const linha = await regiao('Linha do tempo');
    const items = etapas(linha);
    expect(items.map((li) => li.getAttribute('data-step'))).toEqual(['created', 'paid', 'accepted', 'assigned', 'picked', 'delivered']);
    expect(items[1]).toHaveTextContent('Pago');
    expect(items[1]).toHaveTextContent('10:02');
    expect(items[1]).toHaveTextContent('+2 min desde a etapa anterior');
    expect(items[1]).toHaveClass('stepDone');
    expect(items[2]).toHaveTextContent('Loja aceitou');
    expect(items[2]).toHaveTextContent('—');
    expect(items[2]).not.toHaveTextContent('desde a etapa anterior');
    expect(items[2]).not.toHaveClass('stepDone');
    expect(items[3]).toHaveTextContent('+8 min desde a etapa anterior');
    expect(items[5]).toHaveTextContent('Entregue');
    expect(items[5]).toHaveTextContent('—');
  });

  it('cancelado: ações do admin na hora delas e o fim em vermelho com motivo, autor e culpa', async () => {
    routes['/admin/orders/o1'] = ok(CANCELADO);
    render(<AdminPedidoPage />);
    const linha = await regiao('Linha do tempo');
    const items = etapas(linha);
    expect(items.map((li) => li.getAttribute('data-step')))
      .toEqual(['created', 'paid', 'accepted', 'assigned', 'acao-reassign', 'cancelled', 'acao-cancel']);
    expect(items[4]).toHaveTextContent('Motoboy reatribuído');
    expect(items[4]).toHaveTextContent('10:15');
    expect(items[4]).toHaveTextContent('por Marina Rocha · Motoboy parado há 25 min');
    expect(items[5]).toHaveClass('stepCancelled');
    expect(items[5]).toHaveTextContent('Cancelado');
    expect(items[5]).toHaveTextContent('10:20');
    expect(items[5]).toHaveTextContent('Motivo: Loja fechou sem avisar · por Marina Rocha · culpa: Loja');
    expect(items[6]).toHaveTextContent('Cancelado pelo admin');
    expect(items[6]).toHaveTextContent('por Marina Rocha · Loja fechou sem avisar · culpa: Loja');
  });

  it('estorno pendente: aviso no topo com link para Estornos', async () => {
    routes['/admin/orders/o1'] = ok(CANCELADO);
    render(<AdminPedidoPage />);
    await regiao('Linha do tempo');
    expect(screen.getByText('Estorno pendente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver em Estornos' })).toHaveAttribute('href', '/admin/estornos');
  });
});

describe('itens, dinheiro e pessoas', () => {
  it('itens com quantidade e total', async () => {
    render(<AdminPedidoPage />);
    const itens = await regiao('Itens');
    const linhas = within(itens).getAllByRole('listitem');
    expect(linhas[0]).toHaveTextContent('2× X-Burguer');
    expect(linhas[0]).toHaveTextContent('R$ 50,00');
    expect(linhas[1]).toHaveTextContent('1× Refri lata');
  });

  it('custódia: valores, partes e o status dos repasses', async () => {
    render(<AdminPedidoPage />);
    const dinheiro = await regiao('Dinheiro do pedido');
    expect(fact(dinheiro, 'Subtotal')).toHaveTextContent('R$ 56,00');
    expect(fact(dinheiro, 'Entrega')).toHaveTextContent('R$ 8,90');
    expect(fact(dinheiro, 'Cupom')).toHaveTextContent('−R$ 5,00');
    expect(within(dinheiro).queryByText('Carteira')).toBeNull();
    expect(fact(dinheiro, 'Pago pelo cliente')).toHaveTextContent('R$ 59,90');
    expect(fact(dinheiro, 'Loja')).toHaveTextContent('R$ 49,28');
    expect(fact(dinheiro, 'Motoboy')).toHaveTextContent('R$ 8,90');
    expect(fact(dinheiro, 'DROP')).toHaveTextContent('R$ 6,72');
    const repasses = within(within(dinheiro).getByRole('list', { name: 'Repasses' })).getAllByRole('listitem');
    expect(repasses[0]).toHaveTextContent('Repasse · Loja');
    expect(repasses[0]).toHaveTextContent('R$ 49,28 · Aguardando liberação');
    expect(repasses[1]).toHaveTextContent('Repasse · Motoboy');
    expect(repasses[1]).toHaveTextContent('R$ 8,90 · Liberado');
  });

  it('SaaS: o Pix ao motoboy no lugar dos repasses; parte sem cálculo mostra "—"', async () => {
    routes['/admin/orders/o1'] = ok({
      ...DETAIL, settlementMode: 'direct',
      money: { ...DETAIL.money, walletApplied: 3, platformShare: null, payouts: [], motoboyTransfer: { status: 'done', amount: 8.9 } },
    });
    render(<AdminPedidoPage />);
    const dinheiro = await regiao('Dinheiro do pedido');
    expect(fact(dinheiro, 'Carteira')).toHaveTextContent('−R$ 3,00');
    expect(fact(dinheiro, 'DROP')).toHaveTextContent('—');
    expect(fact(dinheiro, 'Pix ao motoboy')).toHaveTextContent('R$ 8,90 · Pago');
    expect(within(dinheiro).queryByRole('list', { name: 'Repasses' })).toBeNull();
    expect(fact(await regiao('Resumo do pedido'), 'Modo')).toHaveTextContent('SaaS');
  });

  it('pessoas: cliente com pedidos e cancelamentos; motoboy com veículo, placa e nota', async () => {
    render(<AdminPedidoPage />);
    const pessoas = await regiao('Pessoas');
    expect(fact(pessoas, 'Cliente')).toHaveTextContent('Ana Souza');
    expect(fact(pessoas, 'Pedidos do cliente')).toHaveTextContent('12 pedidos');
    expect(fact(pessoas, 'Cancelamentos em 30 dias')).toHaveTextContent('1');
    expect(fact(pessoas, 'Motoboy')).toHaveTextContent('Carlos Lima');
    expect(fact(pessoas, 'Veículo')).toHaveTextContent('Honda CG · ABC1D23');
    expect(fact(pessoas, 'Nota')).toHaveTextContent('4,8');
  });

  it('sem motoboy: "Ainda sem motoboy"', async () => {
    routes['/admin/orders/o1'] = ok({ ...DETAIL, motoboy: null, deliveryStatus: 'pending', status: 'aguardando_motoboy' });
    render(<AdminPedidoPage />);
    const pessoas = await regiao('Pessoas');
    expect(fact(pessoas, 'Motoboy')).toHaveTextContent('Ainda sem motoboy');
    expect(within(pessoas).queryByText('Veículo')).toBeNull();
  });
});

describe('leitura', () => {
  it('pedido que não existe: "Pedido não encontrado." com "Tentar de novo"', async () => {
    routes['/admin/orders/o1'] = fail(404, { code: 'ORDER_NOT_FOUND', error: 'Order not found' });
    render(<AdminPedidoPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido não encontrado.');
    routes['/admin/orders/o1'] = ok(DETAIL);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await regiao('Resumo do pedido')).toBeInTheDocument();
  });

  it('sem id na rota ainda: não chama o servidor', () => {
    mockQuery = {};
    render(<AdminPedidoPage />);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
  });

  it('evento com este pedido relê sem apagar a tela; evento de outro pedido não', async () => {
    jest.useFakeTimers();
    render(<AdminPedidoPage />);
    await regiao('Resumo do pedido');
    const antes = calls('/admin/orders/o1');
    act(() => { mockHandlers['admin:order_changed']({ orderId: 'o9', status: 'pago', at: '2026-10-20T15:00:00.000Z' }); });
    act(() => { jest.advanceTimersByTime(2_000); });
    expect(calls('/admin/orders/o1')).toBe(antes);
    act(() => { mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'cancelado', at: '2026-10-20T15:00:05.000Z' }); });
    act(() => { jest.advanceTimersByTime(2_000); });
    await waitFor(() => expect(calls('/admin/orders/o1')).toBe(antes + 1));
    expect(screen.getByRole('region', { name: 'Resumo do pedido' })).toBeInTheDocument();
  });
});

describe('sem permissão de dinheiro (partes e repasses ocultos pelo servidor)', () => {
  it('mostra "—" nas partes e nunca "R$ 0,00" para o que veio nulo ou vazio', async () => {
    routes['/admin/orders/o1'] = ok({
      ...DETAIL,
      money: { ...DETAIL.money, storeShare: null, motoboyShare: null, platformShare: null, payouts: [], motoboyTransfer: null },
    });
    render(<AdminPedidoPage />);
    const dinheiro = await regiao('Dinheiro do pedido');
    expect(fact(dinheiro, 'Loja')).toHaveTextContent('—');
    expect(fact(dinheiro, 'Motoboy')).toHaveTextContent('—');
    expect(fact(dinheiro, 'DROP')).toHaveTextContent('—');
    expect(within(dinheiro).queryByRole('list', { name: 'Repasses' })).toBeNull();
    expect(dinheiro).not.toHaveTextContent('R$ 0,00');
    expect(dinheiro).not.toHaveTextContent('Nenhum repasse criado');
  });

  it('SaaS sem Pix visível: não afirma que não houve Pix e não mostra zero', async () => {
    routes['/admin/orders/o1'] = ok({
      ...DETAIL, settlementMode: 'direct',
      money: { ...DETAIL.money, storeShare: null, motoboyShare: null, platformShare: null, payouts: [], motoboyTransfer: null },
    });
    render(<AdminPedidoPage />);
    const dinheiro = await regiao('Dinheiro do pedido');
    expect(dinheiro).not.toHaveTextContent('R$ 0,00');
    expect(dinheiro).not.toHaveTextContent('Sem Pix ao motoboy');
  });
});

describe('releitura que falha', () => {
  it('mantém o pedido na tela com aviso; some depois de um "Tentar de novo" que dá certo', async () => {
    jest.useFakeTimers();
    render(<AdminPedidoPage />);
    await regiao('Resumo do pedido');
    routes['/admin/orders/o1'] = fail(500, { error: 'boom' });
    act(() => { mockHandlers['admin:order_changed']({ orderId: 'o1', status: 'cancelado', at: '2026-10-20T15:00:05.000Z' }); });
    act(() => { jest.advanceTimersByTime(2_000); });
    expect(await screen.findByText(/Não deu para atualizar\. Mostrando a última leitura\./)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo do pedido' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    routes['/admin/orders/o1'] = ok(DETAIL);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText(/Mostrando a última leitura/)).toBeNull());
    expect(screen.getByRole('region', { name: 'Resumo do pedido' })).toBeInTheDocument();
  });
});
