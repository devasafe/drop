import fs from 'fs';
import path from 'path';
import { levelProgress, formatPoints, LEVELS, BADGES, unlockedBadges, shortName, rankingMonth, monthYear } from '../motoboyLevel';

describe('levelProgress (espelho de getLevelThresholds do backend)', () => {
  it('limites iguais aos lidos do código do backend', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/controllers/gamificationController.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function getLevelThresholds'), src.indexOf('ALL_BADGES'));
    const backend = [...body.matchAll(/level:\s*'([^']+)',\s*min:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
    expect(backend.length).toBe(6);
    expect(LEVELS.map((l) => [l.level, l.min])).toEqual(backend);
  });
  it('limites esperados', () => {
    expect(LEVELS.map((l) => [l.level, l.min])).toEqual([
      ['Bronze', 0], ['Prata', 500], ['Ouro', 1500], ['Platina', 3000], ['Diamante', 6000], ['Lendário', 10000],
    ]);
  });
  it('Bronze com 0 e 499; Prata com 500', () => {
    expect(levelProgress(0)).toEqual({ level: 'Bronze', points: 0, next: 'Prata', toNext: 500, pct: 0 });
    expect(levelProgress(499).level).toBe('Bronze');
    expect(levelProgress(500)).toEqual({ level: 'Prata', points: 500, next: 'Ouro', toNext: 1000, pct: 0 });
  });
  it('1.840 pontos é Ouro pela regra do servidor (o "Prata · 1.840" do protótipo é só exemplo)', () => {
    expect(levelProgress(1840)).toEqual({ level: 'Ouro', points: 1840, next: 'Platina', toNext: 1160, pct: 22 });
  });
  it('nível máximo não tem próximo', () => {
    expect(levelProgress(12000)).toEqual({ level: 'Lendário', points: 12000, next: null, toNext: 0, pct: 100 });
  });
  it('entrada inválida vira 0', () => {
    expect(levelProgress(NaN as any).points).toBe(0);
    expect(levelProgress(-5).points).toBe(0);
  });
  it('formatPoints usa ponto de milhar', () => {
    expect(formatPoints(1840)).toBe('1.840');
    expect(formatPoints(12)).toBe('12');
  });
});

const BACKEND = fs.readFileSync(path.join(__dirname, '../../../src/controllers/gamificationController.ts'), 'utf8');

describe('espelho do backend (P5.1)', () => {
  it('as faixas de nível são as de getLevel()', () => {
    const pairs = Array.from(BACKEND.matchAll(/if \(totalPoints >= (\d+)\) return '([^']+)'/g)).map((m) => ({ level: m[2], min: Number(m[1]) }));
    const backend = [{ level: 'Bronze', min: 0 }, ...pairs.reverse()];
    expect(backend).toHaveLength(6);
    expect(LEVELS.map((l) => ({ level: l.level, min: l.min }))).toEqual(backend);
  });
  it('as conquistas são as de ALL_BADGES (mesmos ids)', () => {
    const start = BACKEND.indexOf('export const ALL_BADGES');
    const block = BACKEND.slice(start, BACKEND.indexOf('];', start));
    const ids = Array.from(block.matchAll(/id: '([^']+)'/g)).map((m) => m[1]).sort();
    expect(ids.length).toBeGreaterThan(20);
    expect(BADGES.map((b) => b.id).sort()).toEqual(ids);
  });
});

it('unlockedBadges ignora id desconhecido e mantém a ordem da lista', () => {
  expect(unlockedBadges(['Noturno', 'xx', 'Centurião']).map((b) => b.label)).toEqual(['Centurião', 'Noturno']);
  expect(unlockedBadges(undefined)).toEqual([]);
});

it('shortName e monthYear', () => {
  expect(shortName('Rafael Martins Souza')).toBe('Rafael S.');
  expect(shortName('Bruno')).toBe('Bruno');
  expect(shortName('')).toBe('Entregador');
  expect(monthYear('2026-07-03T15:00:00Z')).toBe('jul/2026');
  expect(monthYear('lixo')).toBeNull();
});

it('rankingMonth: nome do mês e dias que faltam', () => {
  expect(rankingMonth(new Date(2026, 9, 8, 12))).toEqual({ name: 'outubro', daysLeft: 23 });
  expect(rankingMonth(new Date(2026, 1, 28, 9))).toEqual({ name: 'fevereiro', daysLeft: 0 });
});
