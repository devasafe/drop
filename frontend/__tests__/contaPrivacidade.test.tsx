import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const mockReplace = jest.fn();
const mockLogout = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', email: 'ana@email.com' }, logout: mockLogout }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
import PrivacidadePage from '../pages/conta/privacidade';

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { blockers: [] } });
});

test('direitos em linhas que abrem o e-mail preenchido; links das políticas', async () => {
  render(<PrivacidadePage />);
  expect(screen.getByRole('link', { name: /Baixar meus dados/ }).getAttribute('href')).toMatch(/^mailto:/);
  expect(screen.getByRole('link', { name: /Corrigir um dado/ })).toHaveAttribute('href', '/conta?secao=dados');
  expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
  expect(await screen.findByRole('button', { name: 'Excluir minha conta' })).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/account/deletion-check');
});

test('exclusão travada mostra o motivo que o servidor devolve', async () => {
  get.mockResolvedValue({ data: { blockers: [{ code: 'PENDING_DEBT', message: 'Há uma taxa pendente para pagar.' }, { code: 'OPEN_ORDER', message: 'Você tem um pedido em andamento.' }] } });
  render(<PrivacidadePage />);
  expect(await screen.findByText('Há uma taxa pendente para pagar.')).toBeInTheDocument();
  expect(screen.getByText('Você tem um pedido em andamento.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Excluir minha conta' })).toBeNull();
});

test('confirma com a senha, exclui, desloga e sai da conta', async () => {
  post.mockResolvedValue({ data: { message: 'Conta excluída' } });
  render(<PrivacidadePage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir de vez' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/account/delete', { password: 'Senha123!' }));
  await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  expect(mockReplace).toHaveBeenCalledWith('/inicio');
});

test('senha errada mostra o erro e mantém a conta', async () => {
  post.mockRejectedValue({ response: { data: { error: 'WRONG_PASSWORD', message: 'Senha incorreta.' } } });
  render(<PrivacidadePage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir de vez' }));
  expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument();
  expect(mockLogout).not.toHaveBeenCalled();
});
