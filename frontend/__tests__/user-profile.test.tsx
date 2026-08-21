import { render, screen, fireEvent } from '@testing-library/react';
import UserProfile from '../pages/user-profile';

const push = jest.fn();
const logout = jest.fn();

jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {} }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Asafe', email: 'asafe@email.com', activeRole: 'cliente' }, logout, loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => Promise.resolve({ data: {} })), patch: jest.fn(() => Promise.resolve({ data: {} })) } }));
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: [], loading: false }) }));
jest.mock('../components/StoreRatingsBlock', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/LoadingSkeleton', () => ({ __esModule: true, default: () => null }));
// Seções renderizadas inline no painel direito — mockadas p/ isolar a navegação por abas.
jest.mock('../components/MeusDadosForm', () => ({ __esModule: true, default: () => <div>MEUS_DADOS_FORM</div> }));
jest.mock('../components/VerificationHub', () => ({ __esModule: true, default: () => <div>VERIFICATION_HUB</div> }));
jest.mock('../components/AddressManager', () => ({ __esModule: true, default: () => <div>ADDRESS_MANAGER</div> }));

beforeEach(() => {
  push.mockClear();
  logout.mockClear();
  // Força modo "mobile" (drill-in) para o menu começar sem seção aberta —
  // assim cada rótulo aparece só uma vez (no menu) e o clique é testável.
  window.innerWidth = 500;
});

describe('Conta (/user-profile)', () => {
  it('mostra o rail: nome + itens do menu + Sair', () => {
    render(<UserProfile />);
    expect(screen.getByText('Asafe')).toBeInTheDocument();
    ['Meus dados', 'Verificações e segurança', 'Notificações', 'Endereços', 'Sair'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('Meus dados abre o formulário inline (sem navegar)', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Meus dados'));
    expect(screen.getByText('MEUS_DADOS_FORM')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/editar-conta');
  });

  it('Endereços abre o gerenciador inline (sem deep-link de navegação)', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Endereços'));
    expect(screen.getByText('ADDRESS_MANAGER')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/user-dashboard?tab=addresses');
  });

  it('Sair chama logout', () => {
    render(<UserProfile />);
    fireEvent.click(screen.getByText('Sair'));
    expect(logout).toHaveBeenCalled();
  });
});
