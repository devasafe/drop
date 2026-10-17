/**
 * D3a · P4.5 — Dinheiro · Saques (telas 16 e 29).
 * Caracterização: as chamadas da página antiga (passa na antiga e na nova).
 * Tela nova: lote "Aprovar e pagar N" com runBatch (sequência, falha parcial, 409 WITHDRAWAL_NOT_PENDING conta
 * como feito e não é reenviado, incerto nunca é reenviado, abort ao fechar), permissões de cada botão,
 * leituras que falham sem zero, saque incerto com 409 WITHDRAWAL_NOT_RESOLVABLE, celular.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminWithdrawalsPage from '../pages/admin/withdrawals';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
const mockPush = jest.fn();
let mockRole = 'ceo';
let mockCan: (p: string) => boolean = () => true;

jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/admin/withdrawals', asPath: '/admin/withdrawals' }),
}));
// O usuário é o mesmo objeto entre renderizações (como no AuthContext real): a página relê ao trocar de usuário.
const mockUsers: Record<string, unknown> = {};
const mockUserFor = (role: string) => (mockUsers[role] ??= { id: 'adm1', name: 'Asafe', role, activeRole: role });
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUserFor(mockRole),
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;

const at = '2026-10-08T10:00:00Z';
const W1 = {
  _id: 'w1', motoboyName: 'Zé', motoboyEmail: 'ze@x.com', amount: 25, status: 'pending', requestedAt: at,
  bankAccount: { bankName: 'Nubank', accountType: 'checking', routingNumber: '0001', accountNumber: '123-4', ownerName: 'José' },
};
const W2 = { ...W1, _id: 'w2', motoboyName: 'Ana', motoboyEmail: 'ana@x.com', amount: 30, bankAccount: null };
const W3 = { ...W1, _id: 'w3', motoboyName: 'Bia', motoboyEmail: 'bia@x.com', amount: 40, bankAccount: null };
const INCERTO = { ...W1, _id: 'w9', motoboyName: 'Caio', status: 'approved', uncertainAt: at, approvedAt: new Date().toISOString() };

let pendingNow: any[];
let allNow: any[];
type Override = Record<string, () => Promise<unknown>>;
function mockServer(over: Override = {}) {
  get.mockImplementation((url: string) => {
    if (over[url]) return over[url]();
    if (url === '/withdrawals/pending') return Promise.resolve({ data: pendingNow });
    if (url === '/withdrawals/all') return Promise.resolve({ data: { withdrawals: allNow } });
    if (url === '/withdrawals/ceo-wallet') return Promise.resolve({ data: { balance: 1200, transactions: [] } });
    if (url === '/withdrawals/admin/config') return Promise.resolve({ data: { autoApproveWithdrawals: false } });
    if (url === '/admin/asaas/balance') return Promise.resolve({ data: { balance: 24918.3, apiUrl: 'https://sandbox.asaas.com/api/v3' } });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}
const approveIds = () => post.mock.calls.filter(([u]) => u === '/withdrawals/approve').map(([, b]) => b.withdrawalId);

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'ceo';
  mockCan = () => true;
  pendingNow = [W1];
  allNow = [W1];
  // só para a página antiga rodar no passo 2 (ela usa confirm na aprovação automática)
  spies.push(jest.spyOn(window, 'confirm').mockImplementation(() => true));
  mockServer();
  post.mockResolvedValue({ data: { message: 'Subconta abastecida!', withdrawal: {}, ceoWallet: { balance: 0 } } });
  put.mockResolvedValue({ data: { autoApproveWithdrawals: true } });
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  resetViewport();
});

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('abre lendo pendentes, histórico, carteira do CEO e a configuração', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    for (const url of ['/withdrawals/pending', '/withdrawals/all', '/withdrawals/ceo-wallet', '/withdrawals/admin/config']) {
      expect(get).toHaveBeenCalledWith(url);
    }
  });

  it('aprova: POST /withdrawals/approve { withdrawalId }', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getAllByRole('button', { name: /^(Aprovar|Aprovar e pagar)$/ })[0]);
    const ok = screen.queryByRole('button', { name: /^Aprovar e pagar \d+$/ });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/approve', { withdrawalId: 'w1' }));
  });

  it('recusa com motivo: POST /withdrawals/reject { withdrawalId, reason }', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: /^(Rejeitar|Recusar)$/ }));
    fireEvent.change(screen.getByPlaceholderText('Ex: Dados bancários incorretos'), { target: { value: 'Conta errada' } });
    fireEvent.click(screen.getByRole('button', { name: /^(Confirmar|Recusar saque)$/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/withdrawals/reject', { withdrawalId: 'w1', reason: 'Conta errada' }));
  });

  it('liga a aprovação automática: PUT /withdrawals/admin/config { enabled: true }', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.queryByRole('switch') ?? screen.getByRole('checkbox'));
    const ok = screen.queryByRole('button', { name: /^(Ligar|Desligar)$/ });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/withdrawals/admin/config', { enabled: true }));
  });

  it('"Ver saldo" lê GET /admin/asaas/balance', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: 'Ver saldo' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/asaas/balance'));
  });

  it('abastece subconta: POST /admin/asaas/fund-subaccount { recipientType, recipientId, amount }', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.change(screen.getByPlaceholderText('ID do recebedor'), { target: { value: '  m9 ' } });
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '12,5' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Abastecer subconta' })[0]);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/asaas/fund-subaccount', {
      recipientType: 'motoboy', recipientId: 'm9', amount: 12.5,
    }));
  });
});

describe('tela nova', () => {
  const selectAllAndConfirm = async (n: number) => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    const bar = screen.getByRole('region', { name: 'Itens selecionados' });
    fireEvent.click(within(bar).getByRole('button', { name: `Aprovar e pagar ${n}` }));
    const sheet = screen.getByRole('dialog', { name: `Aprovar e pagar ${n} ${n === 1 ? 'saque' : 'saques'}` });
    // a folha libera o botão numa microtarefa depois do clique: dentro do act, sem aviso
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: `Aprovar e pagar ${n}` })); });
  };

  it('lote: em sequência; falha parcial não para os outros; "já saiu da fila" (409) conta como feito; só reenvia o que falhou', async () => {
    pendingNow = [W1, W2, W3];
    post.mockImplementation((url: string, body: any) => {
      if (url !== '/withdrawals/approve') return Promise.resolve({ data: {} });
      if (body.withdrawalId === 'w1') {
        pendingNow = pendingNow.filter((w) => w._id !== 'w1');
        return Promise.resolve({ data: { withdrawal: {} } });
      }
      if (body.withdrawalId === 'w2') {
        pendingNow = pendingNow.filter((w) => w._id !== 'w2');
        return Promise.reject({ response: { status: 409, data: { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'processed' } } });
      }
      return Promise.reject({ response: { status: 502, data: { error: 'Falha na transferência do saque: chave inválida' } } });
    });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByRole('region', { name: 'Itens selecionados' })).toHaveTextContent('3 selecionados · R$ 95,00');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    await selectAllAndConfirm(3);

    expect(await screen.findByText('Lote: 2 concluídos, 1 com erro')).toBeInTheDocument();
    expect(approveIds()).toEqual(['w1', 'w2', 'w3']);
    expect(screen.getByText('Bia: Falha na transferência do saque: chave inválida')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('2 concluídos, 1 com erro', 'error');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(approveIds()).toEqual(['w1', 'w2', 'w3', 'w3']));
  });

  it.each([
    ['approved', 'Zé: Em andamento: este saque já está sendo pago. Se não concluir, ele aparece em Incertos.'],
    ['rejected', 'Zé: Este saque já foi rejeitado.'],
  ])('409 WITHDRAWAL_NOT_PENDING com currentStatus %s é falha com mensagem própria (E8)', async (currentStatus, msg) => {
    post.mockRejectedValue({ response: { status: 409, data: { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING', currentStatus } } });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(1);
    expect(await screen.findByText('Lote: 0 concluídos, 1 com erro')).toBeInTheDocument();
    expect(screen.getByText(msg)).toBeInTheDocument();
  });

  it('resultado incerto (502 WITHDRAWAL_UNCERTAIN) nunca entra no "Tentar de novo"', async () => {
    post.mockRejectedValue({ response: { status: 502, data: { error: 'Resposta incerta do gateway', code: 'WITHDRAWAL_UNCERTAIN' } } });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(1);
    expect(await screen.findByText('Lote: 0 concluídos, 1 com erro')).toBeInTheDocument();
    expect(screen.getByText(/^Zé: resultado incerto no Asaas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo os que falharam' })).not.toBeInTheDocument();
    expect(approveIds()).toEqual(['w1']);
  });

  it('"Tentar de novo" relê a lista e não reenvia o que já saiu da fila', async () => {
    post.mockImplementation((url: string) => {
      if (url !== '/withdrawals/approve') return Promise.resolve({ data: {} });
      return Promise.reject({ response: { status: 502, data: { error: 'Falha na transferência do saque' } } });
    });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(1);
    await screen.findByText('Lote: 0 concluídos, 1 com erro');
    pendingNow = []; // outra pessoa recusou o saque enquanto isso
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    expect(await screen.findByText('1 saque já não estava pendente e não foi reenviado.')).toBeInTheDocument();
    expect(approveIds()).toEqual(['w1']);
    // fora da lista não é "feito": continua como erro e sai do "Tentar de novo"
    expect(screen.getByText('Lote: 0 concluídos, 1 com erro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo os que falharam' })).not.toBeInTheDocument();
  });

  it('fechar a tela no meio para o lote (o que falta não é enviado)', async () => {
    pendingNow = [W1, W2, W3];
    let release!: () => void;
    post.mockImplementation((url: string, body: any) => {
      if (url === '/withdrawals/approve' && body.withdrawalId === 'w1') {
        return new Promise((r) => { release = () => r({ data: {} }); });
      }
      return Promise.resolve({ data: {} });
    });
    const { unmount } = render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(3);
    await waitFor(() => expect(approveIds()).toEqual(['w1']));
    unmount();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(approveIds()).toEqual(['w1']);
  });

  it('saque incerto já resolvido por outra pessoa (409 WITHDRAWAL_NOT_RESOLVABLE): erro na folha, não fecha, lista relida', async () => {
    allNow = [INCERTO];
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Saque não está incerto nem travado', code: 'WITHDRAWAL_NOT_RESOLVABLE' } } });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolver saque incerto' }));
    const sheet = screen.getByRole('dialog', { name: 'Resolver saque incerto' });
    fireEvent.click(within(sheet).getByLabelText('O Pix não saiu (voltar para pendente)'));
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'Nada no extrato do Asaas' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar resolução' }));
    expect(await within(sheet).findByText('Este saque já foi resolvido (ou não está mais incerto). A lista foi atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/withdrawals/all')).toHaveLength(2));
    expect(screen.getByRole('dialog', { name: 'Resolver saque incerto' })).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('só withdrawal:view: sem seleção, sem aprovar, recusar, trocar a aprovação automática, ver saldo ou abastecer', async () => {
    mockRole = 'gerente_geral';
    mockCan = (p) => p === 'withdrawal:view';
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    for (const name of ['Aprovar e pagar', 'Recusar', 'Abastecer para este saque', 'Ver saldo', 'Abastecer subconta']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(await screen.findByText('desligada')).toBeInTheDocument();
  });

  it('gerente com todas as permissões delegáveis: aprova e vê saldo, mas não abastece (wallet:credit é só do CEO)', async () => {
    mockRole = 'gerente_geral';
    mockCan = () => true;
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    expect(screen.getByRole('button', { name: 'Aprovar e pagar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver saldo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abastecer subconta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abastecer para este saque' })).not.toBeInTheDocument();
  });

  it('sem withdrawal:view: vai para /access-denied e não lê nada', async () => {
    mockCan = () => false;
    mockRole = 'gerente_geral';
    const { container } = render(<AdminWithdrawalsPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/access-denied'));
    expect(get).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('leitura falha: erro com "Tentar de novo", sem zero', async () => {
    let fail = true;
    mockServer({ '/withdrawals/pending': () => (fail ? Promise.reject(new Error('500')) : Promise.resolve({ data: pendingNow })) });
    render(<AdminWithdrawalsPage />);
    expect(await screen.findByText('Não deu para carregar os saques.')).toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Zé')).toBeInTheDocument();
  });

  it('aprovação automática que não carrega: erro e nenhuma chave (nunca "desligada" por engano)', async () => {
    mockServer({ '/withdrawals/admin/config': () => Promise.reject(new Error('500')) });
    render(<AdminWithdrawalsPage />);
    expect(await screen.findByText('Não deu para ler a aprovação automática.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('trocar a aprovação automática pede confirmação na AdminSheet', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('switch', { name: 'Aprovação automática de saques' }));
    expect(put).not.toHaveBeenCalled();
    const sheet = screen.getByRole('dialog', { name: 'Ligar a aprovação automática?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/withdrawals/admin/config', { enabled: true }));
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('saldo do Asaas que falha: mostra o erro, nunca zero', async () => {
    mockServer({ '/admin/asaas/balance': () => Promise.reject({ response: { status: 500, data: { error: 'Asaas fora do ar' } } }) });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: 'Ver saldo' }));
    expect(await screen.findByText('Asaas fora do ar')).toBeInTheDocument();
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
  });

  it('CEO: "Abastecer para este saque" confirma e chama POST /admin/asaas/fund-for-withdrawal', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: 'Abastecer para este saque' }));
    const sheet = screen.getByRole('dialog', { name: 'Abastecer subconta' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar abastecimento' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/asaas/fund-for-withdrawal', { withdrawalId: 'w1' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Subconta abastecida!', 'success'));
  });

  it('recusar: motivo obrigatório; 409 WITHDRAWAL_NOT_PENDING aparece na folha e relê a lista', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Saque não está pendente', code: 'WITHDRAWAL_NOT_PENDING' } } });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    const sheet = screen.getByRole('dialog', { name: 'Recusar saque de Zé' });
    const send = within(sheet).getByRole('button', { name: 'Recusar saque' });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Motivo da recusa'), { target: { value: 'Conta errada' } });
    fireEvent.click(send);
    expect(await within(sheet).findByText('Saque não está pendente')).toBeInTheDocument();
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/withdrawals/pending')).toHaveLength(2));
  });

  it('clique duplo em "Aprovar e pagar N" (mesmo instante): um lote só, cada saque enviado uma vez', async () => {
    pendingNow = [W1, W2];
    post.mockResolvedValue({ data: {} });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Itens selecionados' })).getByRole('button', { name: 'Aprovar e pagar 2' }));
    const btn = within(screen.getByRole('dialog', { name: 'Aprovar e pagar 2 saques' })).getByRole('button', { name: 'Aprovar e pagar 2' });
    await act(async () => { btn.click(); btn.click(); });
    expect(await screen.findByText('Lote: 2 concluídos')).toBeInTheDocument();
    expect(approveIds()).toEqual(['w1', 'w2']);
  });

  it('clique duplo em "Tentar de novo os que falharam": reenvia uma vez só', async () => {
    let fail = true;
    post.mockImplementation((url: string) => {
      if (url !== '/withdrawals/approve') return Promise.resolve({ data: {} });
      return fail ? Promise.reject({ response: { status: 502, data: { error: 'Falha na transferência do saque' } } }) : Promise.resolve({ data: {} });
    });
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(1);
    await screen.findByText('Lote: 0 concluídos, 1 com erro');
    fail = false;
    const retry = screen.getByRole('button', { name: 'Tentar de novo os que falharam' });
    await act(async () => { retry.click(); retry.click(); });
    expect(await screen.findByText('Lote: 1 concluído')).toBeInTheDocument();
    expect(approveIds()).toEqual(['w1', 'w1']);
  });

  it('recusar: dois cliques no mesmo instante mandam um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    const sheet = screen.getByRole('dialog', { name: 'Recusar saque de Zé' });
    fireEvent.change(within(sheet).getByLabelText('Motivo da recusa'), { target: { value: 'Conta errada' } });
    const send = within(sheet).getByRole('button', { name: 'Recusar saque' });
    await act(async () => { send.click(); send.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post.mock.calls.filter(([u]) => u === '/withdrawals/reject')).toHaveLength(1);
  });

  it('abastecer subconta: valor só no formato aceito, com prévia antes de enviar', async () => {
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.change(screen.getByPlaceholderText('ID do recebedor'), { target: { value: 'm9' } });
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '1.234,56' } });
    expect(screen.getByText('Use só números, com até 2 casas (ex.: 25,50).')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abastecer subconta' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '12,5' } });
    expect(screen.getByText('Vai transferir: R$ 12,50')).toBeInTheDocument();
  });

  it('abastecer subconta: dois cliques no mesmo instante mandam um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: { message: 'ok' } }); }));
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.change(screen.getByPlaceholderText('ID do recebedor'), { target: { value: 'm9' } });
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '10' } });
    const btn = screen.getByRole('button', { name: 'Abastecer subconta' });
    await act(async () => { btn.click(); btn.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post.mock.calls.filter(([u]) => u === '/admin/asaas/fund-subaccount')).toHaveLength(1);
  });

  it('resolver saque incerto: dois cliques no mesmo instante mandam um POST só', async () => {
    allNow = [INCERTO];
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resolver saque incerto' }));
    const sheet = screen.getByRole('dialog', { name: 'Resolver saque incerto' });
    fireEvent.click(within(sheet).getByLabelText('O Pix saiu (concluir o saque)'));
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'Conferido no painel: DONE' } });
    const btn = within(sheet).getByRole('button', { name: 'Confirmar resolução' });
    await act(async () => { btn.click(); btn.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post.mock.calls.filter(([u]) => u === '/withdrawals/w9/resolve-uncertain')).toHaveLength(1);
  });

  it('celular: pedidos em cartões e a barra do lote aparece ao marcar', async () => {
    setViewportWidth(360);
    render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByText('Zé').closest('li')!;
    fireEvent.click(within(card).getByRole('checkbox', { name: 'Selecionar Zé' }));
    expect(screen.getByRole('region', { name: 'Itens selecionados' })).toHaveTextContent('1 selecionado · R$ 25,00');
  });
  it('fechar a tela durante a releitura do "Tentar de novo": nenhum POST novo depois', async () => {
    pendingNow = [W1];
    let hang = false;
    let releaseGet!: () => void;
    mockServer({
      '/withdrawals/pending': () => (hang
        ? new Promise((r) => { releaseGet = () => r({ data: pendingNow }); })
        : Promise.resolve({ data: pendingNow })),
    });
    post.mockImplementation((url: string) => (url === '/withdrawals/approve'
      ? Promise.reject({ response: { status: 502, data: { error: 'Falha na transferência do saque' } } })
      : Promise.resolve({ data: {} })));
    const { unmount } = render(<AdminWithdrawalsPage />);
    await screen.findByText('Zé');
    await selectAllAndConfirm(1);
    await screen.findByText('Lote: 0 concluídos, 1 com erro');
    expect(approveIds()).toEqual(['w1']);
    post.mockResolvedValue({ data: {} });
    hang = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(releaseGet).toBeDefined());
    unmount();
    await act(async () => { releaseGet(); await new Promise((r) => setTimeout(r, 0)); });
    expect(approveIds()).toEqual(['w1']);
  });
});
