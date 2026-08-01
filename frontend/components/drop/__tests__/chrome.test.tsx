import { render, screen, fireEvent } from '@testing-library/react';
import { Logo } from '../Logo';
import { TabBar } from '../TabBar';
import { CustomerAppChrome } from '../CustomerAppChrome';

const mockPush = jest.fn();
let mockPathname = '/inicio';
jest.mock('next/router', () => ({ useRouter: () => ({ pathname: mockPathname, push: mockPush }) }));
jest.mock('../../../contexts/CartContext', () => ({ useCart: () => ({ cart: [] }) }));

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
});
