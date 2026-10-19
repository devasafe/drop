// frontend/__tests__/areas.painel.test.tsx
/**
 * Bug 19/10: com a área de motoboy ativa, a aba Perfil não mostrava "Suas áreas" nem o "Painel da
 * equipe" — sem caminho de volta para o cliente no celular. A Loja tinha as áreas, mas não o painel.
 * Regra única (AreasSection): Cliente é sempre uma área (o servidor acrescenta 'cliente' a lojista e
 * motoboy na troca), e o painel da equipe aparece para quem tem papel de equipe.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AreasSection } from '../components/panel/AreasSection';
import { ROLE_HOME } from '../lib/navConfig';

const mockPush = jest.fn();
const mockSwitchRole = jest.fn();
let mockAuth: any;
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/perfil', asPath: '/motoboy/perfil' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));

const ALL = () => true;
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = {
    user: { id: 'm1', role: 'motoboy', activeRole: 'motoboy', roles: ['cliente', 'motoboy', 'gerente_motoboys'] },
    switchRole: mockSwitchRole, teamRoles: ['gerente_motoboys'], can: ALL,
  };
});

test('motoboy + gerente: mostra Cliente em "Suas áreas" e o Painel da equipe', async () => {
  mockSwitchRole.mockResolvedValue({});
  render(<AreasSection />);
  expect(screen.getByRole('heading', { name: 'Suas áreas' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Motoboy/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Cliente/ }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(ROLE_HOME.cliente));
  expect(mockSwitchRole).toHaveBeenCalledWith('cliente');
});

test('Painel da equipe leva ao admin sem trocar de área', () => {
  render(<AreasSection />);
  const btn = screen.getByRole('button', { name: /Painel da equipe/ });
  expect(btn).toHaveTextContent('Gerente de motoboys');
  fireEvent.click(btn);
  expect(mockSwitchRole).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/admin/));
});

test('conta antiga só de motoboy (sem cliente em roles): Cliente aparece mesmo assim', () => {
  mockAuth = { ...mockAuth, user: { id: 'm1', role: 'motoboy', activeRole: 'motoboy', roles: ['motoboy'] }, teamRoles: [] };
  render(<AreasSection />);
  expect(screen.getByRole('button', { name: /Cliente/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Painel da equipe/ })).not.toBeInTheDocument();
});

test('troca recusada pelo servidor: não navega', async () => {
  mockSwitchRole.mockRejectedValue(new Error('403'));
  render(<AreasSection />);
  fireEvent.click(screen.getByRole('button', { name: /Cliente/ }));
  await waitFor(() => expect(mockSwitchRole).toHaveBeenCalledWith('cliente'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('lojista + marketing: Cliente e Motoboy? só as áreas que tem, mais o painel', () => {
  mockAuth = { ...mockAuth, user: { id: 'l1', role: 'lojista', activeRole: 'lojista', roles: ['cliente', 'lojista', 'marketing'] }, teamRoles: ['marketing'] };
  render(<AreasSection />);
  expect(screen.getByRole('button', { name: /Cliente/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Motoboy/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Painel da equipe/ })).toHaveTextContent('Marketing');
});
