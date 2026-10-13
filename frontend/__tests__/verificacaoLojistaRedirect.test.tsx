import { render, waitFor } from '@testing-library/react';
import api from '../lib/api';
import VerificacaoPage from '../pages/verificacao';

const mockReplace = jest.fn();
let mockUser: any = { role: 'lojista' };
let mockAuthLoading = false;
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, query: {}, isReady: true, pathname: '/verificacao' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: mockAuthLoading }) }));
jest.mock('../hooks/useClienteRedirect', () => ({ useClienteRedirect: () => {} }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const TO = '/seller/abrir?etapa=identidade';

function mockGets(dashboard: () => Promise<any>) {
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return dashboard();
    if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'none' }, phone: { status: 'none' }, document: { status: 'none' } } } });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => { jest.clearAllMocks(); mockUser = { role: 'lojista' }; mockAuthLoading = false; });

test('lojista com loja nao verificada vai para a identidade em /seller/abrir', async () => {
  mockGets(() => Promise.resolve({ data: { store: { _id: 's1', isVerified: false } } }));
  render(<VerificacaoPage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(TO));
});

test('lojista sem loja (404) tambem vai para /seller/abrir', async () => {
  mockGets(() => Promise.reject({ response: { status: 404 } }));
  render(<VerificacaoPage />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(TO));
});

async function renderAndSettle() {
  render(<VerificacaoPage />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/verification/me'));
  await new Promise((r) => setTimeout(r, 20));
}

test('sem redirect: loja verificada', async () => {
  mockGets(() => Promise.resolve({ data: { store: { _id: 's1', isVerified: true } } }));
  await renderAndSettle();
  expect(api.get).toHaveBeenCalledWith('/stores/dashboard');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('sem redirect na duvida: erro na leitura da loja', async () => {
  mockGets(() => Promise.reject({ response: { status: 500 } }));
  await renderAndSettle();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('sem redirect na duvida: leitura da loja ainda carregando', async () => {
  mockGets(() => new Promise(() => {}));
  await renderAndSettle();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('sem redirect: auth ainda carregando', async () => {
  mockAuthLoading = true;
  mockGets(() => Promise.resolve({ data: { store: { isVerified: false } } }));
  await renderAndSettle();
  expect(api.get).not.toHaveBeenCalledWith('/stores/dashboard');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('cliente nao e afetado (nem le a loja)', async () => {
  mockUser = { role: 'cliente' };
  mockGets(() => Promise.resolve({ data: { store: { isVerified: false } } }));
  await renderAndSettle();
  expect(api.get).not.toHaveBeenCalledWith('/stores/dashboard');
  expect(mockReplace).not.toHaveBeenCalled();
});
