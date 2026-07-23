// Repositório de Coupon em Prisma/Postgres.
// `discountValue` e `minOrderValue` são Decimal → number na fronteira; reexpõe `_id`.
import { prisma } from '../lib/prisma';

const num = (v: any) => (v == null ? v : Number(v));

export function toApiCoupon(c: any): any {
  if (!c) return c;
  return { ...c, _id: c.id, discountValue: num(c.discountValue), minOrderValue: num(c.minOrderValue) };
}

export async function insertCoupon(data: Record<string, any>): Promise<any> {
  const c = await prisma.coupon.create({ data: data as any });
  return toApiCoupon(c);
}

export async function findCoupons(where: any): Promise<any[]> {
  const list = await prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' } });
  return list.map(toApiCoupon);
}

export async function findCouponById(id: string): Promise<any | null> {
  const c = await prisma.coupon.findUnique({ where: { id: String(id) } });
  return toApiCoupon(c);
}

export async function findCouponByCode(code: string): Promise<any | null> {
  const c = await prisma.coupon.findUnique({ where: { code: code.toUpperCase().trim() } });
  return toApiCoupon(c);
}

export async function updateCoupon(id: string, data: Record<string, any>): Promise<any> {
  const c = await prisma.coupon.update({ where: { id: String(id) }, data });
  return toApiCoupon(c);
}

export async function removeCoupon(id: string): Promise<void> {
  await prisma.coupon.delete({ where: { id: String(id) } });
}

/**
 * Incremento atômico de `usedCount` respeitando `maxUses` (anti-corrida): retorna
 * true se contou, false se o cupom já estava esgotado. Equivale ao
 * findOneAndUpdate({ usedCount: { $lt: maxUses } }, { $inc: { usedCount: 1 } }).
 */
export async function incrementCouponUse(id: string, maxUses: number | null | undefined): Promise<boolean> {
  if (maxUses == null) {
    await prisma.coupon.update({ where: { id: String(id) }, data: { usedCount: { increment: 1 } } }).catch(() => null);
    return true;
  }
  const r = await prisma.coupon.updateMany({
    where: { id: String(id), usedCount: { lt: maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  return r.count === 1;
}
