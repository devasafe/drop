// frontend/__tests__/motoboy.ranking.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import api from '../lib/api';
import { themeForPath } from '../lib/routeTheme';

let mockFeatures: any = { features: { gamificationPointsEnabled: true, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false };
let mockRanking: any[] = [];
let mockError = false;
const mockReload = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/motoboy/ranking', asPath: '/motoboy/ranking' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, back, actions, children }: any) => <div data-testid="shell" data-back={back ?? ''}><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', activeRole: 'motoboy' }, loading: false }) }));
jest.mock('../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => mockFeatures }));
jest.mock('../hooks/useSync', () => ({ useRanking: () => ({ ranking: mockRanking, loading: false, error: mockError, reload: mockReload }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import { RankingScreen } from '../components/motoboy/nivel/RankingScreen';

const NOW = new Date(2026, 9, 8, 12);
const LIST = [
  { user_id: 'a', name: 'Rafael Martins', pontosMes: 3420, level: 'Ouro' },
  { user_id: 'b', name: 'Juliana Prado', pontosMes: 3105, level: 'Ouro' },
  { user_id: 'm1', name: 'Carlos Lima', pontosMes: 1880, level: 'Prata' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFeatures = { features: { gamificationPointsEnabled: true, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false };
  mockRanking = LIST;
  mockError = false;
  get.mockResolvedValue({ data: { month: 10, year: 2026, prizes: [{ position: 1, amount: 300, type: 'wallet' }, { position: 2, amount: 200, type: 'wallet' }] } });
});

test('topo com o mês e os dias que faltam; volta para Nível', () => {
  render(<RankingScreen now={NOW} />);
  expect(screen.getByRole('heading', { name: 'Ranking · outubro' })).toBeInTheDocument();
  expect(screen.getByText('faltam 23 dias')).toBeInTheDocument();
  expect(screen.getByTestId('shell')).toHaveAttribute('data-back', '/motoboy/nivel');
});

test('sua posição e o próximo degrau', () => {
  render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Você · Carlos L.')).toBeInTheDocument();
  expect(screen.getByText('Prata · 1.880 pts no mês')).toBeInTheDocument();
  expect(screen.getByText('Faltam 1.226 pts para passar o 2º lugar.')).toBeInTheDocument();
  expect(screen.getByText('1º · Rafael M.')).toBeInTheDocument();
});

test('prêmios pausados: aviso, sem valores e sem buscar os prêmios', () => {
  render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Prêmios do ranking pausados')).toBeInTheDocument();
  expect(screen.queryByText(/R\$/)).toBeNull();
  expect(get).not.toHaveBeenCalled();
});

test('prêmios ligados: valores ao lado das posições, sem o aviso', async () => {
  mockFeatures = { features: { ...mockFeatures.features, rankingPrizesEnabled: true }, loading: false };
  render(<RankingScreen now={NOW} />);
  expect(await screen.findByText('R$ 300,00')).toBeInTheDocument();
  expect(screen.getByText('R$ 200,00')).toBeInTheDocument();
  expect(screen.queryByText('Prêmios do ranking pausados')).toBeNull();
  expect(get).toHaveBeenCalledWith('/ranking-prizes');
});

test('prêmios ligados mas a leitura falhou: sem valor presumido', async () => {
  mockFeatures = { features: { ...mockFeatures.features, rankingPrizesEnabled: true }, loading: false };
  get.mockRejectedValue(new Error('rede'));
  render(<RankingScreen now={NOW} />);
  await new Promise((r) => setTimeout(r, 0));
  expect(get).toHaveBeenCalledWith('/ranking-prizes');
  expect(screen.queryByText(/R\$/)).toBeNull();
});

test('primeiro lugar e fora da lista', () => {
  mockRanking = [{ user_id: 'm1', name: 'Carlos Lima', pontosMes: 10, level: 'Bronze' }];
  const { unmount } = render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Você está em 1º lugar.')).toBeInTheDocument();
  unmount();
  mockRanking = [{ user_id: 'a', name: 'Rafael', pontosMes: 10, level: 'Bronze' }];
  render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Faça a primeira corrida do mês para entrar no ranking.')).toBeInTheDocument();
});

test('ninguém pontuou', () => {
  mockRanking = [];
  render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Ninguém pontuou ainda')).toBeInTheDocument();
});

test('rota noturna; ComingSoon e o CSS antigo saíram; sem style inline', () => {
  const ROOT = path.join(__dirname, '..');
  expect(themeForPath('/motoboy/ranking')).toBe('night-auto');
  for (const f of ['components/motoboy/ComingSoon.tsx', 'components/motoboy/ComingSoon.module.css', 'pages/motoboy/MotoboyRanking.module.css']) {
    expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
  }
  expect(fs.readFileSync(path.join(ROOT, 'components/motoboy/nivel/RankingScreen.tsx'), 'utf8')).not.toMatch(/style=\{\{/);
});

test('falha ao ler o ranking aparece como erro, nao como vazio, com Tentar de novo', () => {
  mockRanking = [];
  mockError = true;
  render(<RankingScreen now={NOW} />);
  expect(screen.getByText('Não conseguimos abrir o ranking')).toBeInTheDocument();
  expect(screen.queryByText('Ninguém pontuou ainda')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockReload).toHaveBeenCalledTimes(1);
});

test('12 pessoas e você em 11º: top 10 mais a sua linha', () => {
  mockRanking = Array.from({ length: 12 }, (_, i) => ({
    user_id: i === 10 ? 'm1' : `u${i}`,
    name: i === 10 ? 'Carlos Lima' : `Pessoa${i} Sobrenome`,
    pontosMes: 1000 - i,
    level: 'Prata',
  }));
  render(<RankingScreen now={NOW} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(11);
  expect(screen.getByText('10º · Pessoa9 S.')).toBeInTheDocument();
  expect(screen.getByText('11º · Você')).toBeInTheDocument();
  expect(screen.queryByText('12º · Pessoa11 S.')).toBeNull();
  expect(screen.queryByText('Top 10')).toBeNull();
});
