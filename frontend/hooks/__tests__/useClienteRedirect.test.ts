import { renderHook } from '@testing-library/react';

const replace = jest.fn();
let mockUser: any = null;
let mockLoading = false;
jest.mock('next/router', () => ({ useRouter: () => ({ replace }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: mockLoading }) }));
import { useClienteRedirect } from '../useClienteRedirect';

beforeEach(() => { replace.mockClear(); mockLoading = false; });
it('cliente vai para a tela nova', () => {
  mockUser = { activeRole: 'cliente' };
  renderHook(() => useClienteRedirect('/pedido/o1'));
  expect(replace).toHaveBeenCalledWith('/pedido/o1');
});
it('painéis ficam onde estão; sem destino, nada', () => {
  mockUser = { activeRole: 'lojista' };
  renderHook(() => useClienteRedirect('/pedido/o1'));
  mockUser = { activeRole: 'cliente' };
  renderHook(() => useClienteRedirect(null));
  expect(replace).not.toHaveBeenCalled();
});

it.each(['motoboy', 'admin', 'lojista'])('papel %s não é redirecionado', (role) => {
  mockUser = { activeRole: role };
  renderHook(() => useClienteRedirect('/pedido/o1'));
  expect(replace).not.toHaveBeenCalled();
});
it('enquanto carrega, não redireciona', () => {
  mockUser = { activeRole: 'cliente' };
  mockLoading = true;
  renderHook(() => useClienteRedirect('/pedido/o1'));
  expect(replace).not.toHaveBeenCalled();
});
