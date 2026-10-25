import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', id: 'u1' } }) }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [
  { _id: 'abc123def456', storeName: 'Eletro Center', status: 'pago', createdAt: '2026-10-10T14:02:00', products: [] },
], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock;
import AjudaPage from '../pages/conta/ajuda';

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/support/tickets'
    ? [{ _id: 't1', subject: 'Estorno do #4790', status: 'resolvido', conversationId: 'c1', createdAt: '2026-09-02T10:00:00' }]
    : { messages: [] } }));
  post.mockResolvedValue({ data: { _id: 't2', conversationId: 'c2' } });
});

test('pedido recente abre o chamado com o pedido no assunto e o orderId', async () => {
  render(<AjudaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /#DEF456 · Eletro Center/ }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Pedido #DEF456 · Eletro Center', orderId: 'abc123def456' }));
  expect(await screen.findByLabelText('Mensagem')).toBeInTheDocument();
});

test('dúvidas comuns abrem a resposta; conversas mostram o status', async () => {
  render(<AjudaPage />);
  fireEvent.click(screen.getByText('Quando meu estorno cai?'));
  expect(screen.getByText(/Pix.*1 dia útil/)).toBeVisible();
  expect(await screen.findByText('Estorno do #4790')).toBeInTheDocument();
  expect(screen.getByText('Resolvido')).toBeInTheDocument();
});

test('"Falar com a gente" abre um chamado geral', async () => {
  render(<AjudaPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Falar com a gente' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Ajuda pelo app' }));
});

test('chamado já aberto sobre o mesmo pedido é reaberto, não duplicado', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/support/tickets'
    ? [{ _id: 't9', subject: 'Pedido #DEF456 · Eletro Center', status: 'aberto', conversationId: 'c9', createdAt: '2026-10-10T15:00:00' }]
    : { messages: [] } }));
  render(<AjudaPage />);
  await screen.findByText('Aberto');
  fireEvent.click(screen.getAllByRole('button', { name: /#DEF456 · Eletro Center/ })[0]);
  expect(await screen.findByLabelText('Mensagem')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
