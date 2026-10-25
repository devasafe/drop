import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', id: 'u1' } }) }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [
  { _id: 'abc123def456', storeName: 'Eletro Center', status: 'entregue', totalValue: 244, createdAt: '2026-10-10T14:02:00', products: [] },
], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock;
import AjudaPage from '../pages/conta/ajuda';

const order = { _id: 'abc123def456', storeName: 'Eletro Center', status: 'entregue', totalValue: 244, createdAt: '2026-10-10T14:02:00' };
let tickets: any[] = [];

beforeEach(() => {
  get.mockReset(); post.mockReset();
  tickets = [];
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/support/tickets' ? tickets : { messages: [] } }));
  post.mockResolvedValue({ data: { ticket: { id: 't2', _id: 't2', orderId: 'abc123def456', status: 'aberto', assignedTo: [] }, conversationId: 'c2' } });
});

/** Chat de suporte (DS v2): o chamado nasce com o pedido e a conversa já mostra o card dele. */
test('tocar no pedido abre o chamado com o orderId e a conversa mostra o pedido', async () => {
  render(<AjudaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /#DEF456 · Eletro Center/ }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Pedido #DEF456 · Eletro Center', orderId: 'abc123def456' }));
  expect(await screen.findByText('Chamado sobre o pedido #DEF456')).toBeInTheDocument();
  expect(screen.getByLabelText('Mensagem')).toBeInTheDocument();
});

test('chamado aberto do mesmo pedido é retomado pelo orderId, mesmo com outro assunto', async () => {
  tickets = [{ _id: 't9', subject: 'Faltou o cabo', orderId: 'abc123def456', order, status: 'em_atendimento', assignedTo: [{ userId: 's1', name: 'Marina' }], conversationId: 'c9', createdAt: '2026-10-10T15:00:00' }];
  render(<AjudaPage />);
  await screen.findByText('Faltou o cabo · #DEF456');
  fireEvent.click(screen.getByRole('button', { name: /#DEF456 · Eletro Center/ }));
  expect(await screen.findByText('Chamado sobre o pedido #DEF456')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('"Abrir outro chamado" num resolvido abre um novo com o mesmo pedido', async () => {
  tickets = [{ _id: 't8', subject: 'Estorno', orderId: 'abc123def456', order, status: 'resolvido', resolvedAt: '2026-10-11T10:00:00', assignedTo: [], conversationId: 'c8', createdAt: '2026-10-10T15:00:00' }];
  render(<AjudaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Estorno · #DEF456/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir outro chamado' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Estorno', orderId: 'abc123def456' }));
});
