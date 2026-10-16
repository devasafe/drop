/**
 * D3a · P3.3 · Lojas → Planos (tela 14): cartão por pedido, aprovar/recusar só com plan:approve,
 * recusa na AdminSheet, 409 relê, fail closed, aba "Todas" em tabela e celular.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlanApprovals from '../pages/admin/plan-approvals';
import api from '../lib/api';
import { resetViewport, setViewportWidth } from './helpers/viewport';

const mockToast = jest.fn();
const mockPush = jest.fn();
let mockUser: Record<string, unknown> = {};
let mockPerms: string[] = [];
const setRole = (role: string, perms: string[] = []) => {
  mockUser = { _id: 'me', id: 'me', name: 'Marina Rocha', role, activeRole: role };
  mockPerms = perms;
};

jest.mock('next/router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/admin/plan-approvals', asPath: '/admin/plan-approvals' }),
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

const PEDIDO = {
  _id: 'sub1', storeName: 'Papelaria Central', currentPlan: 'plan1', requestedPlan: 'plan2',
  planChangeStatus: 'pending', requestedAt: '2026-10-13T12:00:00.000Z', commissionRate: 10,
};
const TODAS = [
  PEDIDO,
  { _id: 'sub2', storeName: 'Tabacaria do Centro', currentPlan: 'plan3', requestedPlan: null, planChangeStatus: 'none', commissionRate: 5 },
  { _id: 'sub3', storeName: 'Bella Livros', currentPlan: 'plan2', requestedPlan: null, planChangeStatus: 'rejected', rejectionReason: 'Loja sem vendas ainda', commissionRate: 15 },
];
const readsOk = () =>
  (api.get as jest.Mock).mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/settings/pending-plan-changes' ? [PEDIDO] : TODAS }));

beforeEach(() => {
  jest.clearAllMocks();
  setRole('ceo');
  readsOk();
  (api.post as jest.Mock).mockResolvedValue({ data: { subscription: { ...PEDIDO, currentPlan: 'plan2', requestedPlan: null, planChangeStatus: 'none', commissionRate: 15 } } });
});
afterEach(() => resetViewport());

describe('Planos · pedidos de troca', () => {
  it('cartão com "Hoje" × "Quer", data e as duas ações (plan:approve)', async () => {
    render(<PlanApprovals />);
    const card = await screen.findByRole('article', { name: 'Papelaria Central' });
    expect(within(card).getByText('Plano 1 · Vitrine, sem motoboy')).toBeInTheDocument();
    expect(within(card).getByText('Plano 2 · Vitrine com motoboys do DROP')).toBeInTheDocument();
    expect(within(card).getByText('pedido em 13/10/2026')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Recusar com motivo' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Aprovar Plano 2' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Pedidos de plano' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Pendentes1', 'Todas3']);
  });

  it('só plan:view: vê os pedidos, sem botões', async () => {
    setRole('gerente_lojistas', ['plan:view']);
    render(<PlanApprovals />);
    const card = await screen.findByRole('article', { name: 'Papelaria Central' });
    expect(within(card).queryAllByRole('button')).toEqual([]);
  });

  it('aprovar: POST, o cartão sai e o toast confirma', async () => {
    render(<PlanApprovals />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar Plano 2' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/settings/approve-plan-change', { subscriptionId: 'sub1' }));
    expect(await screen.findByText('Nenhum pedido de troca aguardando')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('Plano 2 aprovado para Papelaria Central.', 'success');
  });

  it('409 (não está mais pendente): mostra o texto do servidor e relê as listas', async () => {
    (api.post as jest.Mock).mockRejectedValue({
      response: { status: 409, data: { error: 'Esta troca de plano não está mais pendente.', code: 'PLAN_CHANGE_NOT_PENDING' } },
    });
    render(<PlanApprovals />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar Plano 2' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Esta troca de plano não está mais pendente.', 'error'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
  });

  it('recusar: motivo obrigatório na AdminSheet; erro do servidor dentro; sucesso tira o cartão', async () => {
    (api.post as jest.Mock)
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao rejeitar mudança' } } })
      .mockResolvedValueOnce({ data: { subscription: { ...PEDIDO, planChangeStatus: 'rejected', rejectionReason: 'Loja sem vendas' } } });
    render(<PlanApprovals />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recusar com motivo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recusar troca de plano' });
    expect(within(dialog).getByText(/Papelaria Central/)).toBeInTheDocument();
    const btn = within(dialog).getByRole('button', { name: 'Recusar' });
    expect(btn).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: ' Loja sem vendas ' } });
    fireEvent.click(btn);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro ao rejeitar mudança');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.post).toHaveBeenLastCalledWith('/settings/reject-plan-change', { subscriptionId: 'sub1', reason: 'Loja sem vendas' });
    expect(screen.getByText('Nenhum pedido de troca aguardando')).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith('Pedido recusado.', 'success');
  });
});

describe('Planos · aba "Todas", guarda e falhas', () => {
  it('tabela com plano, situação e comissão', async () => {
    render(<PlanApprovals />);
    await screen.findByRole('article', { name: 'Papelaria Central' });
    fireEvent.click(screen.getByRole('tab', { name: /Todas/ }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Loja', 'Plano', 'Situação', 'Comissão']);
    const bella = within(table).getByText('Bella Livros').closest('tr') as HTMLElement;
    expect(within(bella).getByText('Recusado')).toBeInTheDocument();
    expect(within(bella).getByText('Loja sem vendas ainda')).toBeInTheDocument();
    expect(within(bella).getByText('15%')).toBeInTheDocument();
    const papelaria = within(table).getByText('Papelaria Central').closest('tr') as HTMLElement;
    expect(within(papelaria).getByText('Pede Plano 2')).toBeInTheDocument();
  });

  it('sem plan:view: vai para /access-denied e não lê nada', async () => {
    setRole('gerente_lojistas', []);
    const { container } = render(<PlanApprovals />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/access-denied'));
    expect(api.get).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('leitura que falha: erro com "Tentar de novo", nunca "nenhum pedido"', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao buscar requisições pendentes' } } });
    render(<PlanApprovals />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar os pedidos de plano.');
    expect(screen.queryByText('Nenhum pedido de troca aguardando')).toBeNull();
    readsOk();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('article', { name: 'Papelaria Central' })).toBeInTheDocument();
  });

  it('celular: "Todas" em cartões e os botões do pedido com toque de 44 px', async () => {
    setViewportWidth(360);
    render(<PlanApprovals />);
    const card = await screen.findByRole('article', { name: 'Papelaria Central' });
    expect(within(card).getByRole('button', { name: 'Aprovar Plano 2' }).className).toContain('touch');
    fireEvent.click(screen.getByRole('tab', { name: /Todas/ }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Assinaturas' })).getAllByRole('listitem')).toHaveLength(3);
  });
});
