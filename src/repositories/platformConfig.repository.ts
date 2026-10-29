// Repositório do PlatformConfig (config singleton da plataforma) em Prisma/Postgres.
// Converte os campos Decimal→number na fronteira, já que todos os consumidores
// (walletCalculations, controllers) esperam números, e reexpõe `_id`.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

const num = (v: any) => (v == null ? v : Number(v));

const DECIMAL_FIELDS = [
  'commissionPlan1',
  'commissionPlan2',
  'commissionPlan3',
  'motoboyCutPerDelivery',
  'motoboyCutPerKm',
  'motoboyMinimumWithdraw',
  'storeMinimumWithdraw',
  'minOrderValue',
  'motoboyCommissionPercent',
  'lateCancellationFeePercent',
  'lateCancellationMotoboyShare',
  'cancelFeeCustomerPercent',
  'cancelFeeStorePercent',
  'cancelFeeMotoboyPercent',
  'cardFeePercent',
  'cardFeeFixed',
  'cardAnticipationMonthlyRate',
  'cardInstallmentMinValue',
  'motoboyShareDirect',
  'directTransferMaxAmount',
  'directTransferDailyMaxPerStore',
  'saasMonthlyFee',
] as const;

export function toApiConfig(c: any): any {
  if (!c) return c;
  const out: any = { ...c, _id: c.id };
  for (const f of DECIMAL_FIELDS) out[f] = num(c[f]);
  return out;
}

/** Lê a config singleton (ou null se ainda não existe). Campos Decimal→number. */
export async function getPlatformConfig(): Promise<any | null> {
  const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  return toApiConfig(c);
}

/** Garante a existência da config singleton, criando com defaults se necessário. */
export async function ensurePlatformConfig(updatedBy: string, db: Db = prisma): Promise<any> {
  const existing = await db.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  if (existing) return toApiConfig(existing);
  const created = await db.platformConfig.create({ data: { updatedBy: String(updatedBy || 'system') } });
  return toApiConfig(created);
}

/** Atualiza (ou cria) a config singleton com um patch parcial e retorna a forma de API. */
export async function updatePlatformConfig(patch: Record<string, any>, updatedBy: string, db: Db = prisma): Promise<any> {
  const existing = await db.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const data = { ...patch, updatedBy: String(updatedBy || 'system') };
  const saved = existing
    ? await db.platformConfig.update({ where: { id: existing.id }, data })
    : await db.platformConfig.create({ data });
  return toApiConfig(saved);
}
