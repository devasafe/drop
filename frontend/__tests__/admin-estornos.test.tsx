import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminEstornos from '../pages/admin/estornos';
import { DirectRefundCard } from '../components/order/DirectRefundCard';
import { humanizeRefundError } from '../lib/refundErrors';
import { visibleAdminMenu } from '../lib/adminMenu';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/estornos' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { activeRole: 'ceo', role: 'ceo', name: 'C' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() },
}));

const rows = [
  { id: 'r1', orderId: 'o1', storeName: 'Loja Um', status: 'failed', amount: 50, attempts: 2, lastError: 'Saldo insuficiente' },
  { id: 'r2', orderId: 'o2', storeName: 'Loja Dois', status: 'uncertain', amount: 30, attempts: 1, lastError: 'UNCERTAIN' },
  { id: 'r3', orderId: 'o3', storeName: 'Loja Tres', status: 'done', amount: 10, attempts: 1, lastError: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: rows } });
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { status: 'done', amount: 50 } } });
});

test('lista com erro legivel e botoes conforme o status', async () => {
  render(<AdminEstornos />);
  expect(await screen.findByText('A loja não tem saldo no Asaas para este estorno')).toBeInTheDocument();
  expect(screen.getByText('Resultado incerto no Asaas — aguardando conferência do admin')).toBeInTheDocument();
  expect(screen.getAllByText('Estornar')).toHaveLength(1);
  expect(screen.getAllByText('Marcar como resolvido')).toHaveLength(2);
});

test('filtro de status vai na query', async () => {
  render(<AdminEstornos />);
  await screen.findByText(/Loja Um/);
  fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'uncertain' } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/direct-refunds', { params: { status: 'uncertain' } }));
});

test('resolver exige nota de 10+ caracteres e chama o endpoint', async () => {
  render(<AdminEstornos />);
  await screen.findByText(/Loja Dois/);
  fireEvent.click(screen.getAllByText('Marcar como resolvido')[1]);
  const confirm = screen.getByText('Confirmar resolução');
  fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'curta' } });
  expect(confirm.closest('button')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Nota da conferência'), { target: { value: 'conferido no painel do Asaas' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/direct-refunds/r2/resolve', { note: 'conferido no painel do Asaas' }));
});

test('card do pedido: botao some quando done; mostra erro legivel quando failed', async () => {
  const { unmount } = render(<DirectRefundCard orderId="o1" refund={{ status: 'failed', amount: 50, lastError: 'Saldo insuficiente' }} />);
  expect(screen.getByText('A loja não tem saldo no Asaas para este estorno')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Estornar'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders/o1/refund-direct'));
  await waitFor(() => expect(screen.queryByText('Estornar')).not.toBeInTheDocument());
  unmount();
  render(<DirectRefundCard orderId="o1" refund={{ status: 'done', amount: 50 }} />);
  expect(screen.queryByText('Estornar')).not.toBeInTheDocument();
});

test('card: uncertain e failed_final nao tem botao', () => {
  const { unmount } = render(<DirectRefundCard orderId="o1" refund={{ status: 'uncertain', amount: 50, lastError: 'UNCERTAIN' }} />);
  expect(screen.queryByText('Estornar')).not.toBeInTheDocument();
  unmount();
  render(<DirectRefundCard orderId="o1" refund={{ status: 'failed_final', amount: 50, lastError: 'x' }} />);
  expect(screen.queryByText('Estornar')).not.toBeInTheDocument();
});

test('humanizeRefundError: fallback mostra o texto cru', () => {
  expect(humanizeRefundError('Algo estranho')).toBe('Algo estranho');
  expect(humanizeRefundError(null)).toBeNull();
  expect(humanizeRefundError('STUCK_REQUESTED')).toMatch(/incerto/);
});

test('menu: item Estornos so com payout:view e marcado directOnly', () => {
  const can = (p: string) => p === 'payout:view';
  const item = visibleAdminMenu(can, false).find((m) => m.href === '/admin/estornos');
  expect(item).toBeDefined();
  expect(item!.directOnly).toBe(true);
  expect(visibleAdminMenu(() => false, false).some((m) => m.href === '/admin/estornos')).toBe(false);
});
