import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
let mockQuery: Record<string, string> = {};
const acceptSession = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, back: jest.fn(), query: mockQuery }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ acceptSession }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = api.post as jest.Mock;

import EsqueciSenhaPage from '../pages/esqueci-senha';

beforeEach(() => { push.mockClear(); acceptSession.mockClear(); post.mockReset(); mockQuery = {}; });

async function irParaOCodigo() {
  post.mockResolvedValueOnce({ data: { message: 'ok' } });
  render(<EsqueciSenhaPage />);
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana.souza@email.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
  expect(await screen.findByText('Código enviado para a***@email.com')).toBeInTheDocument();
}
const salvar = (code: string) => {
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar e entrar' }));
};

test('2 passos: código + nova senha, salva e já entra (vai ao Início)', async () => {
  await irParaOCodigo();
  post.mockResolvedValueOnce({ data: { message: 'ok', user: { id: 'u1', email: 'ana.souza@email.com' } } });
  salvar('482190');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/inicio'));
  expect(post).toHaveBeenLastCalledWith('/auth/reset-password', { email: 'ana.souza@email.com', code: '482190', newPassword: 'NovaSenha1' });
  expect(acceptSession).toHaveBeenCalledWith({ id: 'u1', email: 'ana.souza@email.com' });
});

test('next externo é ignorado (vai ao Início); next interno é respeitado', async () => {
  mockQuery = { next: '//evil.example' };
  await irParaOCodigo();
  post.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
  salvar('482190');
  await waitFor(() => expect(push).toHaveBeenCalledWith('/inicio'));
});

test('código errado: erro no campo com as tentativas que faltam', async () => {
  await irParaOCodigo();
  post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Código incorreto', attemptsLeft: 2 } } });
  salvar('000000');
  expect(await screen.findByText('Código incorreto. Faltam 2 tentativas.')).toBeInTheDocument();
  expect(acceptSession).not.toHaveBeenCalled();
});

test('código travado: "Enviar outro código" pede um novo', async () => {
  await irParaOCodigo();
  post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Muitas tentativas. Peça outro código.', code: 'RESET_CODE_LOCKED', attemptsLeft: 0 } } });
  salvar('000000');
  expect(await screen.findByText('Muitas tentativas. Peça outro código.')).toBeInTheDocument();
  post.mockResolvedValueOnce({ data: { message: 'ok' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar outro código' }));
  await waitFor(() => expect(post).toHaveBeenLastCalledWith('/auth/forgot-password', { email: 'ana.souza@email.com' }));
});

test('conta bloqueada: troca a senha, não entra e diz o porquê', async () => {
  await irParaOCodigo();
  post.mockResolvedValueOnce({ data: { message: 'Senha redefinida. Sua conta está bloqueada: fale com o suporte.', blocked: true } });
  salvar('482190');
  expect(await screen.findByText('Senha redefinida. Sua conta está bloqueada: fale com o suporte.')).toBeInTheDocument();
  expect(acceptSession).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});
