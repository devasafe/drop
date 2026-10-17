/**
 * D3b-3 · P4.5 — Carteiras · Ajustar saldo (spec 5): "Adicionar saldo" sai; "Ajustar saldo" (só o CEO, com
 * wallet:credit) numa AdminSheet com crédito/débito, valor exato (parseAmount), motivo de 10 a 500, prévia
 * "saldo antes → depois", chave de idempotência estável entre tentativas COM OS MESMOS valores (direção, valor,
 * motivo; E9) e nova quando algum muda ou quando a folha reabre, 409 INSUFFICIENT_BALANCE com o saldo disponível,
 * 409 IDEMPOTENCY_KEY_REUSED com chave nova, resposta de outra carteira nunca vira sucesso; o extrato mostra
 * "Ajuste da plataforma".
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminWalletsPage from '../pages/admin/wallets';
import { UUID_V4_RE } from '../lib/adminMoney';
import { resetViewport } from './helpers/viewport';

const mockToast = jest.fn();
let mockRole = 'ceo';
let mockCan: (p: string) => boolean = () => true;
// objeto `user` estável (F6): um `user` novo a cada render prenderia os efeitos `[user]` num laço
const mockUsers: Record<string, { id: string; name: string; email: string; role: string; activeRole: string }> = {
  ceo: { id: 'adm1', name: 'Marina', email: 'm@x.com', role: 'ceo', activeRole: 'ceo' },
  gerente_geral: { id: 'adm1', name: 'Marina', email: 'm@x.com', role: 'gerente_geral', activeRole: 'gerente_geral' },
};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/wallets', asPath: '/admin/wallets' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUsers[mockRole],
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

const MOTIVO = 'Compensação do pedido 4790 extraviado';
const WALLETS = [{
  _id: 'w1', owner: 'u1', userId: 'u1', balance: 118.32, totalSpent: 20, totalWithdrawn: 86.4,
  userName: 'Carlos Lima', userEmail: 'carlos@x.com', userRole: 'motoboy', hasAccess: true,
}];
const TXS = [{
  _id: 't9', type: 'credit', category: 'adjustment', amount: 25, reason: 'Ajuste da plataforma: Compensação antiga',
  status: 'completed', createdAt: '2026-10-16T13:05:00Z',
}];
const adjusted = (over: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
  data: {
    message: 'Saldo ajustado', replayed: false, ...top,
    adjustment: {
      actionId: 'act1', walletId: 'w1', direction: 'credit', amount: 25.5, reason: MOTIVO,
      balanceBefore: 118.32, balanceAfter: 143.82, walletEntryId: 'e1', createdAt: '2026-10-16T13:05:00.000Z', ...over,
    },
  },
});

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'ceo';
  mockCan = () => true;
  alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  get.mockImplementation((url: string) => {
    if (url === '/wallet-access/outgoing') return Promise.resolve({ data: { requests: [] } });
    if (url === '/admin/wallets') return Promise.resolve({ data: WALLETS });
    if (url === '/admin/wallets/w1/transactions') return Promise.resolve({ data: TXS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  post.mockResolvedValue(adjusted());
});
afterEach(() => {
  expect(alertSpy).not.toHaveBeenCalled();
  alertSpy.mockRestore();
  resetViewport();
});

const openWallet = async () => {
  render(<AdminWalletsPage />);
  await screen.findByText('Carlos Lima');
  fireEvent.click(screen.getByRole('button', { name: 'Ver extrato' }));
  await screen.findByText('Ajuste da plataforma');
};
const openAdjust = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldo' }));
  return screen.getByRole('dialog', { name: 'Ajustar saldo' });
};
const fill = (sheet: HTMLElement, amount: string, reason = MOTIVO) => {
  fireEvent.change(within(sheet).getByLabelText('Valor (R$)'), { target: { value: amount } });
  fireEvent.change(within(sheet).getByLabelText('Motivo (de 10 a 500 caracteres)'), { target: { value: reason } });
};
const confirm = (sheet: HTMLElement) => within(sheet).getByRole('button', { name: 'Confirmar ajuste' });
const keys = () => post.mock.calls.map(([, body]) => body.idempotencyKey as string);

describe('quem vê', () => {
  it('"Adicionar saldo" saiu; o CEO vê "Ajustar saldo" no detalhe da carteira', async () => {
    await openWallet();
    expect(screen.queryByRole('button', { name: 'Adicionar saldo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajustar saldo' })).toBeInTheDocument();
  });

  it('quem não é CEO não vê, mesmo com todas as permissões', async () => {
    mockRole = 'gerente_geral';
    await openWallet();
    expect(screen.queryByRole('button', { name: 'Ajustar saldo' })).toBeNull();
  });

  it('CEO sem wallet:credit (permissão negada no contexto) também não vê', async () => {
    mockCan = (p) => p !== 'wallet:credit';
    await openWallet();
    expect(screen.queryByRole('button', { name: 'Ajustar saldo' })).toBeNull();
  });
});

describe('crédito e débito', () => {
  it('crédito: prévia antes → depois, POST /adjust com a chave, folha fecha, saldo e extrato atualizados', async () => {
    await openWallet();
    const sheet = openAdjust();
    expect(within(sheet).getByText('Isto cria saldo sem pagamento')).toBeInTheDocument();
    fill(sheet, '25,50');
    expect(within(sheet).getByText('Saldo: R$ 118,32 → R$ 143,82')).toBeInTheDocument();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/wallets/w1/adjust', {
      direction: 'credit', amount: 25.5, reason: MOTIVO, idempotencyKey: expect.stringMatching(UUID_V4_RE),
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Saldo ajustado. Saldo agora: R$ 143,82.', 'success');
    expect(screen.getAllByText('R$ 143,82').length).toBeGreaterThan(0);
    expect(get.mock.calls.filter(([u]) => u === '/admin/wallets/w1/transactions')).toHaveLength(2);
  });

  it('débito maior que o saldo não sai; dentro do saldo vai com direction "debit"', async () => {
    post.mockResolvedValue(adjusted({ direction: 'debit', amount: 18.32, balanceAfter: 100 }));
    await openWallet();
    const sheet = openAdjust();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Débito/ }));
    expect(within(sheet).getByText('Isto tira saldo da carteira')).toBeInTheDocument();
    fill(sheet, '200');
    expect(within(sheet).getByText('Maior que o saldo da carteira (R$ 118,32).')).toBeInTheDocument();
    expect(confirm(sheet)).toBeDisabled();
    fill(sheet, '18,32');
    expect(within(sheet).getByText('Saldo: R$ 118,32 → R$ 100,00')).toBeInTheDocument();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/wallets/w1/adjust', expect.objectContaining({
      direction: 'debit', amount: 18.32, reason: MOTIVO,
    })));
    expect(mockToast).toHaveBeenCalledWith('Saldo ajustado. Saldo agora: R$ 100,00.', 'success');
  });

  it.each([
    ['motivo curto (9)', '25', 'x'.repeat(9), null],
    ['motivo longo (501)', '25', 'x'.repeat(501), null],
    ['acima do limite', '50000,01', MOTIVO, 'O valor máximo é R$ 50.000,00.'],
    ['formato recusado', '1.234,56', MOTIVO, 'Use só números, com até 2 casas (ex.: 25,50).'],
    ['zero', '0', MOTIVO, 'O valor tem que ser maior que zero.'],
  ])('%s: botão desativado e nenhuma chamada', async (_nome, amount, reason, aviso) => {
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, amount, reason);
    if (aviso) expect(within(sheet).getByText(aviso)).toBeInTheDocument();
    expect(confirm(sheet)).toBeDisabled();
    fireEvent.click(confirm(sheet));
    expect(post).not.toHaveBeenCalled();
  });

  it('limites aceitos: R$ 50.000,00 e motivo de 10 e de 500 caracteres', async () => {
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '50000', 'x'.repeat(10));
    expect(confirm(sheet)).toBeEnabled();
    fill(sheet, '50000', 'x'.repeat(500));
    expect(confirm(sheet)).toBeEnabled();
  });
});

describe('nunca ajusta duas vezes', () => {
  it('erro de rede e reenvio igual: a mesma chave; fechar e abrir de novo gera outra', async () => {
    post.mockRejectedValueOnce({ message: 'Network Error' });
    await openWallet();
    let sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText('Sem conexão com o servidor. Tente de novo.')).toBeInTheDocument();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledTimes(2);
    expect(keys()[0]).toMatch(UUID_V4_RE);
    expect(keys()[1]).toBe(keys()[0]);

    sheet = openAdjust();
    fill(sheet, '1');
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(keys()[2]).toMatch(UUID_V4_RE);
    expect(keys()[2]).not.toBe(keys()[0]);
  });

  it.each([
    ['o valor', (s: HTMLElement) => fill(s, '30')],
    ['o motivo', (s: HTMLElement) => fill(s, '25,50', `${MOTIVO} (corrigido)`)],
    ['a direção', (s: HTMLElement) => fireEvent.click(within(s).getByRole('radio', { name: /Débito/ }))],
  ])('erro de rede e depois muda %s: chave nova (E9)', async (_nome, change) => {
    post.mockRejectedValueOnce({ message: 'Network Error' });
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText('Sem conexão com o servidor. Tente de novo.')).toBeInTheDocument();
    change(sheet);
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(keys()[1]).toMatch(UUID_V4_RE);
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('volta aos valores de uma tentativa anterior na mesma folha: reusa a chave daquela tentativa', async () => {
    post.mockRejectedValueOnce({ message: 'Network Error' });
    post.mockRejectedValueOnce({ message: 'Network Error' });
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    await within(sheet).findByText('Sem conexão com o servidor. Tente de novo.');
    fill(sheet, '30');
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    await within(sheet).findByText('Sem conexão com o servidor. Tente de novo.');
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(keys()[1]).not.toBe(keys()[0]);
    expect(keys()[2]).toBe(keys()[0]);
  });

  it('409 IDEMPOTENCY_KEY_REUSED: mensagem na folha e o próximo envio vai com chave nova', async () => {
    post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Esta chave já foi usada em outro ajuste.', code: 'IDEMPOTENCY_KEY_REUSED', actionId: 'act0' } },
    });
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText(
      'Este ajuste já foi usado com outros valores. Feche e abra de novo para fazer um ajuste novo.',
    )).toBeInTheDocument();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledTimes(2);
    expect(keys()[1]).toMatch(UUID_V4_RE);
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it.each([
    ['replayed de outra carteira', adjusted({ walletId: 'w9' }, { replayed: true })],
    ['ajuste novo de outra carteira', adjusted({ walletId: 'w9' })],
  ])('%s: nunca vira sucesso; erro na folha, saldo intacto', async (_nome, res) => {
    post.mockResolvedValueOnce(res);
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText(
      'O servidor respondeu com o ajuste de outra carteira. Confira o extrato antes de tentar de novo.',
    )).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByText('R$ 143,82')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Ajustar saldo' })).toBeInTheDocument();
  });

  it('409 INSUFFICIENT_BALANCE: mensagem com o saldo de agora, prévia usa esse saldo; valor novo → chave nova', async () => {
    post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Saldo insuficiente para este débito', code: 'INSUFFICIENT_BALANCE', available: 10 } },
    });
    post.mockResolvedValueOnce(adjusted({ direction: 'debit', amount: 5, balanceBefore: 10, balanceAfter: 5 }));
    await openWallet();
    const sheet = openAdjust();
    fireEvent.click(within(sheet).getByRole('radio', { name: /Débito/ }));
    fill(sheet, '18,32');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText('Saldo insuficiente para este débito: a carteira tem R$ 10,00.')).toBeInTheDocument();
    expect(within(sheet).getByText('Maior que o saldo da carteira (R$ 10,00).')).toBeInTheDocument();
    expect(confirm(sheet)).toBeDisabled();
    fill(sheet, '5');
    expect(within(sheet).getByText('Saldo: R$ 10,00 → R$ 5,00')).toBeInTheDocument();
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(keys()[1]).toMatch(UUID_V4_RE);
    expect(keys()[1]).not.toBe(keys()[0]);
  });

  it('repetição que o servidor já tinha gravado (replayed): avisa e mostra o saldo gravado', async () => {
    post.mockResolvedValue(adjusted({}, { message: 'Ajuste já registrado', replayed: true }));
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Este ajuste já estava registrado. Saldo: R$ 143,82.', 'success'));
  });

  it('resposta sem o ajuste: erro na folha, que fica aberta (tentar de novo é seguro)', async () => {
    post.mockResolvedValueOnce({ data: { message: 'ok' } });
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    fireEvent.click(confirm(sheet));
    expect(await within(sheet).findByText('O servidor não confirmou o ajuste. Tente de novo: o mesmo ajuste nunca é aplicado duas vezes.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Ajustar saldo' })).toBeInTheDocument();
  });

  it('clique duplo no mesmo instante manda um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r(adjusted()); }));
    await openWallet();
    const sheet = openAdjust();
    fill(sheet, '25,50');
    const send = confirm(sheet);
    await act(async () => { send.click(); send.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post).toHaveBeenCalledTimes(1);
  });
});

it('extrato: o ajuste aparece como "Ajuste da plataforma" com o motivo na origem', async () => {
  await openWallet();
  expect(screen.getByText('Ajuste da plataforma')).toBeInTheDocument();
  expect(screen.getByText('Ajuste da plataforma: Compensação antiga')).toBeInTheDocument();
  expect(screen.getByText('+R$ 25,00')).toBeInTheDocument();
});
