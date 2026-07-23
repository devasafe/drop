// Repositório de Gamification em Prisma/Postgres.
// Dois detalhes importantes de fronteira:
//  1) o campo virou `userId` no Prisma, mas a API/legado usa `user_id` — o mapper reexpõe.
//  2) o enum Prisma não aceita acento: o nível "Lendário" é gravado como `Lendario` e
//     reconvertido na leitura, para o app continuar usando a forma acentuada.
import { prisma } from '../lib/prisma';
import type { GamificationLevel as PrismaLevel } from '@prisma/client';

export type GamificationLevel = 'Bronze' | 'Prata' | 'Ouro' | 'Platina' | 'Diamante' | 'Lendário';
export interface HistoryEntry { date: string; action: string; points: number }

export interface GamRecord {
  _id?: string;
  user_id: string;
  points: number;
  totalPoints: number;
  level: GamificationLevel;
  badges: string[];
  history: HistoryEntry[];
}

const levelToDb = (l: string): PrismaLevel => (l === 'Lendário' ? 'Lendario' : l) as PrismaLevel;
const levelFromDb = (l: string): GamificationLevel => (l === 'Lendario' ? 'Lendário' : l) as GamificationLevel;

export function toApiGam(g: any): any {
  if (!g) return g;
  return {
    ...g,
    _id: g.id,
    user_id: g.userId,
    level: levelFromDb(g.level),
    history: (g.history ?? []) as HistoryEntry[],
  };
}

/** Objeto default em memória (ainda NÃO persistido) para um motoboy sem registro. */
export function defaultGam(userId: string): GamRecord {
  return { user_id: String(userId), points: 0, totalPoints: 0, level: 'Bronze', badges: [], history: [] };
}

export async function findGamByUser(userId: string): Promise<any | null> {
  const g = await prisma.gamification.findUnique({ where: { userId: String(userId) } });
  return toApiGam(g);
}

export async function listAllGam(): Promise<any[]> {
  const list = await prisma.gamification.findMany();
  return list.map(toApiGam);
}

export async function topGamByPoints(limit: number): Promise<any[]> {
  const list = await prisma.gamification.findMany({ orderBy: { points: 'desc' }, take: limit });
  return list.map(toApiGam);
}

/** Persiste (cria ou atualiza) a gamificação a partir de um objeto na forma de API. */
export async function persistGam(gam: { user_id: string; points?: number; totalPoints?: number; level?: string; badges?: string[]; history?: any[] }): Promise<any> {
  const data = {
    points: gam.points ?? 0,
    totalPoints: gam.totalPoints ?? 0,
    level: levelToDb(gam.level ?? 'Bronze'),
    badges: gam.badges ?? [],
    history: (gam.history ?? []) as any,
  };
  const saved = await prisma.gamification.upsert({
    where: { userId: String(gam.user_id) },
    create: { userId: String(gam.user_id), ...data },
    update: data,
  });
  return toApiGam(saved);
}
