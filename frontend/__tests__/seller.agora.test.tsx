import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), query: {}, asPath: '/seller/dashboard', pathname: '/seller/dashboard', isReady: true }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, lead, actions, children }: any) => <div>{lead}<h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockPanel: any;
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
let mockMode = 'custodia';
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false }) }));
let mockProducts: any[] = [];
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: mockProducts, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

import AgoraPage from '../pages/seller/dashboard';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;

const novo = (over: any = {}) => ({
  _id: 'ord000004823', status: 'criado', totalValue: 269.8, deliveryDistance: 2.4, paymentMethod: 'pix', paymentStatus: 'paid', customerName: 'Ana Souza',
  createdAt: new Date().toISOString(), acceptDeadline: new Date(Date.now() + 252000).toISOString(),
  products: [{ productId: 'p1', productName: 'Fone JBL Tune 520BT', quantity: 1, price: 229.9 }], ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'custodia';
  mockProducts = [];
  mockPanel = {
    store: { _id: 's1', name: 'Eletro Center', isOpen: true, plan: 2 }, orders: [], refresh: jest.fn().mockResolvedValue(undefined), newOrderCount: 0,
    patchOrder: jest.fn(), removeOrder: jest.fn(), clearNewOrders: jest.fn(),
  };
  get.mockImplementation((url: string) => {
    if (url === '/analytics/store/overview') {
      return Promise.resolve({ data: { current: { revenue: 1284, orders: 14, avgTicket: 91.7, productsSold: 20, cancellationRate: 0 }, previous: {}, delta: { revenue: 12, orders: 27.3, avgTicket: -4, productsSold: 0, cancellationRate: 0 } } });
    }
    if (url === '/stores/s1/saas-billing') return Promise.resolve({ data: { success: true, data: { status: 'paused', nextPayment: { dueDate: '2026-10-17T12:00:00Z', value: 149, invoiceUrl: 'https://pay/x' } } } });
    return Promise.reject(new Error('n/a'));
  });
});

/** Renderiza e deixa a busca dos números de hoje terminar dentro do act (saída sem avisos). */
async function renderAgora() {
  const r = render(<AgoraPage />);
  await act(async () => { await Promise.resolve(); });
  return r;
}

test('pedido novo mostra o prazo do servidor e nunca "5 min"', async () => {
  mockPanel.orders = [novo()];
  const { container } = await renderAgora();
  const card = screen.getByTestId('novo-ord000004823');
  expect(within(card).getByText('#004823 · R$ 269,80')).toBeInTheDocument();
  // AcceptCountdown (36a32ba): ao vencer o pedido é CANCELADO, então o texto é "cancela em".
  expect(within(card).getByRole('timer')).toHaveTextContent(/cancela em 4:1\d/);
  expect(container.textContent).not.toMatch(/5 min/);
});

test('aceitar exige o segundo toque e manda o payload antigo; depois atualiza o painel', async () => {
  mockPanel.orders = [novo()];
  post.mockResolvedValue({ data: { requiresDelivery: true } });
  render(<AgoraPage />);
  const card = screen.getByTestId('novo-ord000004823');
  fireEvent.click(within(card).getByRole('button', { name: /aceitar pedido/i }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(within(card).getByRole('button', { name: /toque de novo para aceitar/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/ord000004823/accept', { distance: 2.4 }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  // C12: o otimista vem ANTES da recarga.
  expect(mockPanel.patchOrder).toHaveBeenCalledWith('ord000004823', { status: 'pago' });
  expect(mockPanel.patchOrder.mock.invocationCallOrder[0]).toBeLessThan(mockPanel.refresh.mock.invocationCallOrder[0]);
  expect(await screen.findByText('Pedido #004823 aceito. Separe os itens.')).toBeInTheDocument();
});

test('aceite com erro: recarrega e mostra "Já aceito" se o pedido não espera mais aceite', async () => {
  mockPanel.orders = [novo()];
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Pedido não pode ser aceito' } } });
  mockPanel.refresh = jest.fn().mockImplementation(async () => {
    mockPanel = { ...mockPanel, orders: [novo({ status: 'pago' })] };
  });
  const { rerender } = render(<AgoraPage />);
  const card = screen.getByTestId('novo-ord000004823');
  fireEvent.click(within(card).getByRole('button', { name: /aceitar pedido/i }));
  fireEvent.click(within(card).getByRole('button', { name: /toque de novo para aceitar/i }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  rerender(<AgoraPage />);
  // O card sai de "Novos" (vai para Em andamento) e a página avisa.
  expect(await screen.findByText('Já aceito: o pedido #004823 está em andamento.')).toBeInTheDocument();
  expect(screen.queryByTestId('novo-ord000004823')).toBeNull();
  expect(screen.getByRole('link', { name: /#004823/ })).toBeInTheDocument();
});

test('Recusar abre o sheet de motivos', async () => {
  mockPanel.orders = [novo()];
  await renderAgora();
  fireEvent.click(within(screen.getByTestId('novo-ord000004823')).getByRole('button', { name: 'Recusar' }));
  expect(screen.getByText('Recusar o pedido #004823?')).toBeInTheDocument();
});

test('recusa: tira o pedido do painel antes de recarregar e mantém a confirmação aberta', async () => {
  mockPanel.orders = [novo()];
  post.mockResolvedValue({ data: { success: true, data: { refundStatus: 'processed', refundAmount: 269.8 } } });
  const { rerender } = render(<AgoraPage />);
  fireEvent.click(within(screen.getByTestId('novo-ord000004823')).getByRole('button', { name: 'Recusar' }));
  fireEvent.click(screen.getByText('Loja cheia agora'));
  fireEvent.click(screen.getByRole('button', { name: /^recusar pedido/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/ord000004823/reject', { reason: 'Muitos pedidos para processar', reasonCode: 'store_busy' }));
  await waitFor(() => expect(mockPanel.refresh).toHaveBeenCalled());
  expect(mockPanel.removeOrder).toHaveBeenCalledWith('ord000004823');
  expect(mockPanel.removeOrder.mock.invocationCallOrder[0]).toBeLessThan(mockPanel.refresh.mock.invocationCallOrder[0]);
  // O pedido sai da lista, mas a sheet continua com a confirmação até o lojista fechar.
  mockPanel = { ...mockPanel, orders: [] };
  rerender(<AgoraPage />);
  expect(screen.getByText('Pedido recusado')).toBeInTheDocument();
  expect(screen.getByText('R$ 269,80 voltam para o cliente.')).toBeInTheDocument();
});

test('sheet aberta fecha sozinha se o pedido foi aceito/cancelado por outro caminho', async () => {
  mockPanel.orders = [novo()];
  const { rerender } = await renderAgora();
  fireEvent.click(within(screen.getByTestId('novo-ord000004823')).getByRole('button', { name: 'Recusar' }));
  expect(screen.getByText('Recusar o pedido #004823?')).toBeInTheDocument();
  mockPanel = { ...mockPanel, orders: [] };
  rerender(<AgoraPage />);
  expect(screen.queryByText('Recusar o pedido #004823?')).toBeNull();
});

test('prazo vencido: some aceitar/recusar e o painel recarrega', async () => {
  mockPanel.orders = [novo({ acceptDeadline: new Date(Date.now() - 1000).toISOString() })];
  await renderAgora();
  const card = screen.getByTestId('novo-ord000004823');
  expect(within(card).getByText('Cancelado por falta de aceite')).toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: /aceitar pedido/i })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Recusar' })).toBeNull();
  expect(mockPanel.refresh).toHaveBeenCalled();
});

test('cartão ainda não aprovado: não oferece aceitar nem recusar', async () => {
  mockPanel.orders = [novo({ paymentMethod: 'credit_card', paymentStatus: 'pending', asaasPaymentId: 'pay_1' })];
  await renderAgora();
  const card = screen.getByTestId('novo-ord000004823');
  expect(within(card).getByText('Aguardando a aprovação do cartão')).toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: /aceitar pedido/i })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Recusar' })).toBeNull();
});

test('pedido novo exibido limpa o destaque do painel', async () => {
  mockPanel.orders = [novo()];
  mockPanel.newOrderCount = 1;
  await renderAgora();
  expect(mockPanel.clearNewOrders).toHaveBeenCalled();
});

test('switch fecha a loja pelo mesmo endpoint de antes', async () => {
  put.mockResolvedValue({ data: {} });
  render(<AgoraPage />);
  fireEvent.click(screen.getByRole('switch', { name: 'Loja aberta' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/stores/s1/operating-hours', { isOpen: false }));
  expect(mockPanel.refresh).toHaveBeenCalled();
});

test('loja fechada avisa e oferece abrir', async () => {
  mockPanel.store = { ...mockPanel.store, isOpen: false };
  await renderAgora();
  expect(screen.getByText('Você está fechada')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Loja fechada' })).toHaveAttribute('aria-checked', 'false');
});

test('sem pedido novo: estado vazio', async () => {
  await renderAgora();
  expect(screen.getByText('Nenhum pedido novo.')).toBeInTheDocument();
});

test('números de hoje vêm do servidor, com a comparação com ontem', async () => {
  render(<AgoraPage />);
  expect(await screen.findByText('R$ 1.284,00')).toBeInTheDocument();
  expect(screen.getByText('↑ 12% vs. ontem')).toBeInTheDocument();
  expect(screen.getByText('↓ 4% vs. ontem')).toBeInTheDocument();
  const call = get.mock.calls.find(([u]) => u === '/analytics/store/overview');
  expect(call[1].params.from).toBe(call[1].params.to);
});

test('estoque baixo leva para Repor estoque', async () => {
  mockProducts = [{ _id: 'p1', name: 'Cabo USB-C 2 m', quantity: 2 }, { _id: 'p2', name: 'Caneta', quantity: 40 }, { _id: 'p3', name: 'Pausado', quantity: 0, isActive: false }];
  await renderAgora();
  expect(screen.getByText('1 produto com estoque baixo')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Repor estoque' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/estoque');
});

test('modo SaaS pausado: card da pausa e switch desligado', async () => {
  mockMode = 'direto';
  render(<AgoraPage />);
  expect(await screen.findByText('Sua loja está pausada')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Loja fechada' })).toBeDisabled());
  expect(screen.getByText('Abre sozinha quando o pagamento cair')).toBeInTheDocument();
});

test('modo custódia não busca a mensalidade', async () => {
  render(<AgoraPage />);
  await act(async () => { await Promise.resolve(); });
  expect(get.mock.calls.some(([u]) => u === '/stores/s1/saas-billing')).toBe(false);
});

test('pedido em andamento aparece com o estado e leva ao pedido', async () => {
  mockPanel.orders = [{ _id: 'ord000004817', status: 'aguardando_motoboy', deliveryId: 'd1', deliveryFee: 7, totalValue: 229.9, customerName: 'Bruno', createdAt: new Date().toISOString(), delivery: { _id: 'd1', status: 'assigned', motoboyName: 'Carlos' }, products: [] }];
  await renderAgora();
  const row = screen.getByRole('link', { name: /#004817/ });
  expect(within(row).getByText('Motoboy chegando')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'Agora.module.css'), 'utf8'))).toEqual([]);
});

test('devolução pendente ao vivo: aviso no Agora com link para Pedidos > Devoluções', async () => {
  mockPanel.returnRequests = [{ orderId: 'ord000004823', deliveryId: 'd1' }];
  await renderAgora();
  const alert = screen.getByText(/1 devolução esperando resposta/i).closest('[role]') as HTMLElement;
  expect(alert).toBeTruthy();
  fireEvent.click(within(alert).getByRole('button', { name: /ver devoluções/i }));
  expect(mockPush).toHaveBeenCalledWith('/seller/pedidos?seg=devolucoes');
});

test('sem devolução pendente, o Agora não mostra o aviso', async () => {
  mockPanel.returnRequests = [];
  await renderAgora();
  expect(screen.queryByText(/devoluç/i)).not.toBeInTheDocument();
});

describe('V4 · topo e ordem como o protótipo', () => {
  const withNotifications = (list: any[]) => {
    const base = get.getMockImplementation()!;
    get.mockImplementation((url: string, ...rest: any[]) => (url === '/notifications' ? Promise.resolve({ data: list }) : base(url, ...rest)));
  };

  test('topo: avatar com as iniciais da loja e sino com o número de não lidas, levando a Notificações', async () => {
    withNotifications([{ _id: 'n1', read: false }, { _id: 'n2', read: false }, { _id: 'n3', read: true }]);
    await renderAgora();
    expect(screen.getByText('EC')).toBeInTheDocument();
    const bell = await screen.findByRole('link', { name: 'Notificações, 2 não lidas' });
    expect(bell).toHaveAttribute('href', '/seller/notificacoes');
    expect(within(bell).getByText('2')).toBeInTheDocument();
  });

  test('sem não lidas (ou leitura com erro): sino sem número', async () => {
    await renderAgora();
    const bell = screen.getByRole('link', { name: 'Notificações' });
    expect(bell).toHaveAttribute('href', '/seller/notificacoes');
    expect(bell.textContent).toBe('');
  });

  test('o switch "Loja aberta" vem antes de "Novos pedidos" (1º bloco no celular)', async () => {
    mockPanel.orders = [novo()];
    await renderAgora();
    const sw = screen.getByRole('switch', { name: 'Loja aberta' });
    const novos = screen.getByRole('heading', { name: /Novos pedidos/ });
    expect(sw.compareDocumentPosition(novos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('"Hoje" diz até que horas os números valem; sem números, não diz', async () => {
    const { unmount } = await renderAgora();
    expect(await screen.findByText(/^até \d{2}:\d{2}$/)).toBeInTheDocument();
    unmount();
    get.mockRejectedValue(new Error('n/a'));
    await renderAgora();
    expect(screen.queryByText(/^até \d{2}:\d{2}$/)).toBeNull();
  });

  test('não promete aceite automático (o prazo vencido cancela o pedido)', async () => {
    await renderAgora();
    expect(document.body.textContent).not.toMatch(/aceite autom/i);
  });
});

test('CSS do topo do Agora só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'components', 'seller', 'agora', 'AgoraTop.module.css'), 'utf8'))).toEqual([]);
});
