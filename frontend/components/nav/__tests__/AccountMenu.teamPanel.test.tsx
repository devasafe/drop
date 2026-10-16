// Papel de equipe vira acréscimo (16/10): a pessoa continua cliente. O menu da conta não lista
// mais as áreas de equipe; mostra o item "Painel da equipe", que leva direto ao painel (sem troca de área).
import { render, screen, fireEvent } from '@testing-library/react';
import AccountMenu from '../AccountMenu';

const push = jest.fn();
const switchRole = jest.fn();
let mockUser: any;
let mockTeamRoles: string[] = [];
let mockPerms: string[] = [];
let mockPath = '/inicio';

jest.mock('next/router', () => ({ useRouter: () => ({ push, pathname: mockPath }) }));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    switchRole,
    logout: jest.fn(),
    teamRoles: mockTeamRoles,
    can: (p: string) => mockPerms.includes(p),
  }),
}));

const base = { id: '1', name: 'Ana Souza', email: 'ana@x.com' };

beforeEach(() => {
  push.mockClear(); switchRole.mockReset();
  mockTeamRoles = []; mockPerms = []; mockPath = '/inicio';
});

describe('AccountMenu · papel de equipe como acréscimo', () => {
  it('não lista as áreas de equipe no seletor; mostra "Painel da equipe" com os papéis', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing', 'gerente_motoboys'] };
    mockTeamRoles = ['marketing', 'gerente_motoboys'];
    mockPerms = ['broadcast:send'];
    render(<AccountMenu />);
    expect(screen.queryByRole('button', { name: /^Marketing/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Gerente de motoboys/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Painel da equipe\s*Marketing · Gerente de motoboys/ })).toBeInTheDocument();
  });

  it('o clique leva à primeira página do painel, sem trocar de área', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    mockTeamRoles = ['marketing'];
    mockPerms = ['broadcast:send'];
    const onNavigate = jest.fn();
    render(<AccountMenu onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Painel da equipe/ }));
    expect(push).toHaveBeenCalledWith('/admin/broadcasts');
    expect(switchRole).not.toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalled();
  });

  it('papel de equipe sem nenhuma aba visível: sem o item', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    mockTeamRoles = ['marketing'];
    mockPerms = [];
    render(<AccountMenu />);
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('cliente puro não vê o item', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
    mockPerms = ['broadcast:send'];
    render(<AccountMenu />);
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('o CEO continua com "Administração"', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'ceo'] };
    render(<AccountMenu />);
    expect(screen.getByText('Administração')).toBeInTheDocument();
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('dentro do painel, "Voltar ao app" leva ao início', () => {
    mockPath = '/admin/broadcasts';
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    mockTeamRoles = ['marketing'];
    mockPerms = ['broadcast:send'];
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao app/ }));
    expect(push).toHaveBeenCalledWith('/inicio');
    expect(switchRole).not.toHaveBeenCalled();
  });

  it('fora do painel não mostra "Voltar ao app"', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    mockTeamRoles = ['marketing'];
    mockPerms = ['broadcast:send'];
    render(<AccountMenu />);
    expect(screen.queryByText('Voltar ao app')).toBeNull();
  });
});
