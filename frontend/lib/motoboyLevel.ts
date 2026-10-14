// Níveis da gamificação do motoboy. Espelho de getLevelThresholds() em
// src/controllers/gamificationController.ts: mudou lá, muda aqui (o teste confere os números).
export const LEVELS = [
  { level: 'Bronze', min: 0 },
  { level: 'Prata', min: 500 },
  { level: 'Ouro', min: 1500 },
  { level: 'Platina', min: 3000 },
  { level: 'Diamante', min: 6000 },
  { level: 'Lendário', min: 10000 },
] as const;

export interface LevelProgress {
  level: string;
  points: number;
  next: string | null;
  toNext: number;
  pct: number;
}

export function levelProgress(totalPoints: number): LevelProgress {
  const raw = Math.floor(Number(totalPoints));
  const points = Number.isFinite(raw) && raw > 0 ? raw : 0;
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (points >= LEVELS[k].min) i = k;
  const cur = LEVELS[i];
  const nxt = LEVELS[i + 1];
  if (!nxt) return { level: cur.level, points, next: null, toNext: 0, pct: 100 };
  const pct = Math.min(100, Math.floor(((points - cur.min) / (nxt.min - cur.min)) * 100));
  return { level: cur.level, points, next: nxt.level, toNext: nxt.min - points, pct };
}

export function formatPoints(n: number): string {
  return String(Math.max(0, Math.floor(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
