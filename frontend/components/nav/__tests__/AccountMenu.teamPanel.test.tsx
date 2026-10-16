// Correções V1/V2 (D3a): cada papel de equipe da conta é uma área própria no menu da conta,
// como Cliente/Lojista/Motoboy/Administração.
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
const team = ['cliente', 'marketing', 'gerente_motoboys'];

beforeEach(() => {
  push.mockClear(); switchRole.mockReset(); apiGet.mockReset();
  apiGet.mockResolvedValue({ data: { permissions: ['payout:view'] } });
});

describe('AccountMenu · papéis de equipe como áreas', () => {
  it('cada papel de equipe da conta aparece como área, com a descrição', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: team };
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: /^Marketing\s*Avisos, broadcasts e tema do app\.$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Gerente de motoboys\s*Motoboys, verificações e Pix\.$/ })).toBeInTheDocument();
    expect(screen.queryByText('Gerente geral')).toBeNull();
    expect(screen.queryByText('Painel da equipe')).toBeNull();
  });

  it('cliente puro não vê área de equipe', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente'] };
    render(<AccountMenu />);
    expect(screen.queryByText(/Marketing|Gerente/)).toBeNull();
  });

  it('o CEO continua com "Administração"', () => {
    mockUser = { ...base, activeRole: 'cliente', roles: ['cliente', 'ceo'] };
    render(<AccountMenu />);
    expect(screen.getByText('Administração')).toBeInTheDocument();
    expect(screen.queryByText(/Marketing|Gerente/)).toBeNull();
  });

  it('escolher "Gerente de motoboys" troca para o papel e abre a primeira página do painel que ele pode abrir', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: team };
    switchRole.mockResolvedValue({});
    const onNavigate = jest.fn();
    render(<AccountMenu onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /^Gerente de motoboys/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/payouts'));
    expect(switchRole).toHaveBeenCalledWith('gerente_motoboys');
    expect(apiGet).toHaveBeenCalledWith('/role-permissions/me');
    expect(onNavigate).toHaveBeenCalled();
  });

  it('com ativo marketing: "Marketing" marcado (ATUAL, sem troca) e "Cliente" troca para cliente', async () => {
    mockUser = { ...base, activeRole: 'marketing', roles: team };
    switchRole.mockResolvedValue({});
    render(<AccountMenu />);
    const mk = screen.getByRole('button', { name: /^Marketing.*ATUAL$/ });
    expect(mk).toHaveAttribute('data-active', 'true');
    fireEvent.click(mk);
    expect(switchRole).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Cliente/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/inicio'));
    expect(switchRole).toHaveBeenCalledWith('cliente');
  });

  it('troca feita mas a leitura das permissões falhou: não navega', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: team };
    switchRole.mockResolvedValue({});
    apiGet.mockRejectedValueOnce(new Error('500'));
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/role-permissions/me'));
    await Promise.resolve();
    expect(push).not.toHaveBeenCalled();
  });

  it('troca recusada pelo servidor: não navega', async () => {
    mockUser = { ...base, activeRole: 'cliente', roles: team };
    switchRole.mockRejectedValue(new Error('403'));
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole('button', { name: /^Gerente de motoboys/ }));
    await waitFor(() => expect(switchRole).toHaveBeenCalledWith('gerente_motoboys'));
    await Promise.resolve();
    expect(apiGet).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
