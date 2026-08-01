// frontend/components/nav/__tests__/AccountMenu.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountMenu from '../AccountMenu';

const push = jest.fn();
const switchRole = jest.fn().mockResolvedValue({});
const logout = jest.fn();

jest.mock('next/router', () => ({ useRouter: () => ({ push, pathname: '/inicio' }) }));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Ana Souza', email: 'ana@x.com', activeRole: 'cliente', roles: ['cliente', 'lojista'] },
    switchRole, logout,
  }),
}));

beforeEach(() => { push.mockClear(); switchRole.mockClear(); logout.mockClear(); });

describe('AccountMenu', () => {
  it('mostra identidade (nome, e-mail) e as áreas do usuário', () => {
    render(<AccountMenu />);
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('ana@x.com')).toBeInTheDocument();
    expect(screen.getByText('Lojista')).toBeInTheDocument();
  });

  it('não mostra itens operacionais', () => {
    render(<AccountMenu />);
    expect(screen.queryByText(/Minha Carteira|Meus Pedidos|Meu Painel|Painel Admin/i)).toBeNull();
  });

  it('card de role chama switchRole + navega pra Home da role', async () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByText('Lojista'));
    await waitFor(() => expect(switchRole).toHaveBeenCalledWith('lojista'));
    expect(push).toHaveBeenCalledWith('/seller/dashboard');
  });

  it('Sair chama logout', () => {
    render(<AccountMenu />);
    fireEvent.click(screen.getByText('Sair'));
    expect(logout).toHaveBeenCalled();
  });
});
