// frontend/__tests__/motoboy.cadastro.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { resolveRedirect } from './helpers/nextRedirects';
import { themeForPath } from '../lib/routeTheme';

const mockReplace = jest.fn(); const mockPush = jest.fn(); const logout = jest.fn();
let mockQuery: Record<string, string> = {};
let mockUser: any = null;
let mockSaas: any = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
let mockRules: any = { rules: { minimumWithdraw: 50 }, loading: false, failed: false, retry: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: mockQuery, pathname: '/motoboy/cadastro', asPath: '/motoboy/cadastro' }) }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: false, logout }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
// K5/C4: o saque mínimo vem da regra única (useMotoboyRules), nunca de um GET próprio.
jest.mock('../hooks/useMotoboyRules', () => ({ useMotoboyRules: () => mockRules }));
jest.mock('../components/motoboy/cadastro/ContaStep', () => ({ ContaStep: () => <p>CONTA_STEP</p> }));
jest.mock('../components/motoboy/cadastro/VerificacaoStep', () => ({
  VerificacaoStep: ({ onChanged }: any) => <><p>VERIF_STEP</p><button type="button" onClick={onChanged}>ENVIEI</button></>,
}));
jest.mock('../components/onboarding/RecebimentoForm', () => ({ RecebimentoForm: ({ direct }: any) => <p>{`RECEB_FORM direct=${direct}`}</p> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import MotoboyCadastro from '../pages/motoboy/cadastro';
const rules = require('../lib/redirects.js');

const MOTOBOY = { id: 'm1', _id: 'm1', name: 'Carlos Lima', role: 'motoboy', activeRole: 'motoboy' };
type Srv = { email?: string; doc?: string; facial?: string; courier?: string; verified?: boolean; pix?: boolean; falha?: string };
function servidor(o: Srv) {
  get.mockImplementation((url: string) => {
    if (url === o.falha) return Promise.reject(new Error('rede'));
    if (url === '/verification/me') return Promise.resolve({ data: { verification: { email: { status: o.email ?? 'verified' }, document: { status: o.doc ?? 'pending' } } } });
    if (url === '/verification/motoboy/me') return Promise.resolve({ data: { verified: !!o.verified, facial: { status: o.facial ?? 'pending' }, courier: { status: o.courier ?? 'pending' } } });
    if (url === '/onboarding/status') return Promise.resolve({ data: { hasPixKey: !!o.pix, pixKey: o.pix ? '***.412.***-07' : undefined } });
    return Promise.reject(new Error(url));
  });
}
const APROVADO: Srv = { doc: 'approved', facial: 'approved', courier: 'approved', verified: true, pix: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = {};
  mockUser = MOTOBOY;
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockRules = { rules: { minimumWithdraw: 50 }, loading: false, failed: false, retry: jest.fn() };
});

test('sem login: etapa 1 de 4, Criar conta', () => {
  mockUser = null;
  servidor({});
  render(<MotoboyCadastro />);
  expect(screen.getByRole('heading', { name: 'Entregar com a DROP' })).toBeInTheDocument();
  expect(screen.getAllByText('1 de 4').length).toBeGreaterThan(0);
  expect(screen.getByText('CONTA_STEP')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/verification/me');
});

test('logado com item faltando: retoma na Verificação (2 de 4)', async () => {
  servidor({ facial: 'none' });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('VERIF_STEP')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sua verificação' })).toBeInTheDocument();
  expect(screen.getAllByText('2 de 4').length).toBeGreaterThan(0);
});

test('Verificação: onChanged relê o estado do servidor e avança para o Recebimento', async () => {
  servidor({ facial: 'none' });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('VERIF_STEP')).toBeInTheDocument();
  expect(get.mock.calls.filter(([u]) => u === '/verification/motoboy/me')).toHaveLength(1);
  servidor({ pix: false });
  fireEvent.click(screen.getByRole('button', { name: 'ENVIEI' }));
  expect(await screen.findByText('RECEB_FORM direct=false')).toBeInTheDocument();
  expect(get.mock.calls.filter(([u]) => u === '/verification/motoboy/me')).toHaveLength(2);
});

test('tudo enviado e sem chave: Recebimento (custódia mostra o saque mínimo)', async () => {
  servidor({ pix: false });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('RECEB_FORM direct=false')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Onde você recebe' })).toBeInTheDocument();
  expect(screen.getAllByText('3 de 4').length).toBeGreaterThan(0);
  expect(screen.getByText('Seus saques caem nesta chave Pix.')).toBeInTheDocument();
  expect(await screen.findByText('Saque mínimo: R$ 50,00')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/settings/platform-config');
});

test('Recebimento em custódia com a regra em erro: nenhum número de saque mínimo', async () => {
  mockRules = { rules: null, loading: false, failed: true, retry: jest.fn() };
  servidor({ pix: false });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('RECEB_FORM direct=false')).toBeInTheDocument();
  expect(screen.queryByText(/Saque mínimo/)).toBeNull();
});

test('Recebimento no modo direto: sem saque mínimo', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  servidor({ pix: false });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('RECEB_FORM direct=true')).toBeInTheDocument();
  expect(screen.getByText('Na entrega, a loja manda o Pix direto para esta chave.')).toBeInTheDocument();
  expect(screen.queryByText(/Saque mínimo/)).toBeNull();
});

test('Recebimento com o modo em erro: não assume custódia (K29, o mesmo aviso de /dados-recebimento)', async () => {
  mockSaas = { ...mockSaas, error: true };
  servidor({ pix: false });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('Não carregamos o modo de pagamento.')).toBeInTheDocument();
  expect(screen.queryByText(/RECEB_FORM/)).toBeNull();
  expect(screen.queryByText('Seus saques caem nesta chave Pix.')).toBeNull();
  expect(screen.queryByText(/Saque mínimo/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockSaas.retry).toHaveBeenCalled();
});

test('Recebimento com o modo carregando: nem formulário nem subtítulo de modo', async () => {
  mockSaas = { ...mockSaas, loading: true };
  servidor({ pix: false });
  render(<MotoboyCadastro />);
  expect(await screen.findByRole('heading', { name: 'Onde você recebe' })).toBeInTheDocument();
  expect(screen.queryByText(/RECEB_FORM/)).toBeNull();
  expect(screen.queryByText('Seus saques caem nesta chave Pix.')).toBeNull();
  expect(screen.queryByText(/Saque mínimo/)).toBeNull();
});

test('enviado, com chave e não aprovado: Em análise (o EmAnalise da Corridas)', async () => {
  servidor({ pix: true });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('Estamos conferindo seus documentos')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Olá, Carlos' })).toBeInTheDocument();
  expect(screen.getByText('Análise da equipe').closest('li')).toHaveAttribute('aria-current', 'step');
  fireEvent.click(screen.getByRole('button', { name: /Como calculamos seus ganhos/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/ganhos/como-calculamos');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('aprovado e com chave: vai para Corridas', async () => {
  servidor(APROVADO);
  render(<MotoboyCadastro />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/motoboy'));
  expect(screen.queryByText('VERIF_STEP')).toBeNull();
  expect(screen.queryByText('Estamos conferindo seus documentos')).toBeNull();
});

test('?etapa=verificacao abre a etapa mesmo aprovado, com voltar para o Perfil', async () => {
  mockQuery = { etapa: 'verificacao' };
  servidor(APROVADO);
  render(<MotoboyCadastro />);
  expect(await screen.findByText('VERIF_STEP')).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy/perfil');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('?etapa=recebimento abre a etapa mesmo com chave e aprovado', async () => {
  mockQuery = { etapa: 'recebimento' };
  servidor(APROVADO);
  render(<MotoboyCadastro />);
  expect(await screen.findByText('RECEB_FORM direct=false')).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy/perfil');
  expect(mockReplace).not.toHaveBeenCalled();
});

test('leitura com erro: "Tentar de novo" relê e nenhuma etapa presumida', async () => {
  servidor({ falha: '/onboarding/status' });
  render(<MotoboyCadastro />);
  expect(await screen.findByText('Não carregamos o seu cadastro')).toBeInTheDocument();
  expect(screen.queryByText('VERIF_STEP')).toBeNull();
  expect(screen.queryByText(/RECEB_FORM/)).toBeNull();
  expect(screen.queryByText('Estamos conferindo seus documentos')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
  servidor({ facial: 'none' });
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('VERIF_STEP')).toBeInTheDocument();
});

test('logado com outro papel: avisa e oferece sair, sem ler o cadastro', () => {
  mockUser = { id: 'c1', name: 'Ana', role: 'cliente', activeRole: 'cliente' };
  servidor({});
  render(<MotoboyCadastro />);
  expect(screen.getByText('Esta conta não é de entregador')).toBeInTheDocument();
  expect(screen.queryByText('CONTA_STEP')).toBeNull();
  expect(get).not.toHaveBeenCalledWith('/verification/me');
  fireEvent.click(screen.getByRole('button', { name: 'Sair desta conta' }));
  expect(logout).toHaveBeenCalled();
});

test('rota: noturna, redirect da verificação antiga e página antiga apagada', () => {
  const ROOT = path.join(__dirname, '..');
  expect(themeForPath('/motoboy/cadastro')).toBe('motoboy-pref');
  expect(resolveRedirect(rules, '/verificacao-motoboy?onboarding=1')).toEqual({ location: '/motoboy/cadastro?onboarding=1', permanent: true });
  expect(fs.existsSync(path.join(ROOT, 'pages/motoboy/cadastro.tsx'))).toBe(true);
  expect(fs.existsSync(path.join(ROOT, 'pages/verificacao-motoboy.tsx'))).toBe(false);
  expect(fs.existsSync(path.join(ROOT, 'pages/VerificacaoMotoboy.module.css'))).toBe(false);
  const { getNextStep } = require('../lib/onboardingFlow');
  expect(getNextStep('motoboy', '/verificacao')?.path).toBe('/motoboy/cadastro');
});
