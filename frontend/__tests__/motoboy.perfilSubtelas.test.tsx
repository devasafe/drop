import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/motoboy/perfil/dados', asPath: '/motoboy/perfil/dados' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', email: 'carlos@x.com', role: 'motoboy', activeRole: 'motoboy' }, loading: false }) }));
jest.mock('../hooks/useSync', () => ({ useOrders: () => ({ orders: [], loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock; const put = api.put as jest.Mock;
import MotoboyDados from '../pages/motoboy/perfil/dados';
import MotoboyAjuda from '../pages/motoboy/perfil/ajuda';

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/user/me' ? { name: 'Carlos Lima', email: 'carlos@x.com', telefone: '11987342210', cpf: '', rg: '' } : [] }));
  put.mockResolvedValue({ data: {} });
  post.mockResolvedValue({ data: { conversationId: 'c1' } });
});

const fillPw = (a: string, b: string, c: string) => {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: a } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: b } });
  fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: c } });
};

test('dados: dentro da casca com voltar para o Perfil, com o formulário de dados', async () => {
  render(<MotoboyDados />);
  expect(screen.getByRole('heading', { name: 'Dados e senha' })).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy/perfil');
  expect(await screen.findByDisplayValue('Carlos Lima')).toBeInTheDocument();
});

test('senha: confirmação diferente não chama a API', async () => {
  render(<MotoboyDados />);
  fillPw('velha123', 'nova12345', 'outra1234');
  fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
  expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
});

test('senha: troca com PUT /auth/profile, como antes', async () => {
  render(<MotoboyDados />);
  fillPw('velha123', 'nova12345', 'nova12345');
  fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/auth/profile', { password: 'velha123', newPassword: 'nova12345' }));
  expect(await screen.findByText('Senha alterada.')).toBeInTheDocument();
});

test('senha: erro do servidor aparece', async () => {
  put.mockRejectedValue({ response: { data: { error: 'Senha atual incorreta' } } });
  render(<MotoboyDados />);
  fillPw('errada12', 'nova12345', 'nova12345');
  fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
  expect(await screen.findByText('Senha atual incorreta')).toBeInTheDocument();
});

test('ajuda: FAQ do motoboy, sem perguntas do cliente, e abre chamado', async () => {
  render(<MotoboyAjuda />);
  expect(screen.getByRole('heading', { name: 'Ajuda e suporte' })).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy/perfil');
  expect(screen.getByText('Como funciona uma corrida?')).toBeInTheDocument();
  expect(screen.queryByText('Quando meu estorno cai?')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Falar com a gente' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/support/tickets', { subject: 'Ajuda pelo app' }));
});

test('rotas: noturnas, do painel e sem a barra de abas', () => {
  const { MOTOBOY_ROUTES, motoboyShowsTabBar, isMotoboyPanelRoute } = require('../lib/motoboyRoutes');
  const { themeForPath } = require('../lib/routeTheme');
  expect(MOTOBOY_ROUTES.perfilDados).toBe('/motoboy/perfil/dados');
  expect(MOTOBOY_ROUTES.perfilAjuda).toBe('/motoboy/perfil/ajuda');
  for (const p of ['/motoboy/perfil/dados', '/motoboy/perfil/ajuda']) {
    expect(themeForPath(p)).toBe('night-auto');
    expect(motoboyShowsTabBar(p)).toBe(false);
    expect(isMotoboyPanelRoute(p)).toBe(true);
  }
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components/motoboy/perfil/Perfil.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
