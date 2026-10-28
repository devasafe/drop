import { prisma } from '../lib/prisma';

/**
 * Limite do motoboy novo (antifraude): nas primeiras entregas ele só pega pedido de valor
 * baixo. O golpista típico cria a conta e some com a primeira entrega cara; assim o prejuízo
 * máximo fica limitado até haver histórico. Vale para entrega e para corrida de devolução.
 */
export const NEW_COURIER_DELIVERIES = 20;
export const NEW_COURIER_MAX_ORDER_VALUE = 150;

/** Valor do que o motoboy carrega: os produtos (subtotal); sem subtotal, o total do pedido. */
export const orderGoodsValue = (o: { subtotal: unknown; totalValue: unknown }): number =>
  Number(o.subtotal ?? o.totalValue) || 0;

/** Entregas concluídas por motoboy (só dos ids pedidos). */
async function deliveredCounts(motoboyIds: string[]): Promise<Map<string, number>> {
  if (motoboyIds.length === 0) return new Map();
  const rows = await prisma.delivery.groupBy({
    by: ['motoboyId'],
    where: { motoboyId: { in: motoboyIds }, status: 'delivered' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [String(r.motoboyId), r._count._all]));
}

export interface CourierLimit {
  /** Valor máximo de pedido que ele pode pegar agora; null = sem limite. */
  maxOrderValue: number | null;
  /** Entregas que faltam para o limite sair (0 quando já saiu). */
  remaining: number;
}

export async function courierLimit(motoboyId: string): Promise<CourierLimit> {
  const done = (await deliveredCounts([motoboyId])).get(motoboyId) ?? 0;
  const remaining = Math.max(NEW_COURIER_DELIVERIES - done, 0);
  return { maxOrderValue: remaining > 0 ? NEW_COURIER_MAX_ORDER_VALUE : null, remaining };
}

/** Valor dos produtos de cada pedido. */
export async function orderValues(orderIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(orderIds.map(String)));
  if (ids.length === 0) return new Map();
  const rows = await prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true, subtotal: true, totalValue: true } });
  return new Map(rows.map((o) => [o.id, orderGoodsValue(o)]));
}

/** Pedido acima do limite do motoboy novo? */
export const overLimit = (limit: CourierLimit, value: number): boolean =>
  limit.maxOrderValue !== null && value > limit.maxOrderValue;

/**
 * Dos motoboys informados, quais ainda são novos e não podem pegar um pedido deste valor.
 * Usado para não avisar (socket e push) quem não poderia aceitar a corrida.
 */
export async function newCouriersBlockedFor(orderId: string, motoboyIds: string[]): Promise<string[]> {
  if (motoboyIds.length === 0) return [];
  const value = (await orderValues([orderId])).get(String(orderId)) ?? 0;
  if (value <= NEW_COURIER_MAX_ORDER_VALUE) return [];
  const counts = await deliveredCounts(motoboyIds);
  return motoboyIds.filter((id) => (counts.get(id) ?? 0) < NEW_COURIER_DELIVERIES);
}

/** Motoboys online que ainda são novos demais para este pedido (para não avisá-los da corrida). */
export async function blockedOnlineNewCouriers(orderId: string): Promise<string[]> {
  const value = (await orderValues([orderId])).get(String(orderId)) ?? 0;
  if (value <= NEW_COURIER_MAX_ORDER_VALUE) return [];
  const online = await prisma.user.findMany({ where: { role: 'motoboy', isOnline: true }, select: { id: true } });
  return newCouriersBlockedFor(orderId, online.map((u) => u.id));
}
