// Correção V1 (D3a): quem é da equipe e está como Cliente volta ao painel pelo menu da conta.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountMenu from '../AccountMenu';

const push = jest.fn();
const switchRole = jest.fn();
const apiGet = jest.fn();
let mockUser: any;

jest.mock('next/router', () => ({ useRouter: () => ({ push, pathname: '/inicio' }) }));
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, switchRole, logout: jest.fn() }),
}));
jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => apiGet(...a) } }));

const base = { id: '1', name: 'Ana Souza', email: 'ana@x.com' };

beforeEach(() => {
  push.mockClear(); switchRole.mockReset(); apiGet.mockReset();
  apiGet.mockResolvedValue({ data: { permissions: ['theme:edit'] } });
});

describe('AccountMenu · Painel da equipe', () => {
  it('marketing como Cliente vê "Painel da equipe" com a descrição', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: /Painel da equipe.*Painel administrativo da equipe\./ })).toBeInTheDocument();
  });

  it('cliente puro não vê', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
    render(<AccountMenu />);
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('quem já está no papel de equipe não vê', () => {
    mockUser = { ...base, activeRole: 'marketing', roles: ['cliente', 'marketing'] };
    render(<AccountMenu />);
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('o CEO continua com "Administração" e sem "Painel da equipe"', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'ceo'] };
    render(<AccountMenu />);
    expect(screen.getByText('Administração')).toBeInTheDocument();
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('tocar troca para o papel de equipe e abre a primeira página do painel que ele pode abrir', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    switchRole.mockResolvedValue({});
    const onNavigate = jest.fn();
    render(<AccountMenu onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Painel da equipe'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/seasonal-theme'));
    expect(switchRole).toHaveBeenCalledWith('marketing');
    expect(apiGet).toHaveBeenCalledWith('/role-permissions/me');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('troca feita mas sem nenhuma página do painel liberada (ou leitura falhou): não navega', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    switchRole.mockResolvedValue({});
    apiGet.mockRejectedValueOnce(new Error('500'));
    render(<AccountMenu />);
    fireEvent.click(screen.getByText('Painel da equipe'));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/role-permissions/me'));
    await Promise.resolve();
    expect(push).not.toHaveBeenCalled();
  });

  it('troca recusada pelo servidor: não navega', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'marketing'] };
    switchRole.mockRejectedValue(new Error('403'));
    render(<AccountMenu />);
    fireEvent.click(screen.getByText('Painel da equipe'));
    await waitFor(() => expect(switchRole).toHaveBeenCalledWith('marketing'));
    await Promise.resolve();
    expect(apiGet).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
