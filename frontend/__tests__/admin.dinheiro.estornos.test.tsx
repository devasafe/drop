/**
 * D3a · P4.4 — Dinheiro · Estornos (tela 15, modo direto).
 * Caracterização: as chamadas da página antiga (passa na antiga e na nova).
 * Tela nova: "Devolver R$ X" com confirmação, "Resolver com nota", ações só com payout:release,
 * 409 da trava anti-duplo-estorno na folha + lista relida, erro de leitura sem lista, celular.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import AdminEstornosPage from '../pages/admin/estornos';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
let mockCan: (p: string) => boolean = () => true;

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/estornos', asPath: '/admin/estornos' }),
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
  { id: 'r1', orderId: 'o1', storeName: 'Loja Um', status: 'failed', amount: 47.3, attempts: 2, lastError: 'Saldo insuficiente' },
  { id: 'r2', orderId: 'o2', storeName: 'Loja Dois', status: 'uncertain', amount: 33.4, attempts: 1, lastError: 'UNCERTAIN' },
  { id: 'r3', orderId: 'o3', storeName: 'Loja Tres', status: 'done', amount: 89, attempts: 1, lastError: null },
  { id: 'r4', orderId: 'o4', storeName: 'Loja Quatro', status: 'failed_final', amount: 129.9, attempts: 5, lastError: 'x' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCan = () => true;
  get.mockResolvedValue({ data: { success: true, data: ROWS, nextCursor: null } });
  post.mockResolvedValue({ data: { success: true, data: { status: 'done', amount: 47.3 } } });
});
afterEach(() => resetViewport());

describe('caracterização: chamadas ao servidor (página antiga e nova)', () => {
  it('lista sem filtro e com filtro de status', async () => {
    render(<AdminEstornosPage />);
    await screen.findByText(/Loja Um/);
    expect(get).toHaveBeenCalledWith('/admin/direct-refunds', { params: {} });
    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'uncertain' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/direct-refunds', { params: { status: 'uncertain' } }));
  });

  it('estornar: POST /orders/:orderId/refund-direct sem corpo', async () => {
    render(<AdminEstornosPage />);
    await screen.findByText(/Loja Um/);
    fireEvent.click(screen.getAllByRole('button', { name: /^(Estornar|Devolver R\$ .+)$/ })[0]);
    const ok = screen.queryByRole('button', { name: 'Confirmar devolução' });
    if (ok) fireEvent.click(ok);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/refund-direct'));
    expect(post.mock.calls[0]).toHaveLength(1);
  });

  it('resolver: POST /admin/direct-refunds/:id/resolve { note } com a nota sem espaços nas pontas', async () => {
    render(<AdminEstornosPage />);
    await screen.findByText(/Loja Dois/);
    fireEvent.click(screen.getAllByRole('button', { name: /^(Marcar como resolvido|Resolver com nota)$/ })[1]);
    fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: '  conferido no painel do Asaas  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar resolução' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/direct-refunds/r2/resolve', { note: 'conferido no painel do Asaas' }));
  });
});

describe('tela nova', () => {
  it('"Devolver R$ X" em falha e "Reabrir e devolver" em falha final; incerto e concluído sem devolver', async () => {
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    expect(screen.getByRole('button', { name: 'Devolver R$ 47,30' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir e devolver R$ 129,90' })).toBeInTheDocument();
    const uncertain = screen.getByText('Loja Dois').closest('tr')!;
    expect(within(uncertain).queryByRole('button', { name: /Devolver/ })).not.toBeInTheDocument();
    expect(within(uncertain).getByRole('button', { name: 'Resolver com nota' })).toBeInTheDocument();
    const done = screen.getByText('Loja Tres').closest('tr')!;
    expect(within(done).queryByRole('button')).not.toBeInTheDocument();
  });

  it('devolver pede confirmação antes de chamar o servidor', async () => {
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    fireEvent.click(screen.getByRole('button', { name: 'Devolver R$ 47,30' }));
    expect(post).not.toHaveBeenCalled();
    const sheet = screen.getByRole('dialog', { name: 'Devolver R$ 47,30 ao cliente' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/refund-direct'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Devolução pedida ao Asaas.', 'success'));
  });

  it('dois cliques seguidos em "Confirmar devolução": um POST só', async () => {
    let release: (v: unknown) => void = () => {};
    post.mockImplementationOnce(() => new Promise((res) => { release = res; }));
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    fireEvent.click(screen.getByRole('button', { name: 'Devolver R$ 47,30' }));
    const sheet = screen.getByRole('dialog', { name: 'Devolver R$ 47,30 ao cliente' });
    const confirm = within(sheet).getByRole('button', { name: 'Confirmar devolução' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(post).toHaveBeenCalledTimes(1);
    release({ data: { success: true } });
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Devolução pedida ao Asaas.', 'success'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('409 da trava (já concluído): mensagem na folha, sem toast de sucesso, e a lista é relida', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { success: false, error: { message: 'Este estorno já foi concluído', code: 'REFUND_ALREADY_DONE' } } } });
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    fireEvent.click(screen.getByRole('button', { name: 'Devolver R$ 47,30' }));
    const sheet = screen.getByRole('dialog', { name: 'Devolver R$ 47,30 ao cliente' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirmar devolução' }));
    expect(await within(sheet).findByText('Este estorno já foi concluído')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(mockToast).not.toHaveBeenCalledWith('Devolução pedida ao Asaas.', 'success');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sem payout:release: nenhum botão de ação', async () => {
    mockCan = (p) => p === 'payout:view';
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    expect(screen.queryByRole('button', { name: /Devolver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolver com nota' })).not.toBeInTheDocument();
  });

  it('primeira leitura falha: erro com "Tentar de novo", sem lista', async () => {
    get.mockRejectedValueOnce(new Error('500'));
    render(<AdminEstornosPage />);
    expect(await screen.findByText('Não foi possível carregar os estornos.')).toBeInTheDocument();
    expect(screen.queryByText(/Loja Um/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Loja Um')).toBeInTheDocument();
  });

  it('celular: cartões com a ação no cartão', async () => {
    setViewportWidth(360);
    render(<AdminEstornosPage />);
    await screen.findByText('Loja Um');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = screen.getByText('Loja Um').closest('li')!;
    expect(within(card).getByRole('button', { name: 'Devolver R$ 47,30' })).toBeInTheDocument();
  });
});
