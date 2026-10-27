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
    const [points, totalPoints, simulatedCount] = await Promise.all([
      sampledPoints(r.id, MAX_POINTS_PER_RIDE),
      prisma.deliveryTrackPoint.count({ where: { deliveryId: r.id } }),
      prisma.deliveryTrackPoint.count({ where: { deliveryId: r.id, simulated: true } }),
    ]);
    const m = r.motoboyId ? byId.get(r.motoboyId) : undefined;
    return {
      deliveryId: r.id,
      kind: String(r.kind),
      motoboy: r.motoboyId ? { id: r.motoboyId, name: m?.name ?? 'Motoboy', phone: m?.telefone ?? null } : null,
      signalLostAt: r.signalLostAt ? r.signalLostAt.toISOString() : null,
      simulatedCount,
      totalPoints,
      points: points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, simulated: p.simulated, at: p.createdAt.toISOString() })),
    };
  }));
}

/**
 * Amostra uniforme do caminho inteiro feita no banco (nunca carrega tudo na memória): até `max`
 * pontos, sempre com a primeira e a última posição.
 */
async function sampledPoints(deliveryId: string, max: number) {
  return prisma.$queryRaw<Array<{ lat: number; lng: number; accuracy: number | null; simulated: boolean; createdAt: Date }>>`
    SELECT lat, lng, accuracy, simulated, "createdAt" FROM (
      SELECT lat, lng, accuracy, simulated, "createdAt",
             row_number() OVER (ORDER BY "createdAt", id) AS rn,
             count(*) OVER () AS total
      FROM "DeliveryTrackPoint" WHERE "deliveryId" = ${deliveryId}
    ) t
    WHERE t.total <= ${max} OR t.rn = 1 OR t.rn = t.total
       OR (t.rn - 1) % CEIL(t.total::numeric / ${max - 1})::int = 0
    ORDER BY t.rn
    LIMIT ${max + 1}`;
}
