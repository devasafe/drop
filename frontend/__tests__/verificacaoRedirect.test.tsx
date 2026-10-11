import { render } from '@testing-library/react';

const redirect = jest.fn();
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: (to: string | null) => redirect(to) }));
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { next: '/sacola' }, isReady: true, pathname: '/x' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: true }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})), post: jest.fn(() => new Promise(() => {})) } }));
jest.mock('../hooks/useRequireAuth', () => ({ __esModule: true, default: () => ({ user: null, loading: true }) }));

beforeEach(() => redirect.mockClear());

test.each([
  ['../pages/verificacao', '/conta?secao=verificacao&next=%2Fsacola'],
  ['../pages/verify-email', '/conta?secao=verificacao&next=%2Fsacola'],
  ['../pages/upload', '/conta?secao=verificacao&next=%2Fsacola'],
  ['../pages/foto-perfil', '/conta?secao=dados'],
])('%s manda só o cliente para a tela nova', (mod, to) => {
  const Page = require(mod).default;
  render(<Page />);
  expect(redirect).toHaveBeenCalledWith(to);
});
