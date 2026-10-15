// frontend/__tests__/motoboy.ganhos.page.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import MotoboyGanhosPage from '../pages/motoboy/ganhos';
import api from '../lib/api';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockQuery: any = {};
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: mockQuery, pathname: '/motoboy/ganhos', asPath: '/motoboy/ganhos' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'm1', id: 'm1', activeRole: 'motoboy', role: 'motoboy' } }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../components/motoboy/ganhos/CustodyEarnings', () => ({
  CustodyEarnings: ({ seg, onSeg }: any) => <div>{`custodia:${seg}`}<button onClick={() => onSeg('notas')}>ir notas</button></div>,
}));
jest.mock('../components/motoboy/ganhos/DirectEarnings', () => ({ DirectEarnings: ({ hasLeftover }: any) => <div>{`direto:${hasLeftover}`}</div> }));
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
let mockLeftover: any;
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => mockLeftover }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = {};
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockLeftover = { hasLeftover: false, loading: false };
});

test('modo com erro: nunca presume custódia; Tentar de novo relê o modo', () => {
  mockSaas = { ...mockSaas, error: true };
  render(<MotoboyGanhosPage />);
  expect(screen.getByText('Não carregamos seus ganhos')).toBeInTheDocument();
  expect(screen.queryByText(/custodia:|direto:/)).not.toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockSaas.retry).toHaveBeenCalled();
});

test('modo carregando: nenhuma das duas telas', () => {
  mockSaas = { ...mockSaas, loading: true };
  render(<MotoboyGanhosPage />);
  expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
  expect(screen.queryByText(/custodia:|direto:/)).not.toBeInTheDocument();
});

test('direto esperando o saldo antigo também espera', () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockLeftover = { hasLeftover: false, loading: true };
  render(<MotoboyGanhosPage />);
  expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
});

test('custódia com ?seg=; trocar de segmento vai pela URL', () => {
  mockQuery = { seg: 'saques' };
  render(<MotoboyGanhosPage />);
  expect(screen.getByText('custodia:saques')).toBeInTheDocument();
  fireEvent.click(screen.getByText('ir notas'));
  expect(mockReplace).toHaveBeenCalledWith('/motoboy/ganhos?seg=notas', undefined, { shallow: true });
});

test('?seg= desconhecido cai em Corridas', () => {
  mockQuery = { seg: 'zzz' };
  render(<MotoboyGanhosPage />);
  expect(screen.getByText('custodia:corridas')).toBeInTheDocument();
});

test('direto com saldo antigo', () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockLeftover = { hasLeftover: true, loading: false };
  render(<MotoboyGanhosPage />);
  expect(screen.getByText('direto:true')).toBeInTheDocument();
});

// K22: a regra do item "saldo do modo anterior" (só aparece com sobra da custódia) mora aqui agora.
test('direto sem saldo antigo: DirectEarnings recebe hasLeftover=false', () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  mockLeftover = { hasLeftover: false, loading: false };
  render(<MotoboyGanhosPage />);
  expect(screen.getByText('direto:false')).toBeInTheDocument();
});

test('título Ganhos e "?" leva a Como calculamos', () => {
  render(<MotoboyGanhosPage />);
  expect(screen.getByRole('heading', { name: 'Ganhos' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Como calculamos seus ganhos' }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/ganhos/como-calculamos');
});
