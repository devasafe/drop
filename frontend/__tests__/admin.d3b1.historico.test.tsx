/**
 * D3b-1 · P3.1 — Histórico do Dinheiro com o cancelamento do admin (P2.3 grava AdminMoneyAction
 * order_admin_cancel, alvo 'order'): a linha mostra "Pedido cancelado pelo admin" e "Pedido #xxxxxx", e o tipo
 * entra no filtro "Ação".
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { ACTION_TYPE_LABEL, ADMIN_MONEY_ACTION_TYPES, actionTargetLabel } from '../lib/adminMoney';
import AdminDinheiroHistoricoPage from '../pages/admin/dinheiro/historico';

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/dinheiro/historico', asPath: '/admin/dinheiro/historico',
  }),
}));
const mockUser = { id: 'adm1', name: 'Marina', role: 'ceo', activeRole: 'ceo' };
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const get = api.get as jest.Mock;

const CANCELAMENTO = {
  id: 'a9', at: '2026-10-20T16:00:00.000Z', actorId: 'clx9', actorName: 'Marina Rocha', actorRole: 'ceo',
  type: 'order_admin_cancel', targetType: 'order', targetId: 'ord000a1b2c3', amount: 59.9,
  reason: 'Loja fechou sem avisar', before: null, after: null,
};
const page = (items: unknown[]) => ({ items, nextCursor: null });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === '/admin/money/actions') return Promise.resolve({ data: page([CANCELAMENTO]) });
    if (url === '/admin/money/actions?type=order_admin_cancel') return Promise.resolve({ data: page([CANCELAMENTO]) });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
});

it('o tipo novo tem rótulo e alvo em português', () => {
  expect(ADMIN_MONEY_ACTION_TYPES).toContain('order_admin_cancel');
  expect(ACTION_TYPE_LABEL.order_admin_cancel).toBe('Pedido cancelado pelo admin');
  expect(actionTargetLabel('order', 'ord000a1b2c3')).toBe('Pedido #a1b2c3');
});

it('a linha mostra "Pedido cancelado pelo admin", o pedido, quem, o valor e o motivo', async () => {
  render(<AdminDinheiroHistoricoPage />);
  const table = await screen.findByRole('table', { name: 'Ações de dinheiro' });
  const [, linha] = within(table).getAllByRole('row');
  expect(linha).toHaveTextContent('Pedido cancelado pelo admin');
  expect(linha).toHaveTextContent('Pedido #a1b2c3');
  expect(linha).toHaveTextContent('Marina Rocha');
  expect(linha).toHaveTextContent('R$ 59,90');
  expect(linha).toHaveTextContent('Loja fechou sem avisar');
  expect(linha).not.toHaveTextContent('order_admin_cancel');
});

it('o filtro "Ação" tem o tipo novo e relê com ?type=order_admin_cancel', async () => {
  render(<AdminDinheiroHistoricoPage />);
  await screen.findByRole('table', { name: 'Ações de dinheiro' });
  const acao = screen.getByLabelText('Ação') as HTMLSelectElement;
  expect(Array.from(acao.options).map((o) => o.textContent)).toContain('Pedido cancelado pelo admin');
  fireEvent.change(acao, { target: { value: 'order_admin_cancel' } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/admin/money/actions?type=order_admin_cancel'));
});
