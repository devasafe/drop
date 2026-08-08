import { render, screen, fireEvent } from '@testing-library/react';
import { Logo } from '../Logo';
import { TabBar } from '../TabBar';
import { CustomerAppChrome } from '../CustomerAppChrome';

const mockPush = jest.fn();
let mockPathname = '/inicio';
let mockUser: any = { id: 'u1', role: 'cliente' };
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, push: mockPush }) }));
jest.mock('../../../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

test('Logo mostra DROP em caixa alta', () => {
  render(<Logo />);
  expect(screen.getByText('DROP')).toBeInTheDocument();
});
test('TabBar marca o item ativo', () => {
  render(<TabBar active="carteira" onNavigate={()=>{}} />);
  expect(screen.getByRole('button', { name: /Carteira/ })).toHaveClass('on');
});

describe('CustomerAppChrome (navegação derivada da navConfig)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPathname = '/inicio';
    mockUser = { id: 'u1', role: 'cliente' };
  });

  it('Carteira navega para /wallet', () => {
    render(<CustomerAppChrome />);
    fireEvent.click(screen.getByRole('button', { name: 'Carteira' }));
    expect(mockPush).toHaveBeenCalledWith('/wallet');
  });

  it('Perfil navega para /minha-conta', () => {
    render(<CustomerAppChrome />);
    fireEvent.click(screen.getByRole('button', { name: 'Perfil' }));
    expect(mockPush).toHaveBeenCalledWith('/minha-conta');
  });

  it('Pedidos navega para /user-dashboard', () => {
    render(<CustomerAppChrome />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos' }));
    expect(mockPush).toHaveBeenCalledWith('/user-dashboard');
  });

  it('marca "Início" como ativo quando pathname é /inicio', () => {
    render(<CustomerAppChrome />);
    expect(screen.getByRole('button', { name: 'Início' })).toHaveClass('on');
  });

  it('deslogado: só Início, Buscar e Entrar; Entrar vai pro /login', () => {
    mockUser = null;
    render(<CustomerAppChrome />);
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    // itens autenticados NÃO aparecem
    expect(screen.queryByRole('button', { name: 'Pedidos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Carteira' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Perfil' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
