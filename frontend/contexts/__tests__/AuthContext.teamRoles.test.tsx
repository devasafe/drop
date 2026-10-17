/**
 * Papel de equipe vira acréscimo (16/10): o AuthContext lê de /role-permissions/me a união das
 * permissões e os papéis de equipe (`teamRoles`), e relê quando a tela volta ao foco
 * (um papel concedido com a pessoa logada aparece sem sair e entrar).
 * Cliente+marketing segue cliente: Pedidos e Conta (required_role="cliente") abrem.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';

const apiGet = jest.fn();
const push = jest.fn();
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: (...a: any[]) => apiGet(...a), post: jest.fn() } }));
jest.mock('next/router', () => ({ useRouter: () => ({ push, pathname: '/pedidos', asPath: '/pedidos' }) }));

function Probe() {
  const { teamRoles, can } = useAuth();
  return <p data-testid="probe">{`${teamRoles.join(',')}|${can('broadcast:send') ? 'pode' : 'nao'}`}</p>;
}

beforeEach(() => {
  apiGet.mockReset(); push.mockClear();
  localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Ana', email: 'a@x.com', role: 'cliente', activeRole: 'cliente', roles: ['cliente', 'marketing'] }));
});
afterEach(() => localStorage.clear());

test('expõe teamRoles e a união das permissões vindas de /role-permissions/me', async () => {
  apiGet.mockResolvedValue({ data: { role: 'cliente', permissions: ['order:create', 'broadcast:send'], teamRoles: ['marketing'] } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('marketing|pode'));
});

test('relê as permissões quando a tela volta ao foco', async () => {
  apiGet.mockResolvedValueOnce({ data: { role: 'cliente', permissions: ['order:create'], teamRoles: [] } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('|nao'));

  apiGet.mockResolvedValueOnce({ data: { role: 'cliente', permissions: ['order:create', 'broadcast:send'], teamRoles: ['marketing'] } });
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('marketing|pode'));
});

test('cliente+marketing abre página de cliente (Pedidos/Conta) sem ser mandado embora', async () => {
  apiGet.mockResolvedValue({ data: { role: 'cliente', permissions: ['order:create', 'broadcast:send'], teamRoles: ['marketing'] } });
  render(<AuthProvider><ProtectedRoute required_role="cliente"><p>Meus pedidos</p></ProtectedRoute></AuthProvider>);
  expect(await screen.findByText('Meus pedidos')).toBeInTheDocument();
  expect(push).not.toHaveBeenCalled();
});
