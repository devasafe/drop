import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
const logout = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace: jest.fn(), query: {}, pathname: '/seller/perfil' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', id: 'u1', name: 'Ana Souza', email: 'ana@loja.com', role: 'lojista', activeRole: 'lojista' }, logout, loading: false }),
}));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [{ _id: 'abc123def456', storeName: 'X', status: 'pago', createdAt: '2026-10-10T14:02:00', products: [] }], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, back, children }: any) => <div data-testid="shell" data-back={back}><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/VerificationHub', () => ({ __esModule: true, default: () => <div>VERIFICATION_HUB</div> }));
jest.mock('../components/StoreSettingsEditor', () => ({ __esModule: true, default: () => <div>STORE_EDITOR</div> }));
const get = api.get as jest.Mock; const patch = api.patch as jest.Mock; const post = api.post as jest.Mock;
import SellerPerfil from '../pages/seller/perfil';
import SellerAjuda from '../pages/seller/ajuda';

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/user/me' ? { name: 'Ana Souza', email: 'ana@loja.com', telefone: '11999998888', cpf: '', rg: '' } : url === '/support/tickets' ? [] : { store: { _id: 's1' } } }));
  patch.mockResolvedValue({ data: {} });
  post.mockResolvedValue({ data: { conversationId: 'c2' } });
});

test('perfil: dentro da SellerShell com voltar para a Loja, sem o editor da loja', async () => {
  render(<SellerPerfil />);
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/seller/loja');
  expect(screen.getByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument();
  expect(await screen.findByDisplayValue('Ana Souza')).toBeInTheDocument();
  expect(screen.getByText('VERIFICATION_HUB')).toBeInTheDocument();
  expect(screen.queryByText('STORE_EDITOR')).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/stores/dashboard');
});

test('perfil: salvar usa PATCH /user/me, como antes', async () => {
  render(<SellerPerfil />);
  await screen.findByDisplayValue('Ana Souza');
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/user/me', expect.objectContaining({ name: 'Ana Souza', email: 'ana@loja.com' })));
  expect(await screen.findByText(/Dados salvos/)).toBeInTheDocument();
});

test('perfil: Sair chama o logout', async () => {
  render(<SellerPerfil />);
  await screen.findByDisplayValue('Ana Souza');
  fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
  expect(logout).toHaveBeenCalled();
});

test('ajuda: dentro da SellerShell com voltar, FAQ do lojista, sem pedidos do cliente, e abre chamado', async () => {
  render(<SellerAjuda />);
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/seller/loja');
  expect(screen.getByRole('heading', { name: 'Ajuda' })).toBeInTheDocument();
  expect(screen.getByText('Onde vejo o que tenho a receber?')).toBeInTheDocument();
  await waitFor(() => expect(get).toHaveBeenCalledWith('/support/tickets'));
  expect(screen.queryByText('Quando meu estorno cai?')).not.toBeInTheDocument();
  expect(screen.queryByText('Sobre um pedido')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Falar com a gente' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Ajuda pelo app' }));
  expect(await screen.findByLabelText('Mensagem')).toBeInTheDocument();
});

test('rotas novas são do painel, claras e sem a barra de abas', () => {
  const { isSellerPanelRoute, sellerShowsTabBar } = require('../lib/sellerRoutes');
  const { themeForPath } = require('../lib/routeTheme');
  for (const p of ['/seller/perfil', '/seller/ajuda']) {
    expect(isSellerPanelRoute(p)).toBe(true);
    expect(sellerShowsTabBar(p)).toBe(false);
    expect(themeForPath(p)).toBe('light');
  }
});
