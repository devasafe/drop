/**
 * D3b-2b · P3.2 — Verificações:
 * - "Aprovar tudo" pela rota approve-all: uma chamada por sujeito; 409 VERIFICATION_CHANGED relê e avisa; clique
 *   duplo e tela fechada no meio;
 * - "há quanto tempo" em cada item e na lista; média de espera no topo;
 * - folha de recusa com os motivos padronizados ("Outro motivo" exige a mensagem; "Pedir reenvio" muda o botão).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminVerificacoesPage from '../pages/admin/verificacoes';
import api from '../lib/api';
import { FULL, LOJA, MOTOBOY, PAULO_DOC, PAULO_FACIAL, queueCalls, queuesGet } from './helpers/verificacoesFixtures';

const mockToast = jest.fn();
let mockUser: Record<string, unknown> = {};
let mockPerms: string[] = [];
const setRole = (role: string, perms: string[] = []) => {
  mockUser = { _id: 'me', id: 'me', name: 'Marina Rocha', role, activeRole: role };
  mockPerms = perms;
};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/verificacoes', asPath: '/admin/verificacoes' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    token: null,
    loading: false,
    permissionsLoading: false,
    can: (p: string) => (mockUser as { role?: string }).role === 'ceo' || mockPerms.includes(p),
  }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const changed = (currentPending?: string[]) => ({
  response: { status: 409, data: { error: 'Mudou', code: 'VERIFICATION_CHANGED', ...(currentPending ? { currentPending } : {}) } },
});

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  get.mockImplementation(queuesGet(FULL));
  post.mockResolvedValue({ data: { approved: [] } });
});

describe('"Aprovar tudo" pela rota única', () => {
  it('lojista: um POST pela loja com a lista que o admin viu; aviso e a fila relida', async () => {
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('4 itens aprovados.', 'success'));
    expect(post.mock.calls).toEqual([
      ['/verification/admin/subject/store/s1/approve-all', { items: ['document', 'facial', 'cnpj', 'address'] }],
    ]);
    await waitFor(() => expect(queueCalls(get)).toHaveLength(6));
  });

  it('motoboy e cliente: pelo userId', async () => {
    render(<AdminVerificacoesPage />);
    const list = await screen.findByRole('list', { name: 'Pessoas aguardando' });
    fireEvent.click(within(list).getByRole('button', { name: /Carlos Lima/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Carlos Lima' })).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('2 itens aprovados.', 'success'));
    expect(post).toHaveBeenLastCalledWith('/verification/admin/subject/motoboy/m1/approve-all', { items: ['facial', 'courier'] });

    const ana = within(screen.getByRole('list', { name: 'Pessoas aguardando' })).getByRole('button', { name: /Ana Souza/ });
    await waitFor(() => expect(ana).toBeEnabled());
    fireEvent.click(ana);
    fireEvent.click(within(screen.getByRole('region', { name: 'Ana Souza' })).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('1 item aprovado.', 'success'));
    expect(post).toHaveBeenLastCalledWith('/verification/admin/subject/client/c1/approve-all', { items: ['document'] });
  });

  it('409 VERIFICATION_CHANGED: nada aprovado, aviso com o que está pendente agora e a fila relida', async () => {
    post.mockRejectedValue(changed(['document', 'cnpj', 'address']));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      'A verificação mudou enquanto você olhava, e estes itens não foram aprovados. Pendentes agora: Documento, CNPJ, Endereço. Confira antes de aprovar.',
      'error',
    ));
    await waitFor(() => expect(queueCalls(get)).toHaveLength(6));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('duas lojas: uma chamada por loja; se a segunda dá 409, o aviso diz o que já foi aprovado', async () => {
    const loja2 = { ...LOJA, _id: 's2', name: 'Eletro Norte', verification: { cnpj: LOJA.verification.cnpj } };
    get.mockImplementation(queuesGet({ pending: [PAULO_DOC], stores: [LOJA, loja2] }));
    post.mockResolvedValueOnce({ data: { approved: ['document', 'cnpj', 'address'] } }).mockRejectedValueOnce(changed([]));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      '3 itens aprovados. A verificação mudou enquanto você olhava, e estes itens não foram aprovados. A lista foi atualizada.',
      'error',
    ));
    expect(post.mock.calls).toEqual([
      ['/verification/admin/subject/store/s1/approve-all', { items: ['document', 'cnpj', 'address'] }],
      ['/verification/admin/subject/store/s2/approve-all', { items: ['cnpj'] }],
    ]);
  });

  it('outro erro (403): o texto de sempre, e a fila relida', async () => {
    post.mockRejectedValue({ response: { status: 403, data: { error: 'Acesso negado' } } });
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Você não tem permissão para isso', 'error'));
    await waitFor(() => expect(queueCalls(get)).toHaveLength(6));
  });

  it('clique duplo: um POST só; fechar a tela no meio: sem aviso nem releitura', async () => {
    let release!: () => void;
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    const { unmount } = render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    const btn = within(detail).getByRole('button', { name: 'Aprovar tudo' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(post).toHaveBeenCalledTimes(1);
    const reads = get.mock.calls.length;
    unmount();
    await act(async () => { release(); });
    expect(mockToast).not.toHaveBeenCalled();
    expect(get.mock.calls.length).toBe(reads);
  });
});

describe('"Aprovar tudo" respeita a permissão de cada item', () => {
  it('gerente de lojistas: a chamada da loja leva só selfie, CNPJ e endereço (o documento é de review_clients)', async () => {
    setRole('gerente_lojistas', ['verification:view_queue', 'verification:review_stores']);
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('3 itens aprovados.', 'success'));
    expect(post.mock.calls).toEqual([
      ['/verification/admin/subject/store/s1/approve-all', { items: ['facial', 'cnpj', 'address'] }],
    ]);
  });

  it('gerente de clientes: lojista só com documento vai pela rota client; a loja nem é lida', async () => {
    setRole('gerente_clientes', ['verification:view_queue', 'verification:review_clients']);
    get.mockImplementation(queuesGet({ pending: [PAULO_DOC] }));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/admin/subject/client/l2/approve-all', { items: ['document'] }));
  });

  it('sem item que o admin decida, não há "Aprovar tudo" nem recusa', async () => {
    setRole('gerente_motoboys', ['verification:view_queue', 'verification:review_motoboys']);
    const soSelfie = { ...MOTOBOY, verification: { facial: MOTOBOY.verification.facial } };
    get.mockImplementation(queuesGet({ motoboys: [soSelfie] }));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Carlos Lima' });
    expect(within(detail).queryByRole('button', { name: 'Aprovar tudo' })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('espera', () => {
  it('cada item mostra há quanto tempo espera; a lista mostra o envio mais antigo; sem data, nada', async () => {
    const doc = { ...PAULO_DOC, verification: { document: { ...PAULO_DOC.verification.document, submittedAt: hoursAgo(3) } } };
    const loja = { ...LOJA, verification: { ...LOJA.verification, address: { ...LOJA.verification.address, submittedAt: hoursAgo(50) } } };
    get.mockImplementation(queuesGet({ pending: [doc], stores: [loja], facial: [PAULO_FACIAL] }));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    expect(within(within(detail).getByRole('article', { name: 'Documento' })).getByText('Enviado há 3 h')).toBeInTheDocument();
    expect(within(within(detail).getByRole('article', { name: 'Endereço · Eletro Center' })).getByText('Enviado há 2 d')).toBeInTheDocument();
    expect(within(detail).getByRole('article', { name: 'CNPJ · Eletro Center' }).textContent).not.toMatch(/Enviado/);
    const list = screen.getByRole('list', { name: 'Pessoas aguardando' });
    expect(within(list).getByRole('button', { name: /Paulo Henrique/ })).toHaveTextContent('Loja · 4 itens · há 2 d');
  });

  it('média de espera no topo, lida de GET /verification/admin/stats', async () => {
    get.mockImplementation(queuesGet({ ...FULL, stats: { avgHoursToDecision: 5.2, decisions30d: 41 } }));
    render(<AdminVerificacoesPage />);
    expect(await screen.findByText('Espera média até a decisão: 5,2 h · 41 decisões em 30 dias')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/verification/admin/stats');
  });

  it('média que não carrega ou vem fora do formato: aviso curto, e a fila aparece igual', async () => {
    get.mockImplementation(queuesGet({ ...FULL, stats: new Error('rede') }));
    const a = render(<AdminVerificacoesPage />);
    expect(await screen.findByRole('region', { name: 'Paulo Henrique' })).toBeInTheDocument();
    expect(await screen.findByText('Espera média indisponível agora.')).toBeInTheDocument();
    a.unmount();
    get.mockImplementation(queuesGet({ ...FULL, stats: { avgHoursToDecision: '5' } }));
    render(<AdminVerificacoesPage />);
    expect(await screen.findByText('Espera média indisponível agora.')).toBeInTheDocument();
  });
});

describe('folha de recusa com motivo padronizado', () => {
  it('os 7 motivos no select; "Outro motivo" exige a mensagem; sem "Pedir reenvio" o botão vira "Recusar"', async () => {
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(within(detail).getByRole('article', { name: 'Documento' })).getByRole('button', { name: 'Recusar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    const motivo = within(dialog).getByLabelText('Motivo · Documento');
    expect(within(motivo).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Escolha o motivo', 'Foto ilegível', 'Selfie não confere com o documento', 'Documento vencido', 'Dados não conferem',
      'CNPJ inválido ou inativo', 'Comprovante de endereço não aceito', 'Outro motivo',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' })).toBeDisabled();
    fireEvent.change(motivo, { target: { value: 'other' } });
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' })).toBeDisabled();
    expect(within(dialog).getByText('Obrigatória com “Outro motivo”. Até 300 caracteres.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Mensagem para a pessoa'), { target: { value: 'Documento de outra pessoa' } });
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' })).toBeEnabled();
    expect(within(dialog).getByText('A pessoa vê “Reenvie: motivo” e manda de novo.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Pedir reenvio'));
    expect(within(dialog).getByRole('button', { name: 'Recusar 1 item' })).toBeEnabled();
    expect(within(dialog).getByText('A pessoa vê “Recusado: motivo” e ainda pode mandar de novo.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
