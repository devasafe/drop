// frontend/__tests__/motoboy.perfil.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { resolveRedirect } from './helpers/nextRedirects';
import { themeForPath } from '../lib/routeTheme';

const mockPush = jest.fn(); const logout = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/perfil', asPath: '/motoboy/perfil' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../components/MotoboyRatingsBlock', () => ({ __esModule: true, default: () => <p>LISTA_AVALIACOES</p> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', email: 'carlos@x.com', role: 'motoboy', activeRole: 'motoboy' }, loading: false, logout }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import MotoboyPerfil from '../pages/motoboy/perfil';
const rules = require('../lib/redirects.js');

let falhaMb = false;
beforeEach(() => {
  jest.clearAllMocks();
  falhaMb = false;
  try { localStorage.clear(); } catch { /* jsdom */ }
  get.mockImplementation((url: string) => {
    if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: 'verified' }, document: { status: 'approved' } } } });
    if (url === '/verification/motoboy/me') return falhaMb ? Promise.reject(new Error('rede')) : Promise.resolve({ data: { verified: false, facial: { status: 'approved' }, courier: { status: 'rejected', plate: 'FKR2D19', rejectionReason: 'Placa ilegível' } } });
    if (url === '/onboarding/status') return Promise.resolve({ data: { hasPixKey: true, pixKey: '***.412.***-07' } });
    if (url === '/user/me') return Promise.resolve({ data: { createdAt: '2026-07-03T15:00:00Z' } });
    if (url === '/deliveries/motoboy/m1/ratings') return Promise.resolve({ data: [{ rating: 5 }, { rating: 4 }] });
    return Promise.reject(new Error(url));
  });
});

test('aba Perfil: cabeçalho com nota e "desde", e "Ver como o cliente vê"', async () => {
  render(<MotoboyPerfil />);
  expect(screen.getByRole('heading', { name: 'Perfil' })).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '');
  expect(screen.getByText('Carlos Lima')).toBeInTheDocument();
  expect(await screen.findByText('★ 4,5 (2) · desde jul/2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver como o cliente vê' }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/m1');
});

test('avaliações abrem num sheet', async () => {
  render(<MotoboyPerfil />);
  fireEvent.click(await screen.findByRole('button', { name: /★ 4,5/ }));
  expect(await screen.findByText('LISTA_AVALIACOES')).toBeInTheDocument();
});

test('veículo e verificação recusada com "Refazer" levando ao cadastro', async () => {
  render(<MotoboyPerfil />);
  expect(await screen.findByText('Moto · FKR2D19')).toBeInTheDocument();
  expect(screen.getByText('Recusada: Placa ilegível')).toBeInTheDocument();
  expect(screen.getByText('Verificação recusada')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Verificação recusada/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/cadastro?etapa=verificacao');
});

test('documentos não carregaram: aviso com "Tentar de novo" que relê', async () => {
  falhaMb = true;
  render(<MotoboyPerfil />);
  expect(await screen.findByText('Não carregamos seus documentos')).toBeInTheDocument();
  falhaMb = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Moto · FKR2D19')).toBeInTheDocument();
});

test('chave Pix leva a /dados-recebimento', async () => {
  render(<MotoboyPerfil />);
  fireEvent.click(await screen.findByRole('button', { name: /Chave Pix/ }));
  expect(mockPush).toHaveBeenCalledWith('/dados-recebimento');
  expect(screen.getByText('***.412.***-07')).toBeInTheDocument();
});

test('Modo escuro: começa desligado, grava "1" e avisa o tema', async () => {
  const spy = jest.fn();
  window.addEventListener('drop:dark-pref', spy);
  render(<MotoboyPerfil />);
  const sw = screen.getByRole('switch', { name: 'Modo escuro' });
  expect(sw).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(sw);
  expect(localStorage.getItem('drop.motoboy.darkMode')).toBe('1');
  expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(spy).toHaveBeenCalled();
  window.removeEventListener('drop:dark-pref', spy);
});

test('modo escuro ligado no aparelho aparece ligado', async () => {
  localStorage.setItem('drop.motoboy.darkMode', '1');
  render(<MotoboyPerfil />);
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Modo escuro' })).toHaveAttribute('aria-checked', 'true'));
});

test('menu: Dados e senha, Ajuda e Sair', async () => {
  render(<MotoboyPerfil />);
  fireEvent.click(screen.getByRole('button', { name: /Dados e senha/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/perfil/dados');
  fireEvent.click(screen.getByRole('button', { name: /Ajuda e suporte/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/perfil/ajuda');
  fireEvent.click(screen.getByRole('button', { name: /Privacidade/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/perfil/privacidade');
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(logout).toHaveBeenCalled();
  await screen.findByText('Moto · FKR2D19');
});

test('rota: aba com barra, modo escuro do motoboy, redirect do profile e página antiga apagada', () => {
  const ROOT = path.join(__dirname, '..');
  const { motoboyShowsTabBar } = require('../lib/motoboyRoutes');
  expect(motoboyShowsTabBar('/motoboy/perfil')).toBe(true);
  expect(themeForPath('/motoboy/perfil')).toBe('motoboy-pref');
  expect(resolveRedirect(rules, '/motoboy/profile')).toEqual({ location: '/motoboy/perfil', permanent: true });
  expect(fs.existsSync(path.join(ROOT, 'pages/motoboy/profile.tsx'))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, 'pages/motoboy/MotoboyProfile.module.css'))).toBe(false);
  expect(fs.readFileSync(path.join(ROOT, 'components/motoboy/perfil/PerfilScreen.tsx'), 'utf8')).not.toMatch(/style=\{\{/);
});

test('bug 19/10: a aba Perfil mostra "Suas áreas" com Cliente para voltar ao app', async () => {
  render(<MotoboyPerfil />);
  expect(await screen.findByText('★ 4,5 (2) · desde jul/2026')).toBeInTheDocument();
  expect(await screen.findByText('Moto · FKR2D19')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cliente/ })).toBeInTheDocument();
});
