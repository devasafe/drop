import { prisma } from '../../lib/prisma';

/** Antifraude · caminho do motoboy em cada corrida do pedido (ida e devolução). */
const MAX_POINTS_PER_RIDE = 5000;

export interface RideTrack {
  deliveryId: string;
  kind: string;
  motoboy: { id: string; name: string; phone: string | null } | null;
  signalLostAt: string | null;
  simulatedCount: number;
  /** Total gravado; `points` pode ser uma amostra uniforme (sempre com a primeira e a última). */
  totalPoints: number;
  points: Array<{ lat: number; lng: number; accuracy: number | null; simulated: boolean; at: string }>;
}

export async function getOrderTrack(orderId: string): Promise<RideTrack[] | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) return null;
  const rides = await prisma.delivery.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, motoboyId: true, signalLostAt: true },
  });
  const motoboyIds = Array.from(new Set(rides.map((r) => r.motoboyId).filter((id): id is string => !!id)));
  const motoboys = motoboyIds.length ? await prisma.user.findMany({ where: { id: { in: motoboyIds } }, select: { id: true, name: true, telefone: true } }) : [];
  const byId = new Map(motoboys.map((m) => [m.id, m]));

  return Promise.all(rides.map(async (r) => {
    const [all, simulatedCount] = await Promise.all([
      prisma.deliveryTrackPoint.findMany({
        where: { deliveryId: r.id },
        orderBy: { createdAt: 'asc' },
        select: { lat: true, lng: true, accuracy: true, simulated: true, createdAt: true },
      }),
      prisma.deliveryTrackPoint.count({ where: { deliveryId: r.id, simulated: true } }),
    ]);
    const m = r.motoboyId ? byId.get(r.motoboyId) : undefined;
    return {
      deliveryId: r.id,
      kind: String(r.kind),
      motoboy: r.motoboyId ? { id: r.motoboyId, name: m?.name ?? 'Motoboy', phone: m?.telefone ?? null } : null,
      signalLostAt: r.signalLostAt ? r.signalLostAt.toISOString() : null,
      simulatedCount,
      totalPoints: all.length,
      points: sample(all, MAX_POINTS_PER_RIDE).map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, simulated: p.simulated, at: p.createdAt.toISOString() })),
    };
  }));
}

/** Amostra uniforme do caminho inteiro, com a primeira e a última posição. */
function sample<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  const step = (list.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => list[Math.round(i * step)]);
}
