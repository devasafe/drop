/**
 * D3a · P3.2 · Verificações (telas 2 e 9): lado a lado, "Aprovar tudo" com runBatch, recusa por itens
 * na AdminSheet, permissão por item, fail closed e celular.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminVerificacoesPage from '../pages/admin/verificacoes';
import api from '../lib/api';
import { FULL, LOJA, queuesGet } from './helpers/verificacoesFixtures';
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

const PAULO_URLS = [
  '/verification/admin/l2/approve',
  '/verification/admin/facial/l2/approve',
  '/verification/admin/store/s1/cnpj/approve',
  '/verification/admin/store/s1/address/approve',
];

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  (api.get as jest.Mock).mockImplementation(queuesGet(FULL));
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
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
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/verification/admin/store/s1/cnpj/approve'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(6));
    expect(mockToast).toHaveBeenCalledWith('Aprovado.', 'success');
  });
});

describe('Verificações · "Aprovar tudo" (runBatch)', () => {
  it('um item por vez; "já decidido" conta como feito; "Tentar de novo os que falharam" só reenvia o que falhou', async () => {
    const calls: string[] = [];
    (api.post as jest.Mock).mockImplementation((url: string) => {
      calls.push(url);
      if (url === '/verification/admin/facial/l2/approve') {
        return Promise.reject({ response: { status: 400, data: { error: 'Facial não está pendente' } } });
      }
      if (url === '/verification/admin/store/s1/cnpj/approve' && calls.filter((c) => c === url).length === 1) {
        return Promise.reject({ response: { status: 500, data: { error: 'Erro interno do servidor' } } });
      }
      return Promise.resolve({ data: {} });
    });
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('3 concluídos, 1 com erro', 'error'));
    expect(calls).toEqual(PAULO_URLS);
    const cnpj = within(screen.getByRole('region', { name: 'Paulo Henrique' })).getByRole('article', { name: 'CNPJ · Eletro Center' });
    expect(within(cnpj).getByText('Erro interno do servidor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(mockToast).toHaveBeenLastCalledWith('4 concluídos', 'success'));
    expect(calls).toEqual([...PAULO_URLS, '/verification/admin/store/s1/cnpj/approve']);
  });

  it('fechar a tela no meio para o lote', async () => {
    let release!: () => void;
    (api.post as jest.Mock)
      .mockImplementationOnce(() => new Promise((r) => { release = () => r({ data: {} }); }))
      .mockResolvedValue({ data: {} });
    const { unmount } = render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { release(); });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('o resultado do lote é da pessoa dele: trocar de pessoa no meio não leva o resultado nem o "Tentar de novo" para outra', async () => {
    let release!: () => void;
    (api.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/verification/admin/l2/approve') return new Promise((r) => { release = () => r({ data: {} }); });
      if (url === '/verification/admin/store/s1/cnpj/approve') {
        return Promise.reject({ response: { status: 500, data: { error: 'Erro interno do servidor' } } });
      }
      return Promise.resolve({ data: {} });
    });
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    // No meio do lote: a lista e as abas não trocam a pessoa aberta.
    const list = screen.getByRole('list', { name: 'Pessoas aguardando' });
    expect(within(list).getByRole('button', { name: /Carlos Lima/ })).toBeDisabled();
    fireEvent.click(within(list).getByRole('button', { name: /Carlos Lima/ }));
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Filtrar por perfil' })).getByRole('tab', { name: /Motoboys/ }));
    expect(screen.queryByRole('region', { name: 'Carlos Lima' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Paulo Henrique' })).toBeInTheDocument();

    await act(async () => { release(); });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('3 concluídos, 1 com erro', 'error'));
    expect(api.post).toHaveBeenCalledTimes(4);

    // Depois do lote, outra pessoa não herda o resultado de Paulo.
    fireEvent.click(within(screen.getByRole('list', { name: 'Pessoas aguardando' })).getByRole('button', { name: /Carlos Lima/ }));
    const carlos = screen.getByRole('region', { name: 'Carlos Lima' });
    expect(within(carlos).queryByRole('button', { name: 'Tentar de novo os que falharam' })).toBeNull();
    expect(within(carlos).queryByText('Erro interno do servidor')).toBeNull();

    // De volta a Paulo, o "Tentar de novo" reenvia de verdade o que falhou (nunca "concluído" sem POST).
    fireEvent.click(within(screen.getByRole('list', { name: 'Pessoas aguardando' })).getByRole('button', { name: /Paulo Henrique/ }));
    const paulo = screen.getByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(paulo).getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(5));
    expect((api.post as jest.Mock).mock.calls[4]).toEqual(['/verification/admin/store/s1/cnpj/approve']);
  });

  it('"Tentar de novo" de um item que saiu da fila: falha com aviso, sem POST, nunca "concluído"', async () => {
    (api.post as jest.Mock).mockImplementation((url: string) =>
      url === '/verification/admin/store/s1/cnpj/approve'
        ? Promise.reject({ response: { status: 500, data: { error: 'Erro interno do servidor' } } })
        : Promise.resolve({ data: {} }));
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    // A releitura do fim do lote já não traz o CNPJ (decidido por outra pessoa), mas Paulo segue com o endereço.
    const semCnpj = { ...LOJA, verification: { address: LOJA.verification.address } };
    (api.get as jest.Mock).mockImplementation(queuesGet({ ...FULL, stores: [semCnpj] }));
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('3 concluídos, 1 com erro', 'error'));
    expect(api.post).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(2));
    expect(mockToast).toHaveBeenLastCalledWith('3 concluídos, 1 com erro', 'error');
    expect(api.post).toHaveBeenCalledTimes(4);
  });
});

describe('Verificações · permissão por item (mesma da rota)', () => {
  it('gerente de motoboys: só lê a fila de motoboys e só decide CNH e placa', async () => {
    setRole('gerente_motoboys', ['verification:view_queue', 'verification:review_motoboys']);
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Carlos Lima' });
    expect((api.get as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/verification/admin/motoboy-pending']);
    const selfie = within(detail).getByRole('article', { name: 'Selfie (comparar com o documento)' });
    expect(within(selfie).queryByRole('button')).toBeNull();
    const cnh = within(detail).getByRole('article', { name: 'CNH e placa' });
    expect(within(cnh).getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Aprovar tudo' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect((api.post as jest.Mock).mock.calls[0]).toEqual(['/verification/admin/motoboy/m1/approve']);
  });

  it('gerente de clientes: só a fila de documentos', async () => {
    setRole('gerente_clientes', ['verification:view_queue', 'verification:review_clients']);
    render(<AdminVerificacoesPage />);
    await screen.findByRole('list', { name: 'Pessoas aguardando' });
    expect((api.get as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['/verification/admin/pending']);
  });
});

describe('Verificações · recusa por itens (AdminSheet, sem window.prompt)', () => {
  it('marca itens, um motivo por item e a mensagem; um POST por item com o texto composto', async () => {
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio' })).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText('Selfie (comparar com o documento)'));
    fireEvent.click(within(dialog).getByLabelText('Endereço · Eletro Center'));
    expect(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo · Selfie (comparar com o documento)'), { target: { value: 'Selfie não confere.' } });
    fireEvent.change(within(dialog).getByLabelText('Motivo · Endereço · Eletro Center'), { target: { value: 'Foto ilegível' } });
    fireEvent.change(within(dialog).getByLabelText('Mensagem para a pessoa (opcional)'), { target: { value: 'Envie de novo pelo app.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((api.post as jest.Mock).mock.calls).toEqual([
      ['/verification/admin/facial/l2/reject', { reason: 'Selfie não confere. Envie de novo pelo app' }],
      ['/verification/admin/store/s1/address/reject', { reason: 'Foto ilegível. Envie de novo pelo app' }],
    ]);
    expect(mockToast).toHaveBeenCalledWith('2 itens concluídos', 'success');
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('item que falha fica marcado com o erro; enviar de novo só reenvia ele', async () => {
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro interno do servidor' } } })
      .mockResolvedValue({ data: {} });
    render(<AdminVerificacoesPage />);
    const detail = await screen.findByRole('region', { name: 'Paulo Henrique' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
    fireEvent.click(within(dialog).getByLabelText('Documento'));
    fireEvent.click(within(dialog).getByLabelText('CNPJ · Eletro Center'));
    fireEvent.change(within(dialog).getByLabelText('Motivo · Documento'), { target: { value: 'Documento vencido' } });
    fireEvent.change(within(dialog).getByLabelText('Motivo · CNPJ · Eletro Center'), { target: { value: 'CNPJ baixado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 2 itens' }));
    expect(await within(dialog).findByText('Erro interno do servidor')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('1 item concluído, 1 com erro', 'error');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((api.post as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      '/verification/admin/l2/reject',
      '/verification/admin/store/s1/cnpj/reject',
      '/verification/admin/store/s1/cnpj/reject',
    ]);
  });
});

describe('Verificações · fail closed e celular', () => {
  it('fila que não carrega: erro com "Tentar de novo", nunca "nada pendente"', async () => {
    (api.get as jest.Mock).mockImplementation((url: string) =>
      url === '/verification/admin/store-pending'
        ? Promise.reject({ response: { status: 500, data: { error: 'Erro interno do servidor' } } })
        : queuesGet(FULL)(url));
    render(<AdminVerificacoesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as verificações.');
    expect(screen.queryByText(/Nada pendente/)).toBeNull();
    expect(screen.queryByRole('list', { name: 'Pessoas aguardando' })).toBeNull();
    (api.get as jest.Mock).mockImplementation(queuesGet(FULL));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Paulo Henrique' })).toBeInTheDocument();
  });

  it('nada pendente (leitura certa e vazia)', async () => {
    (api.get as jest.Mock).mockImplementation(queuesGet({}));
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
