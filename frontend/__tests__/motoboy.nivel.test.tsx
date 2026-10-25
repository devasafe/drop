// frontend/__tests__/motoboy.nivel.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { resolveRedirect } from './helpers/nextRedirects';
import { cssViolations } from './helpers/dsTokens';
import { themeForPath } from '../lib/routeTheme';

const mockPush = jest.fn();
const ON = { gamificationPointsEnabled: true, benefitsRedeemEnabled: true, rankingPrizesEnabled: false };
let mockFeatures: any = { features: ON, loading: false };
let mockGam: any = null;
const mockSetGam = jest.fn();
let mockRanking: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/nivel', asPath: '/motoboy/nivel' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', role: 'motoboy', activeRole: 'motoboy' }, loading: false }) }));
jest.mock('../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => mockFeatures }));
jest.mock('../hooks/useSync', () => ({
  useGamification: () => ({ gam: mockGam, loading: false, setGam: mockSetGam }),
  useRanking: () => ({ ranking: mockRanking, loading: false }),
}));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
import MotoboyNivel from '../pages/motoboy/nivel';
const rules = require('../lib/redirects.js');
const ROOT = path.join(__dirname, '..');

const BENEFITS = [
  { id: 'wallet_bonus_20', name: 'Bônus R$ 20 na Carteira', description: 'Receba R$ 20,00 na carteira', cost: 500, type: 'wallet' },
  { id: 'wallet_bonus_50', name: 'Bônus R$ 50 na Carteira', description: 'Receba R$ 50,00 na carteira', cost: 1200, type: 'wallet' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFeatures = { features: ON, loading: false };
  mockGam = { user_id: 'm1', level: 'Prata', totalPoints: 1200, points: 600, badges: ['Noturno', 'Centurião', 'desconhecido'] };
  mockRanking = [
    { user_id: 'a', name: 'Rafael Martins', pontosMes: 300, level: 'Ouro' },
    { user_id: 'm1', name: 'Carlos Lima', pontosMes: 200, level: 'Prata' },
    { user_id: 'b', name: 'Juliana', pontosMes: 100, level: 'Bronze' },
  ];
  get.mockImplementation((url: string) => (url === '/gamification/benefits' ? Promise.resolve({ data: BENEFITS }) : Promise.reject(new Error(`inesperado ${url}`))));
});

test('bloco de nível com pontos, próximo nível e o que falta', async () => {
  render(<MotoboyNivel />);
  expect(screen.getByRole('heading', { name: 'Nível' })).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '');
  expect(screen.getByText('Prata')).toBeInTheDocument();
  expect(screen.getByText('1.200 pontos')).toBeInTheDocument();
  expect(screen.getByText('Ouro em 1.500')).toBeInTheDocument();
  expect(screen.getByText('Faltam 300 pontos para o nível Ouro.')).toBeInTheDocument();
  expect(screen.getByRole('progressbar', { name: 'Progresso até o próximo nível' })).toHaveAttribute('aria-valuenow', '70');
  expect(await screen.findByText('Bônus R$ 20 na Carteira')).toBeInTheDocument();
});

test('o nível vem do total acumulado (totalPoints), não do saldo gastável (points)', async () => {
  // saldo gastável 100 daria Bronze; o total 1200 é Prata
  mockGam = { ...mockGam, points: 100 };
  render(<MotoboyNivel />);
  expect(screen.getByText('Prata')).toBeInTheDocument();
  expect(screen.getByText('1.200 pontos')).toBeInTheDocument();
  await screen.findByText('Bônus R$ 20 na Carteira');
});

test('pontos pausados: "Pontuação pausada" no lugar do nível; conquistas continuam', async () => {
  mockFeatures = { features: { ...ON, gamificationPointsEnabled: false }, loading: false };
  render(<MotoboyNivel />);
  expect(screen.getByText('Pontuação pausada')).toBeInTheDocument();
  expect(screen.queryByText('Faltam 300 pontos para o nível Ouro.')).toBeNull();
  expect(screen.getByText('2 de 28')).toBeInTheDocument();
  await screen.findByText('Bônus R$ 20 na Carteira');
});

test('resgate ligado: só o que cabe nos pontos tem botão; confirma e usa o gam do servidor', async () => {
  post.mockResolvedValue({ data: { success: true, gam: { ...mockGam, points: 100 } } });
  render(<MotoboyNivel />);
  await screen.findByText('Bônus R$ 20 na Carteira');
  expect(screen.getByText('Faltam 600 pts')).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: 'Resgatar' });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar resgate' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/gamification/redeem', { benefit: 'wallet_bonus_20' }));
  await waitFor(() => expect(mockSetGam).toHaveBeenCalledWith(expect.objectContaining({ points: 100 })));
  expect(await screen.findByText('"Bônus R$ 20 na Carteira" resgatado.')).toBeInTheDocument();
});

test('freio de resgate ligado: aviso, botões desabilitados e nenhuma chamada', async () => {
  mockFeatures = { features: { ...ON, benefitsRedeemEnabled: false }, loading: false };
  render(<MotoboyNivel />);
  await screen.findByText('Bônus R$ 20 na Carteira');
  expect(screen.getByText('Resgates temporariamente indisponíveis')).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: 'Resgatar' });
  expect(buttons).toHaveLength(2);
  buttons.forEach((b) => expect(b).toBeDisabled());
  buttons.forEach((b) => fireEvent.click(b));
  expect(screen.queryByRole('button', { name: 'Confirmar resgate' })).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

test('freios ainda carregando: resgate fechado, sem aviso e clicar não chama o servidor (K36)', async () => {
  // Pior caso: o valor já veio ligado, mas a leitura ainda não terminou. Só o `loading` fecha o resgate.
  mockFeatures = { features: { ...ON, benefitsRedeemEnabled: true }, loading: true };
  render(<MotoboyNivel />);
  await screen.findByText('Bônus R$ 20 na Carteira');
  expect(screen.queryByText('Resgates temporariamente indisponíveis')).toBeNull();
  const buttons = screen.getAllByRole('button', { name: 'Resgatar' });
  expect(buttons).toHaveLength(2);
  buttons.forEach((b) => expect(b).toBeDisabled());
  buttons.forEach((b) => fireEvent.click(b));
  expect(screen.queryByRole('button', { name: 'Confirmar resgate' })).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

test('freio fecha com o sheet aberto: confirmar não envia', async () => {
  post.mockResolvedValue({ data: { success: true, gam: mockGam } });
  const { rerender } = render(<MotoboyNivel />);
  await screen.findByText('Bônus R$ 20 na Carteira');
  fireEvent.click(screen.getByRole('button', { name: 'Resgatar' }));
  const confirmBtn = await screen.findByRole('button', { name: 'Confirmar resgate' });
  mockFeatures = { features: { ...ON, benefitsRedeemEnabled: false }, loading: false };
  rerender(<MotoboyNivel />);
  fireEvent.click(confirmBtn);
  expect(post).not.toHaveBeenCalled();
});

test('recusa do servidor (403 do freio) mostra a mensagem e não mexe nos pontos', async () => {
  post.mockRejectedValue({ response: { status: 403, data: { error: 'O resgate de benefícios está pausado no momento.', code: 'BENEFITS_REDEEM_PAUSED' } } });
  render(<MotoboyNivel />);
  await screen.findByText('Bônus R$ 20 na Carteira');
  fireEvent.click(screen.getByRole('button', { name: 'Resgatar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar resgate' }));
  expect(await screen.findByText('O resgate de benefícios está pausado no momento.')).toBeInTheDocument();
  expect(mockSetGam).not.toHaveBeenCalled();
});

test('benefícios não carregaram: erro com "Tentar de novo"', async () => {
  get.mockImplementation(() => Promise.reject(new Error('rede')));
  render(<MotoboyNivel />);
  expect(await screen.findByText('Não carregamos os benefícios')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

test('conquistas N de M e linha do ranking que leva ao Ranking', async () => {
  render(<MotoboyNivel />);
  expect(screen.getByText('2 de 28')).toBeInTheDocument();
  expect(screen.getByText('Centurião')).toBeInTheDocument();
  expect(screen.getByText('Noturno')).toBeInTheDocument();
  expect(screen.getByText('Você está em 2º de 3')).toBeInTheDocument();
  expect(screen.getByText('Top 10')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ranking do mês/ }));
  expect(mockPush).toHaveBeenCalledWith('/motoboy/ranking');
  await screen.findByText('Bônus R$ 20 na Carteira');
});

test('fora do ranking: convida a fazer a primeira corrida', async () => {
  mockRanking = [{ user_id: 'a', name: 'Rafael', pontosMes: 300, level: 'Ouro' }];
  render(<MotoboyNivel />);
  expect(screen.getByText('Faça a primeira corrida do mês para entrar')).toBeInTheDocument();
  await screen.findByText('Bônus R$ 20 na Carteira');
});

test('nível não carregou: erro e "Tentar de novo" relê /gamification/:id', async () => {
  mockGam = null;
  get.mockImplementation((url: string) => (url === '/gamification/m1' ? Promise.resolve({ data: { level: 'Bronze', totalPoints: 0, points: 0, badges: [] } }) : Promise.resolve({ data: BENEFITS })));
  render(<MotoboyNivel />);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(mockSetGam).toHaveBeenCalledWith(expect.objectContaining({ level: 'Bronze' })));
});

test('rota: tema noturno automático, redirects das telas antigas e páginas antigas apagadas', () => {
  expect(themeForPath('/motoboy/nivel')).toBe('motoboy-pref');
  expect(resolveRedirect(rules, '/motoboy/gamification')).toEqual({ location: '/motoboy/nivel', permanent: true });
  expect(resolveRedirect(rules, '/motoboy/beneficios')).toEqual({ location: '/motoboy/nivel', permanent: true });
  expect(fs.existsSync(path.join(ROOT, 'pages/motoboy/nivel.tsx'))).toBe(true);
  for (const f of ['pages/motoboy/gamification.tsx', 'pages/motoboy/beneficios.tsx', 'pages/motoboy/MotoboyGamification.module.css', 'pages/motoboy/MotoboyBeneficios.module.css']) {
    expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
  }
});

test('CSS só com tokens e sem style inline', () => {
  expect(cssViolations(fs.readFileSync(path.join(ROOT, 'components/motoboy/nivel/Nivel.module.css'), 'utf8'))).toEqual([]);
  expect(fs.readFileSync(path.join(ROOT, 'components/motoboy/nivel/NivelScreen.tsx'), 'utf8')).not.toMatch(/style=\{\{/);
});
