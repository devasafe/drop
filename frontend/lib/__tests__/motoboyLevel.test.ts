import fs from 'fs';
import path from 'path';
import { levelProgress, formatPoints, LEVELS } from '../motoboyLevel';

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
