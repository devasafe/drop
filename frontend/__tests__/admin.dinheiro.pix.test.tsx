/**
 * D3a · P4.3 — Dinheiro · Pix aos motoboys (tela 30, modo direto).
 * Caracterização: as chamadas da página antiga (passa na antiga e na nova).
 * Tela nova: "Tentar agora"/"Resolver" só com payout:release, nota na AdminSheet, erro de leitura sem lista,
 * erro de ação com a mensagem do AppError, celular em cartões.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminTransfersPage from '../pages/admin/transfers';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
let mockCan: (p: string) => boolean = () => true;

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/transfers', asPath: '/admin/transfers' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' },
    can: (p: string) => mockCan(p),
    loading: false,
    permissionsLoading: false,
  }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const ROWS = [
  { id: 't1', orderId: 'ordAAAAAA', storeName: 'Eletro Center', motoboyName: 'Carlos Lima', status: 'failed', amount: 12, attempts: 2, lastError: 'saldo insuficiente', pixKeyMasked: '***.***.***-12' },
  { id: 't2', orderId: 'ordBBBBBB', storeName: 'Papel e Cia', motoboyName: 'Júlia Santos', status: 'uncertain', amount: 9.1, attempts: 1, lastError: 'UNCERTAIN', pixKeyMasked: 'j***@g***.com' },
  { id: 't3', orderId: 'ordCCCCCC', storeName: 'Tech House', motoboyName: 'Ana Prado', status: 'done', amount: 15, attempts: 1, lastError: null, pixKeyMasked: '***4000' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  get.mockResolvedValue({ data: { success: true, data: ROWS, nextCursor: null } });
  post.mockResolvedValue({ data: { success: true, data: {} } });
});
afterEach(() => resetViewport());

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('lista sem filtro e com filtro de status', async () => {
    render(<AdminTransfersPage />);
    await screen.findByText(/Eletro Center/);
    expect(get).toHaveBeenCalledWith('/admin/transfers', { params: {} });
    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'uncertain' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/transfers', { params: { status: 'uncertain' } }));
  });

  it('tentar de novo: POST /admin/transfers/:id/retry sem corpo', async () => {
    render(<AdminTransfersPage />);
    await screen.findByText(/Eletro Center/);
    fireEvent.click(screen.getByRole('button', { name: /^(Reenviar|Tentar agora)$/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/transfers/t1/retry'));
    expect(post.mock.calls[0]).toHaveLength(1);
  });

  it('resolver: POST /admin/transfers/:id/resolve { note } com a nota sem espaços nas pontas', async () => {
    render(<AdminTransfersPage />);
    await screen.findByText(/Papel e Cia/);
    fireEvent.click(screen.getAllByRole('button', { name: /^(Marcar como resolvido|Resolver)$/ })[1]);
    fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: '  conferido no painel do Asaas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar resolução' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/transfers/t2/resolve', { note: 'conferido no painel do Asaas' }));
  });
});

describe('tela nova', () => {
  it('rótulos do protótipo: "Tentar agora" só em falha; "Resolver" em falha e incerto; nada no pago', async () => {
    render(<AdminTransfersPage />);
    await screen.findByText('Eletro Center → Carlos Lima');
    expect(screen.getAllByRole('button', { name: 'Tentar agora' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Resolver' })).toHaveLength(2);
    const paid = screen.getByText('Tech House → Ana Prado').closest('tr')!;
    expect(within(paid).queryByRole('button')).not.toBeInTheDocument();
  });

  it('sem payout:release: nenhum botão de ação', async () => {
    mockCan = (p) => p === 'payout:view';
    render(<AdminTransfersPage />);
    await screen.findByText('Eletro Center → Carlos Lima');
    expect(screen.queryByRole('button', { name: 'Tentar agora' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver' })).not.toBeInTheDocument();
  });

  it('primeira leitura falha: erro com "Tentar de novo", sem lista', async () => {
    get.mockRejectedValueOnce(new Error('500'));
    render(<AdminTransfersPage />);
    expect(await screen.findByText('Não foi possível carregar as transferências.')).toBeInTheDocument();
    expect(screen.queryByText(/Eletro Center/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Eletro Center → Carlos Lima')).toBeInTheDocument();
  });

  it('erro ao tentar de novo: toast com a mensagem do servidor (AppError)', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { success: false, error: { message: 'Esta transferência já está em andamento', code: 'TRANSFER_IN_PROGRESS' } } } });
    render(<AdminTransfersPage />);
    await screen.findByText('Eletro Center → Carlos Lima');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Esta transferência já está em andamento', 'error'));
  });

  it('resolver: nota curta não envia; erro do servidor aparece na folha', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { success: false, error: { message: 'Transferência já resolvida', code: 'TRANSFER_NOT_RESOLVABLE' } } } });
    render(<AdminTransfersPage />);
    await screen.findByText('Papel e Cia → Júlia Santos');
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolver' })[1]);
    const sheet = screen.getByRole('dialog', { name: 'Resolver Pix' });
    const send = within(sheet).getByRole('button', { name: 'Confirmar resolução' });
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'curta' } });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText('Nota da conferência'), { target: { value: 'conferido no painel do Asaas' } });
    fireEvent.click(send);
    expect(await within(sheet).findByText('Transferência já resolvida')).toBeInTheDocument();
  });

  it('linha mostra situação, tentativas, chave mascarada e motivo legível', async () => {
    render(<AdminTransfersPage />);
    await screen.findByText('Eletro Center → Carlos Lima');
    expect(screen.getByText('2 tentativa(s) · Pix ***.***.***-12')).toBeInTheDocument();
    expect(screen.getByText('A loja não tem saldo no Asaas para esta transferência')).toBeInTheDocument();
    expect(screen.getByText('R$ 12,00')).toBeInTheDocument();
  });

  it('celular: cartões com a ação no cartão', async () => {
    setViewportWidth(360);
    render(<AdminTransfersPage />);
    await screen.findByText('Eletro Center → Carlos Lima');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByText('Eletro Center → Carlos Lima').closest('li')!;
    expect(within(card).getByRole('button', { name: 'Tentar agora' })).toBeInTheDocument();
  });
});
