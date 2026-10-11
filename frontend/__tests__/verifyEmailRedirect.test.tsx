import { render, waitFor } from '@testing-library/react';
import api from '../lib/api';

const replace = jest.fn();
let mockQuery: Record<string, string> = {};
jest.mock('next/router', () => ({ useRouter: () => ({ replace, push: jest.fn(), query: mockQuery, isReady: true }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'cliente' }, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = api.post as jest.Mock;

import VerifyEmailPage from '../pages/verify-email';

beforeEach(() => { replace.mockClear(); post.mockReset(); mockQuery = {}; });

test('cliente com token: confirma primeiro e depois leva o resultado à Conta', async () => {
  mockQuery = { token: 'abc', next: '/sacola' };
  let resolve!: (v: unknown) => void;
  post.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<VerifyEmailPage />);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/email/verify', { token: 'abc' }));
  expect(replace).not.toHaveBeenCalled();
  resolve({ data: {} });
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/conta?secao=verificacao&next=%2Fsacola&email=ok'));
});

test('token inválido: leva o erro', async () => {
  mockQuery = { token: 'ruim' };
  post.mockRejectedValue({ response: { data: { error: 'x' } } });
  render(<VerifyEmailPage />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/conta?secao=verificacao&email=erro'));
});

test('sem token: redireciona direto', async () => {
  render(<VerifyEmailPage />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/conta?secao=verificacao'));
  expect(post).not.toHaveBeenCalled();
});
