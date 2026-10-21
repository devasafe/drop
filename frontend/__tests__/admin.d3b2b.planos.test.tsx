/**
 * D3b-2b · P3.5 — Lojas → Planos:
 * - o motivo que a loja mandou no pedido aparece no cartão;
 * - a recusa exige de 5 a 500 caracteres (o servidor responde 400 REASON_REQUIRED abaixo disso), e o texto da
 *   folha diz onde a loja vê o motivo.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlanApprovals from '../pages/admin/plan-approvals';
import api from '../lib/api';

const mockToast = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/plan-approvals', asPath: '/admin/plan-approvals' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' },
    token: null,
    loading: false,
    permissionsLoading: false,
    can: () => true,
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

const PEDIDO = {
  _id: 'sub1', storeName: 'Papelaria Central', currentPlan: 'plan1', requestedPlan: 'plan2', planChangeStatus: 'pending',
  requestedAt: '2026-10-13T12:00:00.000Z', commissionRate: 10, requestReason: 'Quero os motoboys do DROP',
};
const SEM_MOTIVO = { ...PEDIDO, _id: 'sub4', storeName: 'Bella Livros', requestReason: null };

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/settings/pending-plan-changes' ? [PEDIDO, SEM_MOTIVO] : [PEDIDO, SEM_MOTIVO] }));
  post.mockResolvedValue({ data: { subscription: { ...PEDIDO, planChangeStatus: 'rejected', rejectionReason: 'Sem vendas' } } });
});

const abrirRecusa = async () => {
  const card = await screen.findByRole('article', { name: 'Papelaria Central' });
  fireEvent.click(within(card).getByRole('button', { name: 'Recusar com motivo' }));
  return screen.findByRole('dialog', { name: 'Recusar troca de plano' });
};

it('cartão mostra o motivo da loja quando o pedido trouxe; sem motivo, nada', async () => {
  render(<PlanApprovals />);
  const card = await screen.findByRole('article', { name: 'Papelaria Central' });
  expect(within(card).getByText('Motivo da loja: Quero os motoboys do DROP')).toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Bella Livros' })).queryByText(/Motivo da loja/)).toBeNull();
});

it('recusar: menos de 5 caracteres não libera; de 5 a 500 libera; o texto diz onde a loja vê o motivo', async () => {
  render(<PlanApprovals />);
  const dialog = await abrirRecusa();
  const campo = within(dialog).getByLabelText('Motivo (obrigatório)');
  expect(campo).toHaveAttribute('maxlength', '500');
  expect(within(dialog).getByText(
    'De 5 a 500 caracteres. A loja continua no plano atual e vê o motivo no aviso e na tela do plano.',
  )).toBeInTheDocument();
  const btn = within(dialog).getByRole('button', { name: 'Recusar' });
  fireEvent.change(campo, { target: { value: '  Ruim  ' } });
  expect(btn).toBeDisabled();
  fireEvent.change(campo, { target: { value: ' Sem vendas ' } });
  expect(btn).toBeEnabled();
  fireEvent.click(btn);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/settings/reject-plan-change', { subscriptionId: 'sub1', reason: 'Sem vendas' }));
});

it('400 REASON_REQUIRED do servidor aparece na folha', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Escreva o motivo, de 5 a 500 caracteres.', code: 'REASON_REQUIRED' } } });
  render(<PlanApprovals />);
  const dialog = await abrirRecusa();
  fireEvent.change(within(dialog).getByLabelText('Motivo (obrigatório)'), { target: { value: 'Sem vendas' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Escreva o motivo, de 5 a 500 caracteres.');
});
