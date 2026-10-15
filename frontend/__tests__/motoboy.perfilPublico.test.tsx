import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';
import { resolvedThemeForPath, themeForPath, LIGHT_ROUTES } from '../lib/routeTheme';

let mockUser: any = { id: 'c1', name: 'Ana', role: 'cliente', activeRole: 'cliente' };
const mockBack = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, query: { id: 'm1' }, pathname: '/motoboy/[id]', asPath: '/motoboy/m1' }) }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, children }: any) => <div data-testid="motoboy-shell" data-back={back ?? ''}><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import MotoboyPublic from '../pages/motoboy/[id]';

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'c1', name: 'Ana', role: 'cliente', activeRole: 'cliente' };
  get.mockResolvedValue({ data: { _id: 'm1', name: 'Carlos Lima', roles: ['motoboy'], activeRole: 'motoboy', createdAt: '2026-07-03T15:00:00Z' } });
});

test('cliente: página solta "Seu entregador", nome abreviado e desde quando', async () => {
  render(<MotoboyPublic />);
  expect(await screen.findByText('Carlos L.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Seu entregador' })).toBeInTheDocument();
  expect(screen.queryByTestId('motoboy-shell')).toBeNull();
  expect(screen.getByText('jul/2026')).toBeInTheDocument();
  expect(screen.getByText('Por segurança, placa e telefone só aparecem durante a sua entrega.')).toBeInTheDocument();
  expect(screen.queryByText('Carlos Lima')).toBeNull();
  expect(get).toHaveBeenCalledWith('/user/public/m1');
});

test('o próprio motoboy vê dentro da casca dele, com voltar para o Perfil', async () => {
  mockUser = { id: 'm1', _id: 'm1', name: 'Carlos Lima', role: 'motoboy', activeRole: 'motoboy' };
  render(<MotoboyPublic />);
  expect(await screen.findByText('Carlos L.')).toBeInTheDocument();
  expect(screen.getByTestId('motoboy-shell')).toHaveAttribute('data-back', '/motoboy/perfil');
});

test('outro motoboy vê a página solta, sem a casca (K37)', async () => {
  mockUser = { id: 'm2', name: 'Outro', role: 'motoboy', activeRole: 'motoboy' };
  render(<MotoboyPublic />);
  expect(await screen.findByText('Carlos L.')).toBeInTheDocument();
  expect(screen.queryByTestId('motoboy-shell')).toBeNull();
});

test('quem não é entregador e quem não existe', async () => {
  get.mockResolvedValueOnce({ data: { _id: 'x', name: 'Loja', roles: ['lojista'] } });
  const { unmount } = render(<MotoboyPublic />);
  expect(await screen.findByText('Este perfil não é de um entregador.')).toBeInTheDocument();
  unmount();
  get.mockRejectedValueOnce({ response: { status: 404 } });
  render(<MotoboyPublic />);
  expect(await screen.findByText('Entregador não encontrado.')).toBeInTheDocument();
});

test('falha de leitura: erro com "Tentar de novo", nunca perfil vazio; tentar de novo recarrega', async () => {
  get.mockRejectedValueOnce({ response: { status: 500 } });
  render(<MotoboyPublic />);
  expect(await screen.findByText('Não carregamos este perfil.')).toBeInTheDocument();
  expect(screen.queryByText('Entregador DROP')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Carlos L.')).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
});

test('tema: claro inclusive à noite; as rotas fixas do motoboy não caem no padrão dinâmico', () => {
  expect(LIGHT_ROUTES).toContain('/motoboy/[id]');
  expect(themeForPath('/motoboy/[id]')).toBe('light');
  expect(themeForPath('/motoboy/abc123')).toBe('light');
  expect(resolvedThemeForPath('/motoboy/abc123', new Date(2026, 9, 14, 21), true)).toBe('light');
  for (const p of ['/motoboy/nivel', '/motoboy/perfil', '/motoboy/ranking', '/motoboy/notificacoes', '/motoboy/cadastro']) {
    expect(themeForPath(p)).toBe('night-auto');
  }
  const { isMotoboyPanelRoute } = require('../lib/motoboyRoutes');
  expect(isMotoboyPanelRoute('/motoboy/[id]')).toBe(false);
});

test('CSS novo só com tokens; CSS antigo apagado', () => {
  const ROOT = path.join(__dirname, '..');
  expect(cssViolations(fs.readFileSync(path.join(ROOT, 'components/motoboy/perfil/PerfilPublico.module.css'), 'utf8'))).toEqual([]);
  expect(fs.existsSync(path.join(ROOT, 'pages/motoboy/MotoboyPublicProfile.module.css'))).toBe(false);
});
