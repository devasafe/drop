/**
 * A3: ModeGate impede abrir pela URL uma tela do modo errado (a API daria 404).
 * Modo certo renderiza; modo errado leva ao painel do papel; saldo antigo da custódia
 * libera telas de custódia; enquanto carrega, não renderiza (nem redireciona).
 */
import { render, screen } from '@testing-library/react';
import ModeGate from '../ModeGate';

const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ replace, push: jest.fn(), query: {} }) }));
let mockUser: any = { activeRole: 'lojista' };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
let mockSaas: any = { settlementMode: 'custodia', loading: false };
jest.mock('../../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockLeftover: any = { hasLeftover: false, loading: false };
jest.mock('../../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));

beforeEach(() => {
  replace.mockClear();
  mockUser = { activeRole: 'lojista' };
  mockSaas = { settlementMode: 'custodia', loading: false };
  mockLeftover = { hasLeftover: false, loading: false };
});

test('modo certo: renderiza os filhos', () => {
  render(<ModeGate mode="custodia"><div>tela</div></ModeGate>);
  expect(screen.getByText('tela')).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test.each([
  ['lojista', '/seller/dashboard'],
  ['motoboy', '/motoboy'],
  ['cliente', '/'],
])('modo errado: %s é levado para %s', (role, dest) => {
  mockUser = { activeRole: role };
  mockSaas = { settlementMode: 'direto', loading: false };
  render(<ModeGate mode="custodia"><div>tela</div></ModeGate>);
  expect(screen.queryByText('tela')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith(dest);
});

test('allowLeftover com saldo antigo no modo direto: renderiza', () => {
  mockSaas = { settlementMode: 'direto', loading: false };
  mockLeftover = { hasLeftover: true, loading: false };
  render(<ModeGate mode="custodia" allowLeftover><div>tela</div></ModeGate>);
  expect(screen.getByText('tela')).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test('allowLeftover sem saldo antigo: redireciona', () => {
  mockSaas = { settlementMode: 'direto', loading: false };
  render(<ModeGate mode="custodia" allowLeftover><div>tela</div></ModeGate>);
  expect(screen.queryByText('tela')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalledWith('/seller/dashboard');
});

test('saldo antigo sem allowLeftover não libera', () => {
  mockSaas = { settlementMode: 'direto', loading: false };
  mockLeftover = { hasLeftover: true, loading: false };
  render(<ModeGate mode="custodia"><div>tela</div></ModeGate>);
  expect(screen.queryByText('tela')).not.toBeInTheDocument();
  expect(replace).toHaveBeenCalled();
});

test('tela de modo direto no modo direto: renderiza; na custódia: redireciona', () => {
  mockSaas = { settlementMode: 'direto', loading: false };
  const { unmount } = render(<ModeGate mode="direto"><div>tela</div></ModeGate>);
  expect(screen.getByText('tela')).toBeInTheDocument();
  unmount();
  mockSaas = { settlementMode: 'custodia', loading: false };
  render(<ModeGate mode="direto"><div>tela</div></ModeGate>);
  expect(replace).toHaveBeenCalledWith('/seller/dashboard');
});

test('carregando config: não renderiza nem redireciona', () => {
  mockSaas = { settlementMode: 'custodia', loading: true };
  render(<ModeGate mode="direto"><div>tela</div></ModeGate>);
  expect(screen.queryByText('tela')).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});

test('carregando saldo antigo (allowLeftover): espera sem redirecionar', () => {
  mockSaas = { settlementMode: 'direto', loading: false };
  mockLeftover = { hasLeftover: false, loading: true };
  render(<ModeGate mode="custodia" allowLeftover><div>tela</div></ModeGate>);
  expect(screen.queryByText('tela')).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});
