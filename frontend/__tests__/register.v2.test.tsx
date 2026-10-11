import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
let mockQuery: Record<string, string> = {};
const login = jest.fn(async () => ({}));
jest.mock('next/router', () => ({ useRouter: () => ({ push, back: jest.fn(), query: mockQuery }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = api.post as jest.Mock;

import RegisterPage from '../pages/register';

beforeEach(() => { push.mockClear(); login.mockClear(); post.mockReset(); mockQuery = {}; });

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@email.com' } });
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '11987654321' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'abcdefgh12' } });
}

test('cliente: 4 campos + aceite, sem tipo de conta; manda sem role e vai verificar', async () => {
  post.mockResolvedValue({ data: { id: 'u1' } });
  render(<RegisterPage />);
  expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
  expect(screen.queryByText('Tipo de conta')).toBeNull();
  preencher();
  expect(screen.getByText('Boa: 10 caracteres com número')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/conta?secao=verificacao'));
  expect(post.mock.calls[0][0]).toBe('/auth/register');
  const body = post.mock.calls[0][1];
  expect(body).toMatchObject({ name: 'Ana Souza', email: 'ana@email.com', telefone: '11987654321', password: 'abcdefgh12' });
  expect(body).not.toHaveProperty('role');
  expect(login).toHaveBeenCalledWith('ana@email.com', 'abcdefgh12');
});

test('sem aceite: diz o que falta e não chama a API', () => {
  render(<RegisterPage />);
  preencher();
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(screen.getByText('Aceite os Termos de Uso e a Política de Privacidade para continuar.')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('e-mail já usado: oferece entrar levando o next, e os campos ficam', async () => {
  mockQuery = { next: '/sacola' };
  post.mockRejectedValue({ response: { status: 409, data: { error: 'User already exists' } } });
  render(<RegisterPage />);
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(await screen.findByText('Esse e-mail já tem conta.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(push).toHaveBeenCalledWith('/login?next=%2Fsacola');
  expect((screen.getByLabelText('Nome completo') as HTMLInputElement).value).toBe('Ana Souza');
});

test('?papel=motoboy: entrada própria, manda o papel e segue o onboarding de hoje', async () => {
  mockQuery = { papel: 'motoboy' };
  post.mockResolvedValue({ data: { id: 'u2' } });
  render(<RegisterPage />);
  expect(screen.getByRole('heading', { name: 'Entregue com a DROP' })).toBeInTheDocument();
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/verificacao?onboarding=1'));
  expect(post.mock.calls[0][1]).toMatchObject({ role: 'motoboy' });
});
