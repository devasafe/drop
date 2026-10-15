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

/** Conquistas: `id` é o do backend (ALL_BADGES); `label` é o texto curto da tela. O teste confere os ids. */
export const BADGES: Array<{ id: string; label: string }> = [
  { id: 'Primeira entrega', label: 'Primeira entrega' },
  { id: '10 Missões', label: '10 entregas' },
  { id: '50 Missões', label: '50 entregas' },
  { id: 'Centurião', label: 'Centurião' },
  { id: 'Mestre das Ruas', label: 'Mestre das Ruas' },
  { id: 'Lenda Viva', label: 'Lenda Viva' },
  { id: 'Imortal', label: 'Imortal' },
  { id: 'Motoboy 5 estrelas', label: '5 estrelas' },
  { id: 'Sem reclamações', label: 'Sem reclamações' },
  { id: 'Impecável', label: 'Impecável' },
  { id: 'Nota Máxima', label: 'Nota máxima' },
  { id: 'Madrugador', label: 'Madrugador' },
  { id: 'Noturno', label: 'Noturno' },
  { id: 'Guerreiro do FDS', label: 'Guerreiro do FDS' },
  { id: 'Corredor', label: 'Corredor' },
  { id: 'Maratonista', label: 'Maratonista' },
  { id: 'Explorador Urbano', label: 'Explorador urbano' },
  { id: 'Dedicado', label: 'Dedicado' },
  { id: 'Incansável', label: 'Incansável' },
  { id: 'Máquina', label: 'Máquina' },
  { id: 'Escalando', label: 'Escalando' },
  { id: 'Ouro Puro', label: 'Ouro puro' },
  { id: 'Elite', label: 'Elite' },
  { id: 'Diamante', label: 'Diamante' },
  { id: 'Lendário', label: 'Lendário' },
  { id: 'Velocista', label: 'Velocista' },
  { id: 'Pódio', label: 'Pódio' },
  { id: 'Campeão do Mês', label: 'Campeão do mês' },
];

/** Só as conquistas conhecidas, na ordem da lista; id desconhecido é ignorado. */
export function unlockedBadges(ids: unknown): Array<{ id: string; label: string }> {
  const set = new Set(Array.isArray(ids) ? ids.map(String) : []);
  return BADGES.filter((b) => set.has(b.id));
}

/** "Rafael Martins" → "Rafael M." (o ranking e o perfil público não mostram o sobrenome inteiro). */
export function shortName(name: unknown): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Entregador';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Mês do ranking (o backend usa o mês corrente) e quantos dias faltam para ele acabar. */
export function rankingMonth(now: Date): { name: string; daysLeft: number } {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { name: MONTHS[now.getMonth()], daysLeft: last - now.getDate() };
}

/** ISO → "jul/2026"; null se a data não for válida. */
export function monthYear(iso: unknown): string | null {
  if (typeof iso !== 'string' && !(iso instanceof Date)) return null;
  const d = new Date(iso as string);
  if (isNaN(d.getTime())) return null;
  return `${MONTHS_ABBR[d.getMonth()]}/${d.getFullYear()}`;
}
