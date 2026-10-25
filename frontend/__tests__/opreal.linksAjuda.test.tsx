// Os atalhos "Ajuda e suporte" levam à Ajuda do próprio perfil (a página escura /suporte saiu).
import { render, screen, fireEvent } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
let mockRole = 'lojista';
jest.mock('next/router', () => ({ useRouter: () => ({ push, pathname: '/seller/dashboard' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', name: 'Ana', email: 'a@x.com', activeRole: mockRole, roles: ['cliente', 'lojista', 'motoboy'] }, switchRole: jest.fn(), logout: jest.fn() }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn() } }));
import AccountMenu from '../components/nav/AccountMenu';
import { SaasPausedCard } from '../components/seller/agora/SaasPausedCard';

beforeEach(() => push.mockClear());

test.each([
  ['lojista', '/seller/ajuda'],
  ['motoboy', '/motoboy/perfil/ajuda'],
  ['cliente', '/conta/ajuda'],
])('menu da conta (%s): "Ajuda e suporte" vai para %s', (role, href) => {
  mockRole = role;
  render(<AccountMenu />);
  fireEvent.click(screen.getByRole('button', { name: /Ajuda e suporte/ }));
  expect(push).toHaveBeenCalledWith(href);
});

test('mensalidade cancelada: "Falar com o suporte" abre a Ajuda da loja', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { success: true, data: { status: 'cancelled', sellsUntil: '2099-01-01T12:00:00.000Z' } } });
  render(<SaasPausedCard storeId="s1" />);
  expect(await screen.findByRole('link', { name: 'Falar com o suporte' })).toHaveAttribute('href', '/seller/ajuda');
});
