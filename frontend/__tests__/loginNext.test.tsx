import { render, fireEvent, screen, waitFor } from '@testing-library/react';

// Minor M4: o visitante que monta a sacola e é mandado ao login volta para a sacola.
const push = jest.fn();
let mockQuery: Record<string, string> = {};
let mockAsPath = '/sacola';
let mockAuth: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push, query: mockQuery, asPath: mockAsPath, pathname: mockAsPath }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../components/auth/AuthLayout', () => ({ __esModule: true, default: ({ children }: any) => <div>{children}</div> }));

import ProtectedRoute from '../components/ProtectedRoute';
import LoginPage from '../pages/login';

beforeEach(() => { push.mockClear(); mockQuery = {}; mockAsPath = '/sacola'; });

test('visitante em /sacola vai ao login levando o caminho de volta', () => {
  mockAuth = { user: null, loading: false };
  render(<ProtectedRoute required_role="cliente"><p>sacola</p></ProtectedRoute>);
  expect(push).toHaveBeenCalledWith('/login?next=%2Fsacola');
});

async function doLogin() {
  const login = jest.fn(async () => {});
  mockAuth = { login };
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'x' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(login).toHaveBeenCalled());
  await waitFor(() => expect(push).toHaveBeenCalled());
}

test('login com ?next=/sacola volta para a sacola', async () => {
  mockQuery = { next: '/sacola' };
  await doLogin();
  expect(push).toHaveBeenCalledWith('/sacola');
});

test('next externo é ignorado (vai para a home)', async () => {
  mockQuery = { next: '//evil.example' };
  await doLogin();
  expect(push).toHaveBeenCalledWith('/');
});
