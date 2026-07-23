// Repositório do RankingPrize (config de prêmios mensais) em Prisma/Postgres.
import { prisma } from '../lib/prisma';

export function toApiPrize(p: any): any {
  if (!p) return p;
  return { ...p, _id: p.id };
}

export async function findPrizeConfig(month: number, year: number): Promise<any | null> {
  const p = await prisma.rankingPrize.findUnique({ where: { month_year: { month, year } } });
  return toApiPrize(p);
}

export async function listDistributedPrizes(limit = 12): Promise<any[]> {
  const list = await prisma.rankingPrize.findMany({
    where: { distributed: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: limit,
  });
  return list.map(toApiPrize);
}

/**
 * Upsert de config de prêmios equivalente ao `findOneAndUpdate(..., { $setOnInsert }, { upsert })`
 * do Mongo: `update` sempre grava; `insertDefaults` só entra quando cria o registro.
 */
export async function upsertPrizeConfig(
  month: number,
  year: number,
  update: Record<string, any>,
  insertDefaults: Record<string, any> = {},
): Promise<any> {
  const existing = await prisma.rankingPrize.findUnique({ where: { month_year: { month, year } } });
  if (existing) {
    const saved = await prisma.rankingPrize.update({ where: { id: existing.id }, data: update });
    return toApiPrize(saved);
  }
  const created = await prisma.rankingPrize.create({ data: { month, year, ...insertDefaults, ...update } as any });
  return toApiPrize(created);
}
