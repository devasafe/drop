/**
 * D3a · P4.6 — Dinheiro · Repasses (tela 3, custódia).
 * Caracterização: as chamadas da página antiga (passa na antiga e na nova).
 * Tela nova: lote "Liberar N repasses" com runBatch (sequência, falha parcial, "já liberado" pelo status do
 * servidor conta como feito, "Tentar de novo" relê e não reenvia o que saiu da fila, abort ao fechar),
 * permissões de cada botão, leituras que falham sem zero, detalhe com links, celular.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminPayoutsPage from '../pages/admin/payouts';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
let mockCan: (p: string) => boolean = () => true;

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/payouts', asPath: '/admin/payouts' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: any) => <a href={typeof href === 'string' ? href : ''} {...rest}>{children}</a>,
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' },
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

const at = '2026-10-08T13:53:00Z';
const P1 = {
  _id: 'p1', recipientType: 'store', recipientId: 's1', orderId: 'ord000004812', amount: 206.91, status: 'pending', createdAt: at,
  recipient: { id: 's1', name: 'Eletro Center', type: 'store', ownerId: 'u7', ownerName: 'Paulo', ownerEmail: 'paulo@x.com' },
  order: { id: 'ord000004812', total: 250, buyerId: 'u9', buyerName: 'Lia Prado', buyerEmail: 'lia@x.com' },
};
const P2 = { ...P1, _id: 'p2', recipientType: 'motoboy', recipientId: 'm1', amount: 9.92, recipient: { id: 'm1', name: 'Carlos Lima', type: 'motoboy' } };
const P3 = { ...P1, _id: 'p3', orderId: 'ord000004816', amount: 84.15, blocked: true, blockReason: 'Fraude', recipient: { id: 's2', name: 'Pet Bom', type: 'store' } };
const P4 = { ...P1, _id: 'p4', recipientType: 'motoboy', amount: 7.84, status: 'released', recipient: { id: 'm2', name: 'Rafael Torres', type: 'motoboy' } };
const P5 = { ...P1, _id: 'p5', recipientType: 'motoboy', amount: 11.44, recipient: { id: 'm3', name: 'Júlia Santos', type: 'motoboy' } };

let payoutsNow: any[];
type Override = Record<string, () => Promise<unknown>>;
function mockServer(over: Override = {}) {
  get.mockImplementation((url: string) => {
    const key = url.startsWith('/payouts/admin?') ? '/payouts/admin?' : url;
    if (over[key]) return over[key]();
    if (key === '/payouts/admin?') return Promise.resolve({ data: { payouts: payoutsNow, total: payoutsNow.length } });
    if (url === '/payouts/admin/obligations') return Promise.resolve({ data: { pendingObligations: 301 } });
    if (url === '/payouts/admin/config') return Promise.resolve({ data: { autoApprovePayouts: false } });
    if (url.startsWith('/invoices/by-order/')) return Promise.resolve({ data: { _id: 'inv1', invoiceNumber: 'NFS-12' } });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}
const released = () => post.mock.calls.filter(([u]) => /\/release$/.test(u)).map(([u]) => u.split('/')[3]);
const markReleased = (id: string) => { payoutsNow = payoutsNow.map((p) => (p._id === id ? { ...p, status: 'released' } : p)); };

const spies: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  payoutsNow = [P1, P2, P3, P4];
  // só para a página antiga rodar no passo 2 (ela usa confirm, prompt e alert)
  spies.push(jest.spyOn(window, 'confirm').mockImplementation(() => true));
  spies.push(jest.spyOn(window, 'prompt').mockImplementation(() => 'Fraude confirmada'));
  spies.push(jest.spyOn(window, 'alert').mockImplementation(() => undefined));
  mockServer();
  post.mockResolvedValue({ data: { message: 'ok' } });
  put.mockResolvedValue({ data: { autoApprovePayouts: true } });
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
  resetViewport();
});

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('abre lendo a lista (limit=100), as obrigações e a configuração', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    expect(get).toHaveBeenCalledWith('/payouts/admin?limit=100');
    expect(get).toHaveBeenCalledWith('/payouts/admin/obligations');
    expect(get).toHaveBeenCalledWith('/payouts/admin/config');
  });

  it('filtros de situação e tipo vão na query, na mesma ordem', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'pending' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/payouts/admin?status=pending&limit=100'));
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'motoboy' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/payouts/admin?status=pending&recipientType=motoboy&limit=100'));
  });

  it('libera: POST /payouts/admin/:id/release sem corpo', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Liberar' })[0]);
    const ok = screen.queryByRole('button', { name: /^Liberar \d+ repasses?$/ });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payouts/admin/p1/release'));
    expect(post.mock.calls[0]).toHaveLength(1);
  });

  it('bloqueia com motivo: POST /payouts/admin/:id/block { reason }', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
    const field = screen.queryByLabelText('Motivo do bloqueio');
    if (field) {
      fireEvent.change(field, { target: { value: '  Fraude confirmada ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Bloquear repasse' }));
    }
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payouts/admin/p1/block', { reason: 'Fraude confirmada' }));
  });

  it('desbloqueia: POST /payouts/admin/:id/unblock sem corpo', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Pet Bom');
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    const ok = screen.queryByRole('button', { name: 'Confirmar desbloqueio' });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payouts/admin/p3/unblock'));
    expect(post.mock.calls[0]).toHaveLength(1);
  });

  it('liga a liberação automática: PUT /payouts/admin/config { enabled: true }', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click((await screen.findByRole('switch').catch(() => null)) ?? screen.getByRole('checkbox'));
    const ok = screen.queryByRole('button', { name: /^(Ligar|Desligar)$/ });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/payouts/admin/config', { enabled: true }));
  });

  it('detalhe: lê a nota de serviço do pedido', async () => {
    render(<AdminPayoutsPage />);
    fireEvent.click(await screen.findByText('Eletro Center'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/invoices/by-order/ord000004812'));
  });
});

describe('tela nova', () => {
  const selectAllAndConfirm = (n: number) => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    const bar = screen.getByRole('region', { name: 'Itens selecionados' });
    const label = `Liberar ${n} ${n === 1 ? 'repasse' : 'repasses'}`;
    fireEvent.click(within(bar).getByRole('button', { name: label }));
    const sheet = screen.getByRole('dialog', { name: label });
    fireEvent.click(within(sheet).getByRole('button', { name: label }));
    return sheet;
  };

  it('só os pendentes não bloqueados entram na seleção; a barra soma o valor', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    expect(screen.getByRole('region', { name: 'Itens selecionados' })).toHaveTextContent('2 selecionados · R$ 216,83');
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Pet Bom' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Rafael Torres' })).not.toBeInTheDocument();
  });

  it('confirmação mostra a soma por tipo', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Itens selecionados' })).getByRole('button', { name: 'Liberar 2 repasses' }));
    const sheet = screen.getByRole('dialog', { name: 'Liberar 2 repasses' });
    expect(sheet).toHaveTextContent('1 loja (R$ 206,91) · 1 motoboy (R$ 9,92)');
    expect(post).not.toHaveBeenCalled();
  });

  it('lote: em sequência; falha parcial não para os outros; "já liberado" (status do servidor) conta como feito; só reenvia o que falhou', async () => {
    payoutsNow = [P1, P2, P5, P3, P4];
    post.mockImplementation((url: string) => {
      const id = url.split('/')[3];
      if (id === 'p1') { markReleased('p1'); return Promise.resolve({ data: {} }); }
      if (id === 'p2') {
        markReleased('p2');
        return Promise.reject({ response: { status: 502, data: { error: 'Transferência no Asaas não concluída: Payout não está pendente (status atual: released)' } } });
      }
      return Promise.reject({ response: { status: 502, data: { error: 'Transferência no Asaas não concluída: Recebedor sem subconta Asaas configurada' } } });
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(3);
    expect(await screen.findByText('Lote: 2 concluídos, 1 com erro')).toBeInTheDocument();
    expect(released()).toEqual(['p1', 'p2', 'p5']);
    expect(screen.getByText('Júlia Santos: Transferência no Asaas não concluída: Recebedor sem subconta Asaas configurada')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('2 concluídos, 1 com erro', 'error');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(released()).toEqual(['p1', 'p2', 'p5', 'p5']));
  });

  it('erro sem status (modo legado): "Tentar de novo" relê e não reenvia o que já não está aguardando', async () => {
    payoutsNow = [P1, P3, P4];
    post.mockImplementation(() => {
      markReleased('p1'); // o servidor liberou, mas a resposta não chegou como sucesso
      return Promise.reject({ response: { status: 400, data: { error: 'Payout p1 não encontrado ou não está pending' } } });
    });
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(1);
    expect(await screen.findByText('Lote: 0 concluídos, 1 com erro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    expect(await screen.findByText('1 repasse já não estava aguardando liberação e não foi reenviado.')).toBeInTheDocument();
    expect(released()).toEqual(['p1']);
  });

  it('fechar a tela no meio para o lote', async () => {
    payoutsNow = [P1, P2, P5];
    let release!: () => void;
    post.mockImplementation((url: string) => (url === '/payouts/admin/p1/release'
      ? new Promise((r) => { release = () => r({ data: {} }); })
      : Promise.resolve({ data: {} })));
    const { unmount } = render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    selectAllAndConfirm(3);
    await waitFor(() => expect(released()).toEqual(['p1']));
    unmount();
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(released()).toEqual(['p1']);
  });

  it('só payout:view: sem seleção, liberar, bloquear, desbloquear nem chave de liberação automática', async () => {
    mockCan = (p) => p === 'payout:view';
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    for (const name of ['Liberar', 'Bloquear', 'Desbloquear']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(await screen.findByText('desligada')).toBeInTheDocument();
  });

  it('payout:release sem payout:block: libera, mas não bloqueia nem desbloqueia', async () => {
    mockCan = (p) => ['payout:view', 'payout:release'].includes(p);
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    expect(screen.getAllByRole('button', { name: 'Liberar' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument();
  });

  it('lista que falha: erro com "Tentar de novo", sem repasses', async () => {
    mockServer({ '/payouts/admin?': () => Promise.reject(new Error('500')) });
    render(<AdminPayoutsPage />);
    expect(await screen.findByText('Não deu para carregar os repasses.')).toBeInTheDocument();
    expect(screen.queryByText('Eletro Center')).not.toBeInTheDocument();
  });

  it('obrigações que falham: "—" e erro com "Tentar de novo", nunca R$ 0,00', async () => {
    let fail = true;
    mockServer({ '/payouts/admin/obligations': () => (fail ? Promise.reject(new Error('500')) : Promise.resolve({ data: { pendingObligations: 301 } })) });
    render(<AdminPayoutsPage />);
    expect(await screen.findByText('Não deu para ler as obrigações pendentes.')).toBeInTheDocument();
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('R$ 301,00')).toBeInTheDocument();
  });

  it('liberação automática que não carrega: erro e nenhuma chave', async () => {
    mockServer({ '/payouts/admin/config': () => Promise.reject(new Error('500')) });
    render(<AdminPayoutsPage />);
    expect(await screen.findByText('Não deu para ler a liberação automática.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('bloquear exige motivo (AdminSheet, sem prompt)', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Bloquear repasse' });
    expect(within(sheet).getByRole('button', { name: 'Bloquear repasse' })).toBeDisabled();
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('detalhe: links para o pedido, o cliente, a loja e a nota de serviço', async () => {
    render(<AdminPayoutsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Eletro Center/ }));
    const sheet = screen.getByRole('dialog', { name: 'Detalhes do repasse' });
    expect(within(sheet).getByRole('link', { name: '#004812' })).toHaveAttribute('href', '/order/ord000004812');
    expect(within(sheet).getByRole('link', { name: 'Lia Prado' })).toHaveAttribute('href', '/user/u9');
    expect(within(sheet).getByRole('link', { name: 'Eletro Center' })).toHaveAttribute('href', '/stores/s1');
    expect(await within(sheet).findByRole('link', { name: 'NFS-12' })).toHaveAttribute('href', '/invoice/inv1');
  });

  it('celular: cartões; a barra do lote aparece ao marcar', async () => {
    setViewportWidth(360);
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Eletro Center' }));
    expect(screen.getByRole('region', { name: 'Itens selecionados' })).toHaveTextContent('1 selecionado · R$ 206,91');
  });
});

describe('dinheiro: nada liberado duas vezes', () => {
  const openBatchSheet = (n: number) => {
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }));
    const label = `Liberar ${n} ${n === 1 ? 'repasse' : 'repasses'}`;
    fireEvent.click(within(screen.getByRole('region', { name: 'Itens selecionados' })).getByRole('button', { name: label }));
    return within(screen.getByRole('dialog', { name: label })).getByRole('button', { name: label });
  };

  it('clique duplo em "Liberar N repasses" (mesmo instante): um lote só, cada repasse enviado uma vez', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    const btn = openBatchSheet(2);
    await act(async () => { btn.click(); btn.click(); });
    expect(await screen.findByText('Lote: 2 concluídos')).toBeInTheDocument();
    expect(released()).toEqual(['p1', 'p2']);
  });

  it('"Liberar" da linha: lote de 1; clique duplo na confirmação manda um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Liberar' })[0]);
    const btn = within(screen.getByRole('dialog', { name: 'Liberar 1 repasse' })).getByRole('button', { name: 'Liberar 1 repasse' });
    await act(async () => { btn.click(); btn.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(await screen.findByText('Lote: 1 concluído')).toBeInTheDocument();
    expect(released()).toEqual(['p1']);
  });

  it('clique duplo em "Tentar de novo os que falharam": reenvia uma vez só', async () => {
    payoutsNow = [P1, P3, P4];
    let fail = true;
    post.mockImplementation(() => (fail
      ? Promise.reject({ response: { status: 502, data: { error: 'Transferência no Asaas não concluída: Recebedor sem subconta Asaas configurada' } } })
      : Promise.resolve({ data: {} })));
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    const btn = openBatchSheet(1);
    fireEvent.click(btn);
    await screen.findByText('Lote: 0 concluídos, 1 com erro');
    fail = false;
    const retry = screen.getByRole('button', { name: 'Tentar de novo os que falharam' });
    await act(async () => { retry.click(); retry.click(); });
    expect(await screen.findByText('Lote: 1 concluído')).toBeInTheDocument();
    expect(released()).toEqual(['p1', 'p1']);
  });

  it('o lote fica preso à seleção: repasse que saiu da fila antes da confirmação falha sem POST', async () => {
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    const btn = openBatchSheet(2);
    markReleased('p1'); // outra pessoa liberou enquanto a folha estava aberta
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'store' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/payouts/admin?recipientType=store&limit=100'));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Selecionar Eletro Center' })).not.toBeInTheDocument());
    fireEvent.click(btn);
    expect(await screen.findByText('Lote: 1 concluído, 1 com erro')).toBeInTheDocument();
    expect(released()).toEqual(['p2']);
    expect(screen.getByText('Recebedor: Esse repasse não está mais na lista. Atualize a lista.')).toBeInTheDocument();
  });

  it('bloquear: dois cliques no mesmo instante mandam um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]);
    const sheet = screen.getByRole('dialog', { name: 'Bloquear repasse' });
    fireEvent.change(within(sheet).getByLabelText('Motivo do bloqueio'), { target: { value: 'Fraude' } });
    const send = within(sheet).getByRole('button', { name: 'Bloquear repasse' });
    await act(async () => { send.click(); send.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post.mock.calls.filter(([u]) => u === '/payouts/admin/p1/block')).toHaveLength(1);
  });

  it('desbloquear: dois cliques no mesmo instante mandam um POST só', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminPayoutsPage />);
    await screen.findByText('Pet Bom');
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    const send = within(screen.getByRole('dialog', { name: 'Desbloquear repasse' })).getByRole('button', { name: 'Confirmar desbloqueio' });
    await act(async () => { send.click(); send.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(post.mock.calls.filter(([u]) => u === '/payouts/admin/p3/unblock')).toHaveLength(1);
  });

  it('liberação automática: dois cliques no mesmo instante mandam um PUT só', async () => {
    let release!: () => void;
    put.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(await screen.findByRole('switch'));
    const send = within(screen.getByRole('dialog', { name: 'Ligar a liberação automática?' })).getByRole('button', { name: 'Ligar' });
    await act(async () => { send.click(); send.click(); });
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(put).toHaveBeenCalledTimes(1);
  });
  it('fechar a tela durante a releitura do "Tentar de novo": nenhum POST novo depois', async () => {
    payoutsNow = [P1, P3, P4];
    let hang = false;
    let releaseGet!: () => void;
    mockServer({
      '/payouts/admin?': () => (hang
        ? new Promise((r) => { releaseGet = () => r({ data: { payouts: payoutsNow, total: payoutsNow.length } }); })
        : Promise.resolve({ data: { payouts: payoutsNow, total: payoutsNow.length } })),
    });
    post.mockImplementation(() => Promise.reject({ response: { status: 502, data: { error: 'Transferência no Asaas não concluída: Recebedor sem subconta Asaas configurada' } } }));
    const { unmount } = render(<AdminPayoutsPage />);
    await screen.findByText('Eletro Center');
    fireEvent.click(openBatchSheet(1));
    await screen.findByText('Lote: 0 concluídos, 1 com erro');
    expect(released()).toEqual(['p1']);
    post.mockResolvedValue({ data: {} });
    hang = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(releaseGet).toBeDefined());
    unmount();
    await act(async () => { releaseGet(); await new Promise((r) => setTimeout(r, 0)); });
    expect(released()).toEqual(['p1']);
  });
});
