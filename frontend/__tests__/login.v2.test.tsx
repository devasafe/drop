import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const push = jest.fn();
let mockQuery: Record<string, string> = {};
let mockCart: any = { cart: [] };
let mockOnline = true;
const login = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, query: mockQuery, asPath: '/login', pathname: '/login' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }));
jest.mock('../contexts/CartContext', () => ({ useCart: () => mockCart }));
jest.mock('../hooks/useOnline', () => ({ useOnline: () => mockOnline }));

import LoginPage from '../pages/login';

beforeEach(() => { push.mockClear(); login.mockReset(); mockQuery = {}; mockCart = { cart: [] }; mockOnline = true; });

const preencher = () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@email.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
};

test('título do protótipo e o motivo para entrar (sacola guardada)', () => {
  mockCart = { cart: [{ quantity: 1 }, { quantity: 1 }] };
  render(<LoginPage />);
  expect(screen.getByRole('heading', { name: 'Entre para continuar' })).toBeInTheDocument();
  expect(screen.getByText('Sua sacola com 2 itens fica guardada.')).toBeInTheDocument();
});

test('erro 401 diz o que fazer e quantas tentativas faltam', async () => {
  login.mockRejectedValue({ response: { status: 401, data: { error: 'Invalid credentials', attemptsLeft: 3 } } });
  render(<LoginPage />);
  preencher();
  expect(await screen.findByText('E-mail ou senha não conferem')).toBeInTheDocument();
  expect(screen.getByText('Faltam 3 tentativas antes de uma pausa de 15 min.')).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});

test('links levam o caminho de volta (next) para senha e cadastro', () => {
  mockQuery = { next: '/sacola' };
  render(<LoginPage />);
  expect(screen.getByRole('link', { name: 'Esqueci a senha' })).toHaveAttribute('href', '/esqueci-senha?next=%2Fsacola');
  expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register?next=%2Fsacola');
});

test('sem internet: botão desativado e o motivo', () => {
  mockOnline = false;
  render(<LoginPage />);
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  expect(screen.getByText('Sem internet')).toBeInTheDocument();
});

test('sucesso sem next vai para a raiz (que redireciona ao Início)', async () => {
  login.mockResolvedValue({});
  render(<LoginPage />);
  preencher();
  await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
});
