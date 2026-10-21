/**
 * D3b-2a · P3.3 — ficha da pessoa (spec 6, 7 e 11). Blocos só quando vieram (motoboy, lojas, carteira, ganhos);
 * ações só com `can`; Bloquear com motivo obrigatório; Desbloquear com motivo opcional; Desconectar; Papéis;
 * Perdoar com o valor visível e 409 DEBT_NOT_PENDING; nota no topo do histórico; "Carregar mais" do histórico;
 * releitura silenciosa depois de cada ação (e o aviso quando ela falha); erro da 1ª leitura; barra fixa a 393 px.
 * Porta as chamadas de admin-users.char (D3a): mesmos métodos e corpos, agora a partir da ficha.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import AdminUserFichaPage from '../pages/admin/users/[id]';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { id: 'p1' }, isReady: true, pathname: '/admin/users/[id]', asPath: '/admin/users/p1' }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const put = api.put as jest.Mock;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const MOTOBOY = {
  cnh: '12345678900', plate: 'ABC1D23', hasPixKey: true,
  deliveries30d: 42, earnings30d: 980.5,
};
const DETAIL = {
  profile: {
    id: 'p1', name: 'Ana Souza', email: 'ana@x.com', phoneLast4: '4321', roles: ['cliente', 'motoboy'], status: 'active',
    block: null, createdAt: '2026-01-02T12:00:00.000Z', lastSeenAt: ago(10),
  },
  verification: [
    { kind: 'document', status: 'approved', reason: null, at: '2026-02-01T12:00:00.000Z' },
    { kind: 'courier', status: 'rejected', reason: 'CNH ilegível', at: '2026-02-02T12:00:00.000Z' },
  ],
  orders: [{ id: 'ord00000a1b2c3', status: 'entregue', total: 58.9, createdAt: '2026-10-19T12:00:00.000Z', store: { id: 's1', name: 'Sabor da Vila' } }],
  debts: [
    { id: 'd1', amount: 12.5, status: 'pending', reason: 'Cancelamento depois do aceite', sourceOrderId: 'o9', createdAt: '2026-10-10T12:00:00.000Z', forgivenAt: null },
    { id: 'd2', amount: 8, status: 'collected', reason: 'Cancelamento depois do aceite', sourceOrderId: 'o8', createdAt: '2026-09-10T12:00:00.000Z', forgivenAt: null },
  ],
  motoboy: MOTOBOY,
  wallets: {
    cliente: { balance: 120, available: 100, pending: 20, blocked: 0 },
    motoboy: { balance: 300, available: 250, pending: 50, blocked: 0 },
  },
  timeline: {
    items: [
      { id: 't2', type: 'note', reason: 'Ligou reclamando do motoboy', meta: null, createdAt: '2026-10-20T13:00:00.000Z', actor: { id: 'a1', name: 'Marina Rocha', role: 'ceo' } },
      { id: 't1', type: 'roles_change', reason: null, meta: { before: ['cliente'], after: ['cliente', 'motoboy'] }, createdAt: '2026-10-01T13:00:00.000Z', actor: { id: 'a2', name: 'Gil Gerente', role: 'gerente_geral' } },
    ],
    nextCursor: 'tc1',
  },
  can: { block: true, unblock: false, disconnect: true, roles: true, forgiveDebt: true, note: true },
};
const BLOQUEADA = {
  ...DETAIL,
  profile: { ...DETAIL.profile, status: 'blocked', block: { reason: 'Fraude no cupom', at: '2026-10-19T12:00:00.000Z', by: { id: 'u1', name: 'Marina Rocha' } } },
  can: { ...DETAIL.can, block: false, unblock: true },
};

const renderFicha = (auth = adminAuth('ceo')) => renderAdminPage(<AdminUserFichaPage />, auth);
const region = (name: string) => screen.getByRole('region', { name });
const acoes = () => screen.getByRole('group', { name: 'Ações da conta' });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: DETAIL });
  put.mockResolvedValue({ data: {} });
  post.mockResolvedValue({ data: {} });
});
afterEach(() => resetViewport());

describe('ficha · blocos', () => {
  it('lê GET /admin/users/:id e mostra os blocos que vieram', async () => {
    renderFicha();
    const pessoa = await screen.findByRole('region', { name: 'Pessoa' });
    expect(get).toHaveBeenCalledWith('/admin/users/p1');
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Souza' })).toBeInTheDocument();
    expect(within(pessoa).getByText('ana@x.com')).toBeInTheDocument();
    expect(within(pessoa).getByText('•••• 4321')).toBeInTheDocument();
    expect(within(pessoa).getByText('Motoboy')).toBeInTheDocument();
    expect(within(pessoa).getByText('Ativo')).toBeInTheDocument();
    expect(within(pessoa).getByText('há 10 min')).toBeInTheDocument();
    expect(within(pessoa).getByText('02/01/2026')).toBeInTheDocument();

    const verif = region('Verificação');
    expect(within(verif).getByText('Documento')).toBeInTheDocument();
    expect(within(verif).getByText('Aprovado')).toBeInTheDocument();
    expect(within(verif).getByText('CNH e veículo')).toBeInTheDocument();
    expect(within(verif).getByText('CNH ilegível')).toBeInTheDocument();

    const dividas = region('Dívidas');
    expect(within(dividas).getByText('R$ 12,50')).toBeInTheDocument();
    expect(within(dividas).getByText('Pendente')).toBeInTheDocument();
    expect(within(dividas).getByText('R$ 8,00')).toBeInTheDocument();
    expect(within(dividas).getByText('Cobrada')).toBeInTheDocument();

    expect(within(region('Pedidos')).getByRole('link', { name: '#a1b2c3 · Sabor da Vila' }))
      .toHaveAttribute('href', '/admin/pedidos/ord00000a1b2c3');

    const moto = region('Motoboy');
    expect(within(moto).getByText('12345678900')).toBeInTheDocument();
    expect(within(moto).getByText('ABC1D23')).toBeInTheDocument();
    expect(within(moto).queryByText('Áreas')).toBeNull();
    expect(within(moto).getByText('Tem chave')).toBeInTheDocument();
    expect(within(moto).getByText('42')).toBeInTheDocument();
    expect(within(moto).getByText('R$ 980,50')).toBeInTheDocument();

    expect(within(region('Carteira de compras')).getByText('R$ 120,00')).toBeInTheDocument();
    expect(within(region('Carteira de entregas')).getByText('R$ 300,00')).toBeInTheDocument();
    expect(within(region('Carteira de compras')).queryByText('R$ 300,00')).toBeNull();

    const hist = region('Histórico');
    expect(within(hist).getByText('Ligou reclamando do motoboy')).toBeInTheDocument();
    expect(within(hist).getByText('Cliente → Motoboy')).toBeInTheDocument();

    expect(screen.queryByRole('region', { name: 'Lojas' })).toBeNull();
  });

  it('sem permissão de dinheiro o servidor não manda carteira nem ganhos: a tela não mostra nada no lugar', async () => {
    const { earnings30d, ...semGanhos } = MOTOBOY;
    const { wallets, ...semCarteira } = DETAIL;
    get.mockResolvedValue({ data: { ...semCarteira, motoboy: semGanhos } });
    renderFicha();
    const moto = await screen.findByRole('region', { name: 'Motoboy' });
    expect(within(moto).getByText('Entregas em 30 dias')).toBeInTheDocument();
    expect(within(moto).queryByText('Ganhos em 30 dias')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Carteira de compras' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Carteira de entregas' })).toBeNull();
  });

  it('carteira null não vira cartão: só a de compras aparece', async () => {
    get.mockResolvedValue({ data: { ...DETAIL, wallets: { ...DETAIL.wallets, motoboy: null } } });
    renderFicha();
    expect(await screen.findByRole('region', { name: 'Carteira de compras' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Carteira de entregas' })).toBeNull();
  });

  it('sem o papel não há bloco Motoboy; lojista ganha Lojas com link da ficha da loja', async () => {
    const { motoboy, ...semMotoboy } = DETAIL;
    get.mockResolvedValue({ data: { ...semMotoboy, stores: [{ id: 's1', name: 'Eletro Center', situation: 'admin_paused' }] } });
    renderFicha();
    const lojas = await screen.findByRole('region', { name: 'Lojas' });
    expect(within(lojas).getByRole('link', { name: 'Eletro Center' })).toHaveAttribute('href', '/admin/lojas/s1');
    expect(within(lojas).getByText('Pausada pelo DROP')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Motoboy' })).toBeNull();
  });

  it('sem operation:view, o pedido aparece sem link', async () => {
    renderFicha(adminAuth('gerente_geral', ['user:view_all']));
    const pedidos = await screen.findByRole('region', { name: 'Pedidos' });
    expect(within(pedidos).getByText('#a1b2c3 · Sabor da Vila')).toBeInTheDocument();
    expect(within(pedidos).queryByRole('link')).toBeNull();
  });

  it('conta bloqueada: aviso com motivo, autor e data', async () => {
    get.mockResolvedValue({ data: BLOQUEADA });
    renderFicha();
    const pessoa = await screen.findByRole('region', { name: 'Pessoa' });
    expect(within(pessoa).getByText('Bloqueado')).toBeInTheDocument();
    expect(within(pessoa).getByText('Motivo: Fraude no cupom · por Marina Rocha · em 19/10/2026')).toBeInTheDocument();
  });
});

describe('ficha · ações conforme `can`', () => {
  it.each([
    [{ block: false, unblock: false, disconnect: false, roles: false, forgiveDebt: false }, 'active', []],
    [{ block: true, unblock: false, disconnect: true, roles: false, forgiveDebt: false }, 'active', ['Bloquear', 'Desconectar']],
    [{ block: false, unblock: true, disconnect: true, roles: true, forgiveDebt: false }, 'blocked', ['Desbloquear', 'Desconectar', 'Papéis']],
  ])('%j com a conta %s: %j', async (can, status, expected) => {
    get.mockResolvedValue({ data: { ...DETAIL, profile: { ...DETAIL.profile, status }, can: { ...can, note: true } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    const grupo = screen.queryByRole('group', { name: 'Ações da conta' });
    if (expected.length === 0) expect(grupo).toBeNull();
    else expect(within(grupo as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(expected);
    expect(screen.queryByRole('button', { name: /^Perdoar/ })).toBeNull();
  });

  // Porta de admin-users "gerente com %j vê %j": a permissão (user:block, user:manage_roles) agora chega pelo
  // `can` que o servidor calcula; a tela segue o `can` e não a lista de permissões da sessão.
  it.each([
    [['user:view_all'], { block: false, unblock: false, disconnect: false, roles: false }, []],
    [['user:view_all', 'user:block'], { block: true, unblock: false, disconnect: true, roles: false }, ['Bloquear', 'Desconectar']],
    [['user:view_all', 'user:manage_roles'], { block: false, unblock: false, disconnect: false, roles: true }, ['Papéis']],
  ])('gerente com %j (can %j): %j', async (perms, can, expected) => {
    get.mockResolvedValue({ data: { ...DETAIL, can: { ...can, forgiveDebt: false, note: true } } });
    renderFicha(adminAuth('gerente_geral', perms));
    await screen.findByRole('region', { name: 'Pessoa' });
    const grupo = screen.queryByRole('group', { name: 'Ações da conta' });
    if (expected.length === 0) expect(grupo).toBeNull();
    else expect(within(grupo as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(expected);
  });

  it('"Perdoar" só na dívida pendente e só com forgiveDebt', async () => {
    renderFicha();
    await screen.findByRole('region', { name: 'Dívidas' });
    expect(screen.getAllByRole('button', { name: /^Perdoar/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['Perdoar R$ 12,50']);
  });

  it('própria conta: "Você" e o lembrete, sem ações (o servidor manda can falso)', async () => {
    get.mockResolvedValue({
      data: { ...DETAIL, profile: { ...DETAIL.profile, id: 'u1', name: 'Marina Rocha' }, can: { block: false, unblock: false, disconnect: false, roles: false, forgiveDebt: false, note: true } },
    });
    renderFicha();
    const pessoa = await screen.findByRole('region', { name: 'Pessoa' });
    expect(within(pessoa).getByText('Você')).toBeInTheDocument();
    expect(screen.getByText('Ninguém bloqueia, desconecta nem muda os papéis da própria conta.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ações da conta' })).toBeNull();
  });

  it('conta de outra pessoa: sem "Você" e sem o lembrete', async () => {
    renderFicha();
    const pessoa = await screen.findByRole('region', { name: 'Pessoa' });
    expect(within(pessoa).queryByText('Você')).toBeNull();
    expect(screen.queryByText('Ninguém bloqueia, desconecta nem muda os papéis da própria conta.')).toBeNull();
  });
});

describe('ficha · ações (mesmas chamadas da D3a) e releitura', () => {
  it('Bloquear: motivo obrigatório de 5+, PUT status, toast e releitura sem apagar a ficha', async () => {
    get.mockResolvedValueOnce({ data: DETAIL }).mockResolvedValueOnce({ data: BLOQUEADA });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bloquear conta' });
    const ok = within(dialog).getByRole('button', { name: 'Bloquear' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: ' Frau ' } });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: '  Fraude no cupom  ' } });
    fireEvent.click(ok);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/users/p1/status', { status: 'blocked', reason: 'Fraude no cupom' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Conta bloqueada.', 'success');
    expect(await screen.findByText('Motivo: Fraude no cupom · por Marina Rocha · em 19/10/2026')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Carregando')).toBeNull();
  });

  it('Desbloquear: mostra o motivo anterior; motivo opcional não vai quando vazio', async () => {
    get.mockResolvedValue({ data: BLOQUEADA });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Desbloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desbloquear conta' });
    expect(within(dialog).getByText(/Motivo do bloqueio: Fraude no cupom/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/users/p1/status', { status: 'active' }));
    expect(mockToast).toHaveBeenCalledWith('Conta desbloqueada.', 'success');
  });

  it('Desbloquear com motivo escrito: vai aparado no corpo', async () => {
    get.mockResolvedValue({ data: BLOQUEADA });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Desbloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desbloquear conta' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (opcional)'), { target: { value: '  Cliente comprovou  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/users/p1/status', { status: 'active', reason: 'Cliente comprovou' }));
  });

  it('Desconectar: POST sem corpo e releitura', async () => {
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar sessão' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]).toEqual(['/admin/users/p1/disconnect']);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(mockToast).toHaveBeenCalledWith('Sessão desconectada (se o app estava aberto).', 'success');
  });

  // Porta de admin-users "bloquear: erro do servidor dentro da sheet": agora vale para as três folhas da conta.
  it.each([
    ['Bloquear', 'Bloquear conta', 'put', DETAIL],
    ['Desbloquear', 'Desbloquear conta', 'put', BLOQUEADA],
    ['Desconectar', 'Desconectar sessão', 'post', DETAIL],
  ] as const)('%s: erro do servidor dentro da folha, que continua aberta; a 2ª tentativa grava', async (acao, titulo, metodo, data) => {
    get.mockResolvedValue({ data });
    const mock = metodo === 'put' ? put : post;
    mock.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Status inválido', code: 'INVALID_STATUS' } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: acao }));
    const dialog = await screen.findByRole('dialog', { name: titulo });
    if (acao === 'Bloquear') {
      fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Fraude no cupom' } });
    }
    fireEvent.click(within(dialog).getByRole('button', { name: acao }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Status inválido');
    expect(screen.getByRole('dialog', { name: titulo })).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: acao }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('Papéis: as caixinhas na folha, PUT da lista completa e o toast das lojas fechadas', async () => {
    put.mockResolvedValue({ data: { storesClosed: 1 } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    expect((within(dialog).getByRole('checkbox', { name: /^Motoboy/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Lojista/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/users/p1/roles', { roles: ['lojista', 'cliente', 'motoboy'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Papéis atualizados. A loja da pessoa foi fechada.', 'success');
    expect(get).toHaveBeenCalledTimes(2);
  });

  // Porta de admin-users.papeis "tirar Lojista com %i loja(s) fechada(s)" e do toast simples de admin-users.
  it.each([
    [0, 'Papéis atualizados.'],
    [2, 'Papéis atualizados. As 2 lojas da pessoa foram fechadas.'],
  ])('Papéis com %i loja(s) fechada(s): o toast certo', async (storesClosed, msg) => {
    put.mockResolvedValue({ data: { storesClosed } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /^Lojista/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(msg, 'success'));
  });

  // Porta de admin-users "fora do CEO: ... não libera papel da equipe", agora com o papel de quem está logado.
  it('fora do CEO: na folha só Lojista e Motoboy ficam livres', async () => {
    renderFicha(adminAuth('gerente_geral', ['user:view_all', 'user:manage_roles']));
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Papéis' }));
    const dialog = await screen.findByRole('dialog', { name: 'Papéis' });
    const livres = within(dialog).getAllByRole('checkbox').filter((c) => !(c as HTMLInputElement).disabled);
    expect(livres.map((c) => c.closest('label')!.textContent)).toEqual(['Lojista', 'Motoboy']);
  });

  it('Perdoar: o valor bem visível na folha, motivo obrigatório, POST e releitura', async () => {
    renderFicha();
    await screen.findByRole('region', { name: 'Dívidas' });
    fireEvent.click(screen.getByRole('button', { name: 'Perdoar R$ 12,50' }));
    const dialog = await screen.findByRole('dialog', { name: 'Perdoar dívida' });
    expect(within(dialog).getByText('R$ 12,50')).toBeInTheDocument();
    expect(within(dialog).getByText(/Sua pendência de R\$ 12,50 foi perdoada\./)).toBeInTheDocument();
    const ok = within(dialog).getByRole('button', { name: 'Perdoar R$ 12,50' });
    expect(ok).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Cliente explicou o atraso' } });
    fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/users/p1/debts/d1/forgive', { reason: 'Cliente explicou o atraso' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockToast).toHaveBeenCalledWith('Dívida de R$ 12,50 perdoada.', 'success');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('Perdoar com 409 DEBT_NOT_PENDING: a mensagem fica na folha e a ficha relê', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { error: 'Esta dívida não está mais pendente: já foi cobrada ou perdoada.', code: 'DEBT_NOT_PENDING' } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Dívidas' });
    fireEvent.click(screen.getByRole('button', { name: 'Perdoar R$ 12,50' }));
    const dialog = await screen.findByRole('dialog', { name: 'Perdoar dívida' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Cliente explicou o atraso' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Perdoar R$ 12,50' }));
    expect(await within(dialog).findByRole('alert'))
      .toHaveTextContent('Esta dívida não está mais pendente: já foi cobrada ou perdoada. A ficha foi atualizada.');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog', { name: 'Perdoar dívida' })).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('403 numa ação: "Você não tem permissão para isso" dentro da folha', async () => {
    post.mockRejectedValue({ response: { status: 403, data: { error: 'Permissão negada. Você precisa de: user:block' } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar sessão' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  });

  it('403 de regra (STAFF_TARGET_FORBIDDEN): o texto do servidor dentro da folha, sem toast', async () => {
    put.mockRejectedValue({ response: { status: 403, data: { error: 'Somente o CEO pode bloquear ou desconectar alguém da equipe.', code: 'STAFF_TARGET_FORBIDDEN' } } });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bloquear conta' });
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Fraude no cupom' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Somente o CEO pode bloquear ou desconectar alguém da equipe.');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('releitura que falha: a última leitura fica, com o aviso e "Tentar de novo"', async () => {
    get.mockResolvedValueOnce({ data: DETAIL }).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ data: DETAIL });
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    fireEvent.click(within(acoes()).getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Desconectar sessão' })).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('Não deu para atualizar. Mostrando a última leitura.')).toBeInTheDocument();
    expect(region('Pessoa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.queryByText('Não deu para atualizar. Mostrando a última leitura.')).toBeNull());
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe('ficha · histórico e notas', () => {
  it('nota no topo: POST /notes com o texto aparado e a ficha relê', async () => {
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Histórico' });
    fireEvent.change(within(hist).getByLabelText('Nota interna'), { target: { value: '  Pediu retorno depois das 18h ' } });
    fireEvent.click(within(hist).getByRole('button', { name: 'Salvar nota' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/users/p1/notes', { text: 'Pediu retorno depois das 18h' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('"Carregar mais" lê o histórico pelo cursor e acrescenta sem repetir', async () => {
    get.mockImplementation((url: string) => (url === '/admin/users/p1/timeline?cursor=tc1'
      ? Promise.resolve({ data: { items: [
        DETAIL.timeline.items[1],
        { id: 't0', type: 'block', reason: 'Teste antigo', meta: null, createdAt: '2026-09-01T13:00:00.000Z', actor: { id: 'a1', name: 'Marina Rocha', role: 'ceo' } },
      ], nextCursor: null } })
      : Promise.resolve({ data: DETAIL })));
    renderFicha();
    const hist = await screen.findByRole('region', { name: 'Histórico' });
    fireEvent.click(within(hist).getByRole('button', { name: 'Carregar mais' }));
    expect(await within(hist).findByText('Teste antigo')).toBeInTheDocument();
    expect(within(hist).getAllByRole('listitem')).toHaveLength(3);
    expect(within(hist).queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });
});

describe('ficha · leitura', () => {
  it('1ª leitura que falha: o erro em português e "Tentar de novo"', async () => {
    get.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Pessoa não encontrada.', code: 'USER_NOT_FOUND' } } }).mockResolvedValueOnce({ data: DETAIL });
    renderFicha();
    expect(await screen.findByRole('alert')).toHaveTextContent('Pessoa não encontrada.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Pessoa' })).toBeInTheDocument();
  });

  it('resposta fora do formato: erro, nunca uma ficha pela metade', async () => {
    const { can, ...semCan } = DETAIL;
    get.mockResolvedValue({ data: semCan });
    renderFicha();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar a ficha.');
    expect(screen.queryByRole('region', { name: 'Pessoa' })).toBeNull();
  });
});

describe('ficha · 393 px', () => {
  it('ações numa barra fixa no pé, com botões de toque', async () => {
    setViewportWidth(393);
    renderFicha();
    await screen.findByRole('region', { name: 'Pessoa' });
    expect(acoes().className).toContain('actionBar');
    within(acoes()).getAllByRole('button').forEach((b) => expect(b.className).toContain('touch'));
  });
});
