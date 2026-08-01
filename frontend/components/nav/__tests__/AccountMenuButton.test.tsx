import { render, screen, fireEvent } from '@testing-library/react';
import AccountMenuButton from '../AccountMenuButton';

const push = jest.fn();
const toggle = jest.fn();
let isOpenVal = false;
let mockUser: any = { name: 'Ana', activeRole: 'cliente', roles: ['cliente'] };

jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../../contexts/OverlayContext', () => ({
  useOverlay: () => ({ isOpen: () => isOpenVal, open: jest.fn(), close: jest.fn(), toggle, active: null }),
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../AccountMenu', () => () => <div data-testid="account-menu" />);

beforeEach(() => {
  push.mockClear(); toggle.mockClear(); isOpenVal = false;
  mockUser = { name: 'Ana', activeRole: 'cliente', roles: ['cliente'] };
});

describe('AccountMenuButton', () => {
  it('com user: clicar alterna o overlay account', () => {
    render(<AccountMenuButton />);
    fireEvent.click(screen.getByLabelText(/menu da conta/i));
    expect(toggle).toHaveBeenCalledWith('account');
  });
  it('renderiza o AccountMenu quando o overlay account está aberto', () => {
    isOpenVal = true;
    render(<AccountMenuButton />);
    expect(screen.getByTestId('account-menu')).toBeInTheDocument();
  });
  it('não renderiza o AccountMenu quando fechado', () => {
    render(<AccountMenuButton />);
    expect(screen.queryByTestId('account-menu')).toBeNull();
  });
  it('sem user: clicar vai para /login e não abre menu', () => {
    mockUser = null;
    render(<AccountMenuButton />);
    fireEvent.click(screen.getByLabelText(/entrar na conta/i));
    expect(push).toHaveBeenCalledWith('/login');
    expect(toggle).not.toHaveBeenCalled();
  });
});
