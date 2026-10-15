import { renderHook } from '@testing-library/react';

const mockReplace = jest.fn();
let mockUser: any = null;
let mockLoading = false;
jest.mock('next/router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: mockLoading }) }));
import { useMotoboyRedirect } from '../useMotoboyRedirect';

beforeEach(() => { mockReplace.mockClear(); mockLoading = false; });

it('motoboy vai para a tela nova', () => {
  mockUser = { activeRole: 'motoboy' };
  renderHook(() => useMotoboyRedirect('/motoboy/notificacoes'));
  expect(mockReplace).toHaveBeenCalledWith('/motoboy/notificacoes');
});

it.each(['cliente', 'lojista', 'ceo'])('papel %s não é redirecionado', (role) => {
  mockUser = { activeRole: role };
  renderHook(() => useMotoboyRedirect('/motoboy/notificacoes'));
  expect(mockReplace).not.toHaveBeenCalled();
});

it('sem destino, carregando ou sem usuário: nada (fail closed)', () => {
  mockUser = { activeRole: 'motoboy' };
  renderHook(() => useMotoboyRedirect(null));
  mockLoading = true;
  renderHook(() => useMotoboyRedirect('/motoboy/notificacoes'));
  mockLoading = false; mockUser = null;
  renderHook(() => useMotoboyRedirect('/motoboy/notificacoes'));
  expect(mockReplace).not.toHaveBeenCalled();
});
