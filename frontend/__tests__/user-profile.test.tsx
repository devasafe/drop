import { render, screen, fireEvent } from '@testing-library/react';
import UserProfile from '../pages/user-profile';

const push = jest.fn();
const logout = jest.fn();

jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Asafe', email: 'asafe@email.com', activeRole: 'cliente' }, logout, loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: {} })) } }));
jest.mock('../components/StoreRatingsBlock', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/LoadingSkeleton', () => ({ __esModule: true, default: () => null }));

beforeEach(() => { push.mockClear(); logout.mockClear(); });

describe('Conta (/user-profile)', () => {
  it('mostra o hub: nome + linhas de atalho, sem card de formulário', () => {
    render(<UserProfile />);
    expect(screen.getByText('Asafe')).toBeInTheDocument();
    ['Meus dados', 'Verificações e segurança', 'Notificações', 'Endereços', 'Sair'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('Meus dados leva para /editar-conta', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Meus dados'));
    expect(push).toHaveBeenCalledWith('/editar-conta');
  });

  it('Endereços faz deep-link para a aba de endereços', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Endereços'));
    expect(push).toHaveBeenCalledWith('/user-dashboard?tab=addresses');
  });

  it('Sair chama logout', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Sair'));
    expect(logout).toHaveBeenCalled();
  });
});
