import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { themeForPath } from '../lib/routeTheme';

const mockPush = jest.fn();
let mockNotifs: any[] = [];
let mockError = false;
const mockReload = jest.fn();
let mockPushState: any = { supported: true, permission: 'granted', subscribed: true, busy: false, enable: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/notificacoes', asPath: '/motoboy/notificacoes' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../hooks/useSync', () => ({ useNotifications: () => ({ notifications: mockNotifs, loading: false, error: mockError, reload: mockReload }) }));
jest.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => mockPushState }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { patch: jest.fn(() => Promise.resolve({})) } }));
const patch = api.patch as jest.Mock;
import MotoboyNotificacoes from '../pages/motoboy/notificacoes';

const hoje = new Date().toISOString();
beforeEach(() => {
  jest.clearAllMocks();
  mockError = false;
  mockPushState = { supported: true, permission: 'granted', subscribed: true, busy: false, enable: jest.fn() };
  mockNotifs = [
    { _id: 'n1', title: 'Saque de R$ 200,00 enviado', message: 'Caiu na chave CPF', type: 'system', read: false, link: '/motoboy/ganhos', createdAt: hoje },
    { _id: 'n2', title: 'Aviso', message: 'Link de fora', type: 'broadcast', read: false, link: 'https://exemplo.com', createdAt: hoje },
    { _id: 'n3', title: 'Antiga', message: 'Lida', type: 'order', read: true, createdAt: hoje },
  ];
});

test('"Avisos" com voltar para Corridas, sem filtros, agrupado por dia', () => {
  render(<MotoboyNotificacoes />);
  expect(screen.getByRole('heading', { name: 'Avisos' })).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy');
  expect(screen.getByText('Hoje')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /Filtrar/ })).toBeNull();
  expect(screen.getAllByText('Não lida')).toHaveLength(2);
});

test('tocar marca como lida e abre o link do motoboy', async () => {
  render(<MotoboyNotificacoes />);
  fireEvent.click(screen.getByRole('button', { name: /Saque de R\$ 200,00 enviado/ }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/n1/read'));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/ganhos');
  expect(screen.getAllByText('Não lida')).toHaveLength(1);
});

test('link de fora do painel não navega', async () => {
  render(<MotoboyNotificacoes />);
  fireEvent.click(screen.getByRole('button', { name: /Link de fora/ }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/n2/read'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('"Marcar lidas" chama read-all e some', async () => {
  render(<MotoboyNotificacoes />);
  fireEvent.click(screen.getByRole('button', { name: /Marcar lidas/ }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/read-all'));
  expect(screen.queryByText('Não lida')).toBeNull();
  expect(screen.queryByRole('button', { name: /Marcar lidas/ })).toBeNull();
});

test('vazio e push desligado', () => {
  mockNotifs = [];
  mockPushState = { ...mockPushState, permission: 'default', subscribed: false };
  render(<MotoboyNotificacoes />);
  expect(screen.getByText('Sem avisos por aqui')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
  expect(mockPushState.enable).toHaveBeenCalled();
});

test('falha na leitura: erro com "Tentar de novo", nunca "Sem avisos"', () => {
  mockNotifs = [];
  mockError = true;
  render(<MotoboyNotificacoes />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('Sem avisos por aqui')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test('rota noturna; sem style inline', () => {
  expect(themeForPath('/motoboy/notificacoes')).toBe('night-auto');
  const src = fs.readFileSync(path.join(__dirname, '..', 'components/motoboy/perfil/NotificacoesScreen.tsx'), 'utf8');
  expect(src).not.toMatch(/style=\{\{/);
});
