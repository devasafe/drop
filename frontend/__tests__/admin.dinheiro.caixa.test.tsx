/**
 * D3a · P4.2 — Dinheiro · Caixa da plataforma (tela 18).
 * Caracterização: as chamadas da página antiga (passa na antiga e na nova).
 * Tela nova: erro de leitura sem números, botões pela permissão da rota, AdminSheet no lugar do prompt,
 * link do pedido em /order/{id}, celular em cartões.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminCashboxPage from '../pages/admin/app-cashbox';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
const mockPush = jest.fn();
let mockCan: (p: string) => boolean = () => true;
// objeto `user` estável (F6): um `user` novo a cada render prenderia os efeitos `[user]` num laço
const mockUser = { id: 'adm1', name: 'Asafe', email: 'a@x.com', role: 'ceo', activeRole: 'ceo' };

jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/admin/app-cashbox', asPath: '/admin/app-cashbox' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={typeof href === 'string' ? href : ''} {...rest}>{children}</a>,
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;

const CASHBOX = {
  _id: 'cb', balance: 7912.4, totalIncome: 60000, totalExpenses: 10129.88, pendingObligations: 9196.7,
  platformNet: 49870.12, asaas: { enabled: true, balance: 24918.3 }, history: [],
};
const STATEMENT = {
  statement: [
    { _id: 'h1', type: 'income', source: 'product_commission', amount: 40.48, orderId: 'ord000004812', reason: 'Comissão 15%', date: '2026-10-08T15:31:00Z' },
    { _id: 'h2', type: 'expense', source: 'manual_withdrawal', amount: 6000, withdrawalId: 'cw0', date: '2026-10-01T12:00:00Z' },
  ],
};
const WITHDRAWALS = {
  withdrawals: [
    { _id: 'cw1', amount: 5000, status: 'pending', bankInfo: { bank: 'Banco X', account: '0001 / 123-4', holderName: 'DROP LTDA' }, requestedAt: '2026-10-08T10:00:00Z' },
    { _id: 'cw2', amount: 1000, status: 'rejected', rejectionReason: 'Conta errada', requestedAt: '2026-10-02T10:00:00Z' },
  ],
};

type Override = Record<string, () => Promise<unknown>>;
function mockServer(over: Override = {}) {
  get.mockImplementation((url: string) => {
    if (over[url]) return over[url]();
    if (url === '/admin/app-cashbox') return Promise.resolve({ data: CASHBOX });
    if (url === '/admin/app-cashbox/statement') return Promise.resolve({ data: STATEMENT });
    if (url === '/admin/app-cashbox/withdrawals') return Promise.resolve({ data: WITHDRAWALS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  post.mockResolvedValue({ data: { success: true } });
  put.mockResolvedValue({ data: { success: true } });
}

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  // só para a página antiga rodar no passo 2 (ela usa prompt e não usa alert/confirm aqui)
  spies.push(jest.spyOn(window, 'prompt').mockImplementation(() => 'Conta errada'));
  mockServer();
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  resetViewport();
});

const lastButton = (name: RegExp) => {
  const all = screen.getAllByRole('button', { name });
  return all[all.length - 1];
};
const loaded = () => waitFor(() => expect(get).toHaveBeenCalledWith('/admin/app-cashbox/withdrawals'));

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('abre lendo caixa, extrato e retiradas', async () => {
    render(<AdminCashboxPage />);
    await loaded();
    expect(get).toHaveBeenCalledWith('/admin/app-cashbox');
    expect(get).toHaveBeenCalledWith('/admin/app-cashbox/statement');
  });

  it('registra depósito (POST /admin/app-cashbox/deposit)', async () => {
    render(<AdminCashboxPage />);
    await loaded();
    fireEvent.click((await screen.findAllByRole('button', { name: /registrar depósito/i }))[0]);
    fireEvent.change(screen.getByPlaceholderText(/^0[.,]00$/), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Descrição do depósito...'), { target: { value: 'Aporte dos sócios' } });
    fireEvent.click(lastButton(/registrar depósito/i));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/app-cashbox/deposit', { amount: 100, reason: 'Aporte dos sócios' }));
  });

  it('pede retirada com os dados bancários (POST /admin/app-cashbox/withdrawal)', async () => {
    render(<AdminCashboxPage />);
    await loaded();
    fireEvent.click((await screen.findAllByRole('button', { name: /solicitar saque|pedir retirada/i }))[0]);
    fireEvent.change(screen.getByPlaceholderText(/^0[.,]00$/), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('ex: Banco do Brasil'), { target: { value: 'Banco X' } });
    fireEvent.change(screen.getByPlaceholderText('ex: 1234-5 / 123456789-0'), { target: { value: '0001 / 123-4' } });
    fireEvent.change(screen.getByPlaceholderText('Nome'), { target: { value: 'DROP LTDA' } });
    fireEvent.change(screen.getByPlaceholderText('Motivo do saque...'), { target: { value: 'Pró-labore' } });
    fireEvent.click(lastButton(/solicitar saque|pedir retirada/i));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/app-cashbox/withdrawal', {
      amount: 500, reason: 'Pró-labore', bankInfo: { bank: 'Banco X', account: '0001 / 123-4', holderName: 'DROP LTDA' },
    }));
  });

  it('aprova retirada pendente (PUT …/approve, sem corpo)', async () => {
    render(<AdminCashboxPage />);
    await loaded();
    // a página antiga só desenha as abas depois de ler (até lá, esqueleto); os botões do topo aparecem junto
    await screen.findAllByRole('button', { name: /registrar depósito/i });
    const oldTab = screen.queryByRole('button', { name: /^Saques$/ });
    if (oldTab) fireEvent.click(oldTab);
    fireEvent.click(await screen.findByRole('button', { name: /^Aprovar$/ }));
    const ok = screen.queryByRole('button', { name: 'Confirmar aprovação' });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/app-cashbox/withdrawals/cw1/approve'));
    expect(put.mock.calls[0]).toHaveLength(1);
  });

  it('recusa retirada com motivo (PUT …/reject { rejectionReason })', async () => {
    render(<AdminCashboxPage />);
    await loaded();
    // a página antiga só desenha as abas depois de ler (até lá, esqueleto); os botões do topo aparecem junto
    await screen.findAllByRole('button', { name: /registrar depósito/i });
    const oldTab = screen.queryByRole('button', { name: /^Saques$/ });
    if (oldTab) fireEvent.click(oldTab);
    fireEvent.click(await screen.findByRole('button', { name: /^(Rejeitar|Recusar)$/ }));
    const field = screen.queryByLabelText('Motivo da recusa');
    if (field) {
      fireEvent.change(field, { target: { value: 'Conta errada' } });
      fireEvent.click(screen.getByRole('button', { name: 'Recusar retirada' }));
    }
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/app-cashbox/withdrawals/cw1/reject', { rejectionReason: 'Conta errada' }));
  });
});

describe('tela nova', () => {
  it('leitura falha: erro com "Tentar de novo" e nenhum número', async () => {
    let fail = true;
    mockServer({
      '/admin/app-cashbox/statement': () => (fail ? Promise.reject(new Error('500')) : Promise.resolve({ data: STATEMENT })),
    });
    render(<AdminCashboxPage />);
    expect(await screen.findByText('Não deu para carregar os dados do caixa.')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Lucro líquido do DROP')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('R$ 49.870,12')).toBeInTheDocument();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('KPIs e saldo real da conta-mãe', async () => {
    render(<AdminCashboxPage />);
    expect(await screen.findByText('Lucro líquido do DROP')).toBeInTheDocument();
    expect(screen.getByText('R$ 49.870,12')).toBeInTheDocument();
    expect(screen.getByText('R$ 9.196,70')).toBeInTheDocument();
    expect(screen.getByText('R$ 24.918,30')).toBeInTheDocument();
  });

  it('Asaas indisponível: diz "Indisponível" e o motivo, nunca zero', async () => {
    mockServer({
      '/admin/app-cashbox': () => Promise.resolve({ data: { ...CASHBOX, asaas: { enabled: true, balance: null, error: 'timeout' } } }),
    });
    render(<AdminCashboxPage />);
    expect(await screen.findByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText(/Não deu para consultar o Asaas: timeout/)).toBeInTheDocument();
  });

  it('só com cashbox:view: vê tudo e não vê nenhum botão de ação', async () => {
    mockCan = (p) => p === 'cashbox:view';
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    for (const name of ['Pedir retirada', 'Registrar depósito', 'Aprovar', 'Recusar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('cada botão aparece com a permissão da sua rota', async () => {
    mockCan = (p) => ['cashbox:view', 'cashbox:withdraw'].includes(p);
    const { unmount } = render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    expect(screen.getByRole('button', { name: 'Pedir retirada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar depósito' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    unmount();

    mockCan = (p) => ['cashbox:view', 'cashbox:approve_withdrawal'].includes(p);
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedir retirada' })).not.toBeInTheDocument();
  });

  it('sem cashbox:view: vai para /access-denied', async () => {
    mockCan = () => false;
    render(<AdminCashboxPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/access-denied'));
    expect(get).not.toHaveBeenCalled();
  });

  it('detalhe do extrato: o pedido abre /order/{id} (não /admin/order)', async () => {
    render(<AdminCashboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Comissão de produto' }));
    const sheet = screen.getByRole('dialog', { name: 'Comissão de produto' });
    expect(within(sheet).getByRole('link', { name: '#00004812' })).toHaveAttribute('href', '/order/ord000004812');
    expect(document.querySelector('a[href^="/admin/order"]')).toBeNull();
  });

  it('recusar exige motivo e o erro do servidor aparece na folha', async () => {
    put.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Saque não está mais pendente' } } });
    render(<AdminCashboxPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
    const sheet = screen.getByRole('dialog', { name: 'Recusar retirada' });
    const send = within(sheet).getByRole('button', { name: 'Recusar retirada' });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Motivo da recusa'), { target: { value: 'Conta errada' } });
    fireEvent.click(send);
    expect(await within(sheet).findByText('Saque não está mais pendente')).toBeInTheDocument();
  });

  it('pedir retirada: só envia com valor e banco; depois avisa e relê', async () => {
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir retirada' }));
    const sheet = screen.getByRole('dialog', { name: 'Pedir retirada' });
    const send = within(sheet).getByRole('button', { name: 'Pedir retirada' });
    fireEvent.change(within(sheet).getByLabelText('Valor (R$)'), { target: { value: '500,50' } });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Banco'), { target: { value: 'Banco X' } });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/app-cashbox/withdrawal', {
      amount: 500.5, reason: '', bankInfo: { bank: 'Banco X', account: '', holderName: '' },
    }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Retirada pedida. Ela aguarda aprovação.', 'success'));
    expect(get.mock.calls.filter(([u]) => u === '/admin/app-cashbox')).toHaveLength(2);
  });

  it('valor da retirada: só o digitado (sem milhar, até 2 casas), com prévia antes de pedir', async () => {
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir retirada' }));
    const sheet = screen.getByRole('dialog', { name: 'Pedir retirada' });
    const send = within(sheet).getByRole('button', { name: 'Pedir retirada' });
    fireEvent.change(within(sheet).getByLabelText('Banco'), { target: { value: 'Banco X' } });
    const amount = within(sheet).getByLabelText('Valor (R$)');
    for (const v of ['1.234,56', '10abc', '1e3', '0,001', '-5']) {
      fireEvent.change(amount, { target: { value: v } });
      expect(send).toBeDisabled();
      expect(within(sheet).queryByText(/^Será retirado:/)).not.toBeInTheDocument();
      expect(within(sheet).getByText('Use só números, com até 2 casas (ex.: 25,50).')).toBeInTheDocument();
    }
    fireEvent.change(amount, { target: { value: '0' } });
    expect(send).toBeDisabled();
    expect(within(sheet).getByText('O valor tem que ser maior que zero.')).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '1234.5' } });
    expect(within(sheet).getByText('Será retirado: R$ 1.234,50')).toBeInTheDocument();
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/app-cashbox/withdrawal', {
      amount: 1234.5, reason: '', bankInfo: { bank: 'Banco X', account: '', holderName: '' },
    }));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('valor do depósito: só o digitado, com prévia antes de registrar', async () => {
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar depósito' }));
    const sheet = screen.getByRole('dialog', { name: 'Registrar depósito' });
    const send = within(sheet).getByRole('button', { name: 'Registrar depósito' });
    const amount = within(sheet).getByLabelText('Valor (R$)');
    fireEvent.change(amount, { target: { value: '1.000' } });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '100,5' } });
    expect(within(sheet).getByText('Será registrado: R$ 100,50')).toBeInTheDocument();
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/app-cashbox/deposit', { amount: 100.5, reason: '' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Depósito registrado.', 'success'));
  });

  it('celular: extrato e retiradas em cartões', async () => {
    setViewportWidth(360);
    render(<AdminCashboxPage />);
    await screen.findByText('Lucro líquido do DROP');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByText('Banco X · DROP LTDA').closest('li')!;
    expect(within(card).getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });
});
