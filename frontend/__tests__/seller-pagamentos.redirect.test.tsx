import { render, waitFor } from '@testing-library/react';
import SellerPagamentos from '../pages/seller/pagamentos';
import api from '../lib/api';

const mockReplace = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace, query: mockQuery, pathname: '/seller/pagamentos', isReady: true }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const mockAsaas = (data: any) =>
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' } } });
    if (url === '/stores/s1/asaas') return Promise.resolve({ data: { success: true, data } });
    return Promise.resolve({ data: {} });
  });

beforeEach(() => { jest.clearAllMocks(); mockQuery = {}; });

test('no cadastro vai direto para a Conta Asaas', async () => {
  mockQuery = { onboarding: '1' };
  render(<SellerPagamentos />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/conta-asaas?onboarding=1'));
  expect(api.get).not.toHaveBeenCalled();
});

test('conta sem aceite: Conta Asaas', async () => {
  mockAsaas({ status: 'valid', consent: null });
  render(<SellerPagamentos />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/conta-asaas'));
});

test('conta não válida: Conta Asaas', async () => {
  mockAsaas({ status: 'none', consent: null });
  render(<SellerPagamentos />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/conta-asaas'));
});

test('conta pronta: Dinheiro', async () => {
  mockAsaas({ status: 'valid', consent: { version: 'v', acceptedAt: 'x' } });
  render(<SellerPagamentos />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/dinheiro'));
});

test('falha na leitura: Dinheiro', async () => {
  (api.get as jest.Mock).mockRejectedValue(new Error('rede'));
  render(<SellerPagamentos />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/dinheiro'));
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
