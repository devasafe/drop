/**
 * D3b-1 · P3.5 — ações do pedido (spec 4.2, 4.3 e 5): botões só com allowedActions; Cancelar com estorno com culpa
 * em rádio, prévia que muda com a culpa (só a última vale), motivo de 5 a 500, resultado na tela e os 409 dentro da
 * folha (com o pedido relido); Reatribuir com o aviso do nome, motivo e o 409 da retirada; clique duplo manda um
 * POST só; nenhum diálogo nativo.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminPedidoPage from '../pages/admin/pedidos/[id]';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { id: 'o1' }, isReady: true, pathname: '/admin/pedidos/[id]', asPath: '/admin/pedidos/o1' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
const mockOn = () => () => undefined;
const mockOnReconnect = () => () => undefined;
jest.mock('../contexts/SocketContext', () => ({
  useSocket: () => ({ on: mockOn, onReconnect: mockOnReconnect, isConnected: true, isReconnecting: false, emit: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const DETAIL = {
  id: 'o1', shortId: 'a1b2c3', status: 'aguardando_motoboy', deliveryStatus: 'assigned', settlementMode: 'custody',
  store: { id: 's1', name: 'Sabor da Vila' },
  customer: { id: 'c1', name: 'Ana Souza', ordersCount: 12, cancellations30d: 1 },
  motoboy: { id: 'm1', name: 'Carlos Lima', vehicle: 'Honda CG', plate: 'ABC1D23', rating: 4.8 },
  timeline: [
    { key: 'created', at: '2026-10-20T13:00:00.000Z', sincePrevMin: null },
    { key: 'paid', at: '2026-10-20T13:02:00.000Z', sincePrevMin: 2 },
    { key: 'accepted', at: '2026-10-20T13:05:00.000Z', sincePrevMin: 3 },
    { key: 'assigned', at: '2026-10-20T13:10:00.000Z', sincePrevMin: 5 },
    { key: 'picked', at: null, sincePrevMin: null },
    { key: 'delivered', at: null, sincePrevMin: null },
  ],
  adminActions: [],
  items: [{ name: 'X-Burguer', quantity: 2, unitPrice: 25, total: 50 }],
  money: {
    subtotal: 56, deliveryFee: 8.9, couponDiscount: 5, walletApplied: 0, paidByCustomer: 59.9,
    storeShare: 49.28, motoboyShare: 8.9, platformShare: 6.72, payouts: [], motoboyTransfer: null,
  },
  cancellation: null,
  refundPending: false,
  allowedActions: ['cancel', 'reassign'],
};
const PREVIEWS: Record<string, unknown> = {
  customer: { fault: 'customer', customerRefund: 47.9, feeCharged: 12, motoboyCompensation: 7, compensationPaidBy: 'customer', countsAgainst: 'customer' },
  store: { fault: 'store', customerRefund: 59.9, feeCharged: 15, motoboyCompensation: 7, compensationPaidBy: 'store', countsAgainst: 'store' },
  motoboy: { fault: 'motoboy', customerRefund: 59.9, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'motoboy' },
  platform: { fault: 'platform', customerRefund: 59.9, feeCharged: 0, motoboyCompensation: 8.9, compensationPaidBy: 'platform', countsAgainst: null },
};

type Reply = () => Promise<unknown>;
const ok = (data: unknown): Reply => () => Promise.resolve({ data });
const conflict = (data: Record<string, unknown>) => ({ response: { status: 409, data } });
let routes: Record<string, Reply>;
const calls = (url: string) => get.mock.calls.filter(([u]) => u === url).length;

beforeEach(() => {
  jest.clearAllMocks();
  routes = { '/admin/orders/o1': ok(DETAIL) };
  Object.entries(PREVIEWS).forEach(([f, p]) => { routes[`/admin/orders/o1/cancel-preview?fault=${f}`] = ok(p); });
  get.mockImplementation((url: string) => (routes[url] ? routes[url]() : Promise.reject(new Error(`GET inesperado: ${url}`))));
});

const abrirCancelar = async () => {
  render(<AdminPedidoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancelar com estorno' }));
  return screen.findByRole('dialog', { name: 'Cancelar #a1b2c3' });
};
const abrirReatribuir = async () => {
  render(<AdminPedidoPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reatribuir motoboy' }));
  return screen.findByRole('dialog', { name: 'Reatribuir motoboy' });
};
const previa = (dialog: HTMLElement) => within(dialog).getByRole('region', { name: 'O que vai acontecer' });
const fact = (region: HTMLElement, label: string) => within(region).getByText(label).parentElement as HTMLElement;
const escolher = async (dialog: HTMLElement, culpa: string, marca: string) => {
  fireEvent.click(within(dialog).getByRole('radio', { name: culpa }));
  await within(previa(dialog)).findByText(marca);
};
const escreverMotivo = (dialog: HTMLElement, texto: string) =>
  fireEvent.change(within(dialog).getByLabelText('Motivo (de 5 a 500 caracteres)'), { target: { value: texto } });
const confirmar = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Confirmar cancelamento' });

describe('botões só com allowedActions', () => {
  it.each([
    ['nenhuma ação', [], []],
    ['só cancelar', ['cancel'], ['Cancelar com estorno']],
    ['só reatribuir', ['reassign'], ['Reatribuir motoboy']],
    ['as duas', ['cancel', 'reassign'], ['Reatribuir motoboy', 'Cancelar com estorno']],
  ])('%s', async (_nome, allowed, botoes) => {
    routes['/admin/orders/o1'] = ok({ ...DETAIL, allowedActions: allowed });
    render(<AdminPedidoPage />);
    await screen.findByRole('region', { name: 'Resumo do pedido' });
    const acoes = screen.queryByRole('region', { name: 'Ações' });
    if (botoes.length === 0) {
      expect(acoes).toBeNull();
      expect(screen.queryByRole('button', { name: 'Cancelar com estorno' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Reatribuir motoboy' })).toBeNull();
    } else {
      expect(within(acoes as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(botoes);
    }
  });
});

describe('Cancelar com estorno', () => {
  it('sem culpa escolhida: sem prévia, confirmar desligado e "Voltar" fecha', async () => {
    const dialog = await abrirCancelar();
    expect(within(dialog).getByText('Escolha a culpa para ver o que acontece com o dinheiro.')).toBeInTheDocument();
    expect(confirmar(dialog)).toBeDisabled();
    expect(get.mock.calls.some(([u]) => String(u).includes('cancel-preview'))).toBe(false);
    expect(within(dialog).getByText('O cliente não vê a culpa: recebe só o aviso de cancelamento pelo suporte do DROP.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a prévia muda com a culpa', async () => {
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Cliente', 'R$ 47,90');
    expect(fact(previa(dialog), 'Cliente recebe de volta')).toHaveTextContent('R$ 47,90');
    expect(fact(previa(dialog), 'Taxa cobrada do cliente')).toHaveTextContent('R$ 12,00');
    expect(fact(previa(dialog), 'Compensação do motoboy')).toHaveTextContent('R$ 7,00 · paga pelo cliente');
    expect(fact(previa(dialog), 'Conta como cancelamento')).toHaveTextContent('Do cliente');

    await escolher(dialog, 'Loja', 'Da loja');
    expect(fact(previa(dialog), 'Taxa cobrada da loja')).toHaveTextContent('R$ 15,00');
    expect(fact(previa(dialog), 'Compensação do motoboy')).toHaveTextContent('R$ 7,00 · paga pela loja');

    await escolher(dialog, 'Motoboy', 'Do motoboy');
    expect(fact(previa(dialog), 'Compensação do motoboy')).toHaveTextContent('Nenhuma');
    expect(within(previa(dialog)).queryByText(/Taxa cobrada/)).toBeNull();

    await escolher(dialog, 'Ninguém (problema do DROP)', 'Não conta para ninguém');
    expect(fact(previa(dialog), 'Cliente recebe de volta')).toHaveTextContent('R$ 59,90');
    expect(fact(previa(dialog), 'Compensação do motoboy')).toHaveTextContent('R$ 8,90 · paga pelo DROP');

    for (const f of ['customer', 'store', 'motoboy', 'platform']) {
      expect(get).toHaveBeenCalledWith(`/admin/orders/o1/cancel-preview?fault=${f}`);
    }
  });

  it('troca rápida de culpa: só a prévia da última vale', async () => {
    let releaseCliente!: () => void;
    routes['/admin/orders/o1/cancel-preview?fault=customer'] = () =>
      new Promise((r) => { releaseCliente = () => r({ data: PREVIEWS.customer }); });
    const dialog = await abrirCancelar();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Cliente' }));
    await escolher(dialog, 'Loja', 'Da loja');
    await act(async () => { releaseCliente(); });
    expect(within(previa(dialog)).getByText('Da loja')).toBeInTheDocument();
    expect(within(previa(dialog)).queryByText('Do cliente')).toBeNull();
  });

  it('prévia que falha: mensagem com "Tentar de novo" e confirmar desligado', async () => {
    routes['/admin/orders/o1/cancel-preview?fault=store'] = () =>
      Promise.reject(conflict({ code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue', error: 'x' }));
    const dialog = await abrirCancelar();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Loja' }));
    expect(await within(previa(dialog)).findByText('Este pedido não pode mais ser cancelado (situação: entregue).')).toBeInTheDocument();
    escreverMotivo(dialog, 'Loja fechou sem avisar');
    expect(confirmar(dialog)).toBeDisabled();
    routes['/admin/orders/o1/cancel-preview?fault=store'] = ok(PREVIEWS.store);
    fireEvent.click(within(previa(dialog)).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(previa(dialog)).findByText('Da loja')).toBeInTheDocument();
    expect(confirmar(dialog)).toBeEnabled();
  });

  it('motivo de 5 a 500 (sem os espaços das pontas): manda { fault, reason }, fecha e mostra o resultado', async () => {
    post.mockResolvedValueOnce({ data: { ok: true, cancellationId: 'k1', refundAmount: 59.9, refundStatus: 'processed' } });
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Ninguém (problema do DROP)', 'Não conta para ninguém');
    escreverMotivo(dialog, '  abc  ');
    expect(confirmar(dialog)).toBeDisabled();
    escreverMotivo(dialog, 'x'.repeat(501));
    expect(confirmar(dialog)).toBeDisabled();
    escreverMotivo(dialog, '  Loja pegou fogo  ');
    expect(confirmar(dialog)).toBeEnabled();
    const antes = calls('/admin/orders/o1');
    fireEvent.click(confirmar(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledWith('/admin/orders/o1/cancel', { fault: 'platform', reason: 'Loja pegou fogo' });
    expect(screen.getByText('Cancelado · R$ 59,90 devolvidos')).toBeInTheDocument();
    await waitFor(() => expect(calls('/admin/orders/o1')).toBe(antes + 1));
  });

  it('estorno pendente: "Cancelado · estorno pendente, veja Estornos" com link', async () => {
    post.mockResolvedValueOnce({ data: { ok: true, cancellationId: 'k1', refundAmount: 59.9, refundStatus: 'pending' } });
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Loja', 'Da loja');
    escreverMotivo(dialog, 'Loja fechou sem avisar');
    fireEvent.click(confirmar(dialog));
    expect(await screen.findByText('Cancelado · estorno pendente, veja Estornos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Estornos' })).toHaveAttribute('href', '/admin/estornos');
  });

  it('409 ORDER_CHANGED: "O pedido mudou. Recarregue." dentro da folha, e o pedido é relido', async () => {
    post.mockRejectedValueOnce(conflict({ code: 'ORDER_CHANGED', currentStatus: 'aguardando_motoboy', error: 'Order changed' }));
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Cliente', 'Do cliente');
    escreverMotivo(dialog, 'Cliente desistiu por telefone');
    const antes = calls('/admin/orders/o1');
    fireEvent.click(confirmar(dialog));
    expect(await within(dialog).findByText('O pedido mudou. Recarregue.')).toBeInTheDocument();
    await waitFor(() => expect(calls('/admin/orders/o1')).toBe(antes + 1));
    expect(screen.getByRole('dialog', { name: 'Cancelar #a1b2c3' })).toBeInTheDocument();
  });

  it('409 ORDER_NOT_CANCELLABLE: a situação atual na mensagem', async () => {
    post.mockRejectedValueOnce(conflict({ code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue', error: 'x' }));
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Motoboy', 'Do motoboy');
    escreverMotivo(dialog, 'Motoboy sumiu com o pedido');
    fireEvent.click(confirmar(dialog));
    expect(await within(dialog).findByText('Este pedido não pode mais ser cancelado (situação: entregue).')).toBeInTheDocument();
  });

  it('clique duplo em confirmar: um POST só', async () => {
    let release!: () => void;
    post.mockImplementationOnce(() => new Promise((r) => {
      release = () => r({ data: { ok: true, cancellationId: 'k1', refundAmount: 59.9, refundStatus: 'processed' } });
    }));
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Loja', 'Da loja');
    escreverMotivo(dialog, 'Loja fechou sem avisar');
    const btn = confirmar(dialog);
    // Os dois cliques no mesmo act: sem render entre eles, só a trava síncrona da AdminSheet segura o segundo.
    act(() => {
      btn.click();
      btn.click();
    });
    await waitFor(() => expect(typeof release).toBe('function'));
    await act(async () => { release(); });
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('Reatribuir motoboy', () => {
  it('aviso com o nome, motivo obrigatório, POST e resultado', async () => {
    post.mockResolvedValueOnce({ data: { ok: true } });
    const dialog = await abrirReatribuir();
    expect(within(dialog).getByText('A corrida volta para a fila; Carlos Lima não recebe esta corrida de novo')).toBeInTheDocument();
    const btn = within(dialog).getByRole('button', { name: 'Confirmar reatribuição' });
    expect(btn).toBeDisabled();
    escreverMotivo(dialog, '  Motoboy parado há 25 min  ');
    expect(btn).toBeEnabled();
    const antes = calls('/admin/orders/o1');
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledWith('/admin/orders/o1/reassign', { reason: 'Motoboy parado há 25 min' });
    expect(screen.getByText('Corrida devolvida à fila')).toBeInTheDocument();
    await waitFor(() => expect(calls('/admin/orders/o1')).toBe(antes + 1));
  });

  it('409 DELIVERY_CHANGED com o pedido já retirado: "O motoboy já retirou o pedido", e o pedido é relido', async () => {
    post.mockRejectedValueOnce(conflict({ code: 'DELIVERY_CHANGED', currentStatus: 'picked', error: 'x' }));
    const dialog = await abrirReatribuir();
    escreverMotivo(dialog, 'Motoboy parado há 25 min');
    const antes = calls('/admin/orders/o1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reatribuição' }));
    expect(await within(dialog).findByText('O motoboy já retirou o pedido')).toBeInTheDocument();
    await waitFor(() => expect(calls('/admin/orders/o1')).toBe(antes + 1));
  });
});

describe('pedido não pago (I1)', () => {
  it('prévia "Nada a devolver: o pedido não foi pago" e resultado "Cancelado · nada a devolver", sem link para Estornos', async () => {
    routes['/admin/orders/o1'] = ok({
      ...DETAIL, status: 'criado', deliveryStatus: null, motoboy: null, allowedActions: ['cancel'],
      timeline: DETAIL.timeline.map((st) => (st.key === 'created' ? st : { ...st, at: null, sincePrevMin: null })),
      money: { ...DETAIL.money, paidByCustomer: 0 },
    });
    routes['/admin/orders/o1/cancel-preview?fault=store'] = ok({
      fault: 'store', customerRefund: 0, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'store',
    });
    post.mockResolvedValueOnce({ data: { ok: true, cancellationId: 'k2', refundAmount: 0, refundStatus: 'pending' } });
    const dialog = await abrirCancelar();
    await escolher(dialog, 'Loja', 'Nada a devolver: o pedido não foi pago');
    expect(within(previa(dialog)).queryByText('R$ 0,00')).toBeNull();
    escreverMotivo(dialog, 'Cliente desistiu antes de pagar');
    fireEvent.click(confirmar(dialog));
    expect(await screen.findByText('Cancelado · nada a devolver')).toBeInTheDocument();
    expect(screen.queryByText('Cancelado · estorno pendente, veja Estornos')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abrir Estornos' })).toBeNull();
  });
});

describe('culpa "Cliente" com o motoboy em rota (B2: taxa vale com a entrega retirada)', () => {
  it('a prévia mostra a taxa do cliente e a compensação do motoboy', async () => {
    routes['/admin/orders/o1'] = ok({ ...DETAIL, status: 'aguardando_motoboy', deliveryStatus: 'picked', allowedActions: ['cancel'] });
    routes['/admin/orders/o1/cancel-preview?fault=customer'] = ok({
      fault: 'customer', customerRefund: 40, feeCharged: 19.9, motoboyCompensation: 8.9,
      compensationPaidBy: 'customer', countsAgainst: 'customer',
    });
    const dialog = await abrirCancelar();
    expect(screen.getByText('Em entrega')).toBeInTheDocument();
    await escolher(dialog, 'Cliente', 'R$ 40,00');
    expect(fact(previa(dialog), 'Taxa cobrada do cliente')).toHaveTextContent('R$ 19,90');
    expect(fact(previa(dialog), 'Compensação do motoboy')).toHaveTextContent('R$ 8,90 · paga pelo cliente');
    expect(fact(previa(dialog), 'Conta como cancelamento')).toHaveTextContent('Do cliente');
  });
});

it('nenhum diálogo nativo no caminho das ações', async () => {
  const spies = { confirm: jest.fn(() => true), alert: jest.fn(), prompt: jest.fn(() => '') };
  Object.entries(spies).forEach(([k, v]) => Object.defineProperty(window, k, { configurable: true, writable: true, value: v }));
  post.mockResolvedValueOnce({ data: { ok: true, cancellationId: 'k1', refundAmount: 59.9, refundStatus: 'processed' } });
  const dialog = await abrirCancelar();
  await escolher(dialog, 'Loja', 'Da loja');
  escreverMotivo(dialog, 'Loja fechou sem avisar');
  fireEvent.click(confirmar(dialog));
  await screen.findByText('Cancelado · R$ 59,90 devolvidos');
  expect(spies.confirm).not.toHaveBeenCalled();
  expect(spies.alert).not.toHaveBeenCalled();
  expect(spies.prompt).not.toHaveBeenCalled();
});
