/**
 * D3a · P3.2 · Verificações (telas 2 e 9): lado a lado, recusa por itens na AdminSheet, permissão por item,
 * fail closed e celular.
 * D3b-2b · P3.2 (porte):
 * - o "Aprovar tudo" deixou de ser lote item a item (runBatch) e virou a rota approve-all. Os 4 testes do lote saíram
 *   (clique duplo, tela fechada, resultado preso à pessoa, "Tentar de novo"); a rota única é coberta em
 *   admin.d3b2b.verificacoes.test.tsx;
 * - a recusa escolhe o motivo num select e manda {reasonCode, message?, resend}; o rótulo da mensagem perdeu
 *   "(opcional)" (ela é obrigatória com "Outro motivo");
 * - a fila também lê GET /verification/admin/stats, então as contagens e listas de GET olham só as filas (queueCalls);
 * - o "Aprovar tudo" manda só os itens que o admin decide (o servidor exige a permissão de cada item): o gerente de
 *   motoboys aprova só a CNH no motoboy com selfie (a selfie é review_stores) e não vê o botão sem item decidível.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminVerificacoesPage from '../pages/admin/verificacoes';
import api from '../lib/api';
import { FULL, queueCalls, queuesGet } from './helpers/verificacoesFixtures';
import { resetViewport, setViewportWidth } from './helpers/viewport';

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

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  get.mockImplementation(queuesGet(FULL));
  post.mockResolvedValue({ data: {} });
  window.prompt = jest.fn();
});
afterEach(() => resetViewport());

describe('Verificações · lado a lado', () => {
  it('lista por pessoa com abas e os documentos da primeira pessoa lado a lado', async () => {
    render(<AdminVerificacoesPage />);
    const list = await screen.findByRole('list', { name: 'Pessoas aguardando' });
    expect(within(list).getAllByRole('button').map((b) => b.querySelector('span')?.textContent)).toEqual([
      'Paulo Henrique', 'Carlos Lima', 'Ana Souza',
    ]);
    expect(within(list).getByRole('button', { name: /Paulo Henrique/ })).toHaveAttribute('aria-current', 'true');
    const detail = screen.getByRole('region', { name: 'Paulo Henrique' });
    expect(within(detail).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Documento', 'Selfie (comparar com o documento)', 'CNPJ · Eletro Center', 'Endereço · Eletro Center',
    ]);
    expect(within(detail).getByRole('img', { name: 'Frente' })).toHaveAttribute('src', 'https://cdn.x/frente.jpg');
    expect(within(detail).getByRole('img', { name: 'Comprovante de endereço' })).toBeInTheDocument();

    const tabs = screen.getByRole('tablist', { name: 'Filtrar por perfil' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Todos3', 'Lojas1', 'Motoboys1', 'Clientes1']);
    fireEvent.click(within(tabs).getByRole('tab', { name: /Clientes/ }));
    expect(screen.getByRole('region', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Pessoas aguardando' })).getAllByRole('button')).toHaveLength(1);
  });

  it('aprovar um item só: POST e as filas são relidas', async () => {
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    const cnpj = within(detail).getByRole('article', { name: 'CNPJ · Eletro Center' });
    fireEvent.click(within(cnpj).getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/admin/store/s1/cnpj/approve'));
    await waitFor(() => expect(queueCalls(get)).toHaveLength(6));
    expect(mockToast).toHaveBeenCalledWith('Aprovado.', 'success');
  });
});

describe('Verificações · permissão por item (mesma da rota)', () => {
  it('gerente de motoboys: só lê a fila de motoboys e decide só CNH e placa; "Aprovar tudo" leva só a CNH (a selfie não é dele)', async () => {
    setRole('gerente_motoboys', ['verification:view_queue', 'verification:review_motoboys']);
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Carlos Lima' });
    expect(queueCalls(get)).toEqual(['/verification/admin/motoboy-pending']);
    const selfie = within(detail).getByRole('article', { name: 'Selfie (comparar com o documento)' });
    expect(within(selfie).queryByRole('button')).toBeNull();
    const cnh = within(detail).getByRole('article', { name: 'CNH e placa' });
    expect(within(cnh).getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/admin/subject/motoboy/m1/approve-all', { items: ['courier'] }));
    expect(within(detail).getByRole('button', { name: 'Recusar com motivo' })).toBeInTheDocument();
  });

  it('gerente de clientes: só a fila de documentos', async () => {
    setRole('gerente_clientes', ['verification:view_queue', 'verification:review_clients']);
    render(<AdminVerificacoesPage />);
    await screen.findByRole('list', { name: 'Pessoas aguardando' });
    expect(queueCalls(get)).toEqual(['/verification/admin/pending']);
  });
});

describe('Verificações · recusa por itens (AdminSheet, sem window.prompt)', () => {
  it('marca itens, escolhe o motivo de cada um e a mensagem; um POST por item com {reasonCode, message, resend}', async () => {
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio' })).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText('Selfie (comparar com o documento)'));
    fireEvent.click(within(dialog).getByLabelText('Endereço · Eletro Center'));
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo · Selfie (comparar com o documento)'), { target: { value: 'face_mismatch' } });
    fireEvent.change(within(dialog).getByLabelText('Motivo · Endereço · Eletro Center'), { target: { value: 'address_unproven' } });
    fireEvent.change(within(dialog).getByLabelText('Mensagem para a pessoa'), { target: { value: ' Envie de novo pelo app. ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post.mock.calls).toEqual([
      ['/verification/admin/facial/l2/reject', { reasonCode: 'face_mismatch', message: 'Envie de novo pelo app.', resend: true }],
      ['/verification/admin/store/s1/address/reject', { reasonCode: 'address_unproven', message: 'Envie de novo pelo app.', resend: true }],
    ]);
    expect(mockToast).toHaveBeenCalledWith('2 itens concluídos', 'success');
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('fechar a tela no meio da recusa para o lote', async () => {
    let release!: () => void;
    post
      .mockImplementationOnce(() => new Promise((r) => { release = () => r({ data: {} }); }))
      .mockResolvedValue({ data: {} });
    const { unmount } = render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    fireEvent.click(within(dialog).getByLabelText('Documento'));
    fireEvent.click(within(dialog).getByLabelText('CNPJ · Eletro Center'));
    fireEvent.change(within(dialog).getByLabelText('Motivo · Documento'), { target: { value: 'expired' } });
    fireEvent.change(within(dialog).getByLabelText('Motivo · CNPJ · Eletro Center'), { target: { value: 'cnpj_invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { release(); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('item que falha fica marcado com o erro; enviar de novo só reenvia ele', async () => {
    post
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro interno do servidor' } } })
      .mockResolvedValue({ data: {} });
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    fireEvent.click(within(dialog).getByLabelText('Documento'));
    fireEvent.click(within(dialog).getByLabelText('CNPJ · Eletro Center'));
    fireEvent.change(within(dialog).getByLabelText('Motivo · Documento'), { target: { value: 'expired' } });
    fireEvent.change(within(dialog).getByLabelText('Motivo · CNPJ · Eletro Center'), { target: { value: 'cnpj_invalid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' }));
    expect(await within(dialog).findByText('Erro interno do servidor')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('1 item concluído, 1 com erro', 'error');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      '/verification/admin/l2/reject',
      '/verification/admin/store/s1/cnpj/reject',
      '/verification/admin/store/s1/cnpj/reject',
    ]);
  });
});

describe('Verificações · fail closed e celular', () => {
  it('fila que não carrega: erro com "Tentar de novo", nunca "nada pendente"', async () => {
    get.mockImplementation((url: string) =>
      url === '/verification/admin/store-pending'
        ? Promise.reject({ response: { status: 500, data: { error: 'Erro interno do servidor' } } })
        : queuesGet(FULL)(url));
    render(<AdminVerificacoesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as verificações.');
    expect(screen.queryByText(/Nada pendente/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Pessoas aguardando' })).toBeNull();
    get.mockImplementation(queuesGet(FULL));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Paulo Henrique' })).toBeInTheDocument();
  });

  it('nada pendente (leitura certa e vazia)', async () => {
    get.mockImplementation(queuesGet({}));
    render(<AdminVerificacoesPage />);
    expect(await screen.findByText('Nada pendente: ninguém aguardando verificação.')).toBeInTheDocument();
  });

  it('celular: lista primeiro; tocar na pessoa abre os documentos e "Voltar para a lista"', async () => {
    setViewportWidth(360);
    render(<AdminVerificacoesPage />);
    const list = await screen.findByRole('list', { name: 'Pessoas aguardando' });
    expect(screen.queryByRole('region')).toBeNull();
    fireEvent.click(within(list).getByRole('button', { name: /Carlos Lima/ }));
    expect(screen.getByRole('region', { name: 'Carlos Lima' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pessoas aguardando' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprovar tudo' }).className).toContain('touch');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a lista' }));
    expect(screen.getByRole('list', { name: 'Pessoas aguardando' })).toBeInTheDocument();
  });
});
