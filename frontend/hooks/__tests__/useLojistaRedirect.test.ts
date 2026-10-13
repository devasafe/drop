import { renderHook } from '@testing-library/react';

const mockReplace = jest.fn();
let mockUser: any = null;
let mockLoading = false;
jest.mock('next/router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: mockLoading }) }));
import { useLojistaRedirect } from '../useLojistaRedirect';

beforeEach(() => { mockReplace.mockClear(); mockLoading = false; });

it('lojista vai para a tela nova da loja', () => {
  mockUser = { activeRole: 'lojista' };
  renderHook(() => useLojistaRedirect('/seller/notificacoes'));
  expect(mockReplace).toHaveBeenCalledWith('/seller/notificacoes');
});

it.each(['cliente', 'motoboy', 'ceo'])('papel %s não é redirecionado', (role) => {
  mockUser = { activeRole: role };
  renderHook(() => useLojistaRedirect('/seller/notificacoes'));
  expect(mockReplace).not.toHaveBeenCalled();
});

it('sem destino ou carregando, nada', () => {
  mockUser = { activeRole: 'lojista' };
  renderHook(() => useLojistaRedirect(null));
  mockLoading = true;
  renderHook(() => useLojistaRedirect('/seller/notificacoes'));
  expect(mockReplace).not.toHaveBeenCalled();
});

it('sem usuário carregado, nada (fail closed)', () => {
  mockUser = null;
  renderHook(() => useLojistaRedirect('/seller/notificacoes'));
  expect(mockReplace).not.toHaveBeenCalled();
});
