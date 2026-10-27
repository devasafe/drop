import { prisma } from '../../lib/prisma';

/** Antifraude · caminho do motoboy em cada corrida do pedido (ida e devolução). */
const MAX_POINTS_PER_RIDE = 5000;

export interface RideTrack {
  deliveryId: string;
  kind: string;
  motoboy: { id: string; name: string } | null;
  signalLostAt: string | null;
  simulatedCount: number;
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
  const motoboys = motoboyIds.length ? await prisma.user.findMany({ where: { id: { in: motoboyIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(motoboys.map((m) => [m.id, m.name]));

  return Promise.all(rides.map(async (r) => {
    const points = await prisma.deliveryTrackPoint.findMany({
      where: { deliveryId: r.id },
      orderBy: { createdAt: 'asc' },
      take: MAX_POINTS_PER_RIDE,
      select: { lat: true, lng: true, accuracy: true, simulated: true, createdAt: true },
    });
    return {
      deliveryId: r.id,
      kind: String(r.kind),
      motoboy: r.motoboyId ? { id: r.motoboyId, name: nameOf.get(r.motoboyId) ?? 'Motoboy' } : null,
      signalLostAt: r.signalLostAt ? r.signalLostAt.toISOString() : null,
      simulatedCount: points.filter((p) => p.simulated).length,
      points: points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, simulated: p.simulated, at: p.createdAt.toISOString() })),
    };
  }));
}
