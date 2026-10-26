import { Delivery, ReturnRequest } from '@prisma/client';
import { prisma } from '../lib/prisma';
import logger from '../config/logger';
import notifier from './notifier';
import { getRoute } from './routeService';
import { calculateDeliveryFeeWithConfig } from '../utils/walletCalculations';
import { toApiDelivery } from '../repositories/delivery.repository';
import { emitDeliveryCreated } from '../utils/socketEmitter';
import { round2 } from './cancellation/shared';

/**
 * Corrida de devolução (caso B, fase 2b): o motoboy busca o produto na casa do cliente e leva à
 * loja. Na Delivery `kind: 'devolucao'`, store* = RETIRADA (cliente) e customer* = DESTINO (loja),
 * para o despacho, a oferta e a navegação continuarem lendo "retirada = store*" sem desvio.
 * A taxa é a da entrega normal (fixa + por km de rota cliente → loja).
 */

export const isReturnRide = (d: { kind?: string | null } | null | undefined): boolean => d?.kind === 'devolucao';

/** Pontos do pedido para a corrida de volta; null se o pedido não tem as coordenadas. */
export async function returnRidePoints(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerAddress: true, customerLatitude: true, customerLongitude: true, storeAddress: true, storeLatitude: true, storeLongitude: true },
  });
  const ok = (v: unknown) => v != null && Number.isFinite(Number(v));
  if (!o || !ok(o.customerLatitude) || !ok(o.customerLongitude) || !ok(o.storeLatitude) || !ok(o.storeLongitude)) return null;
  return {
    pickup: { address: o.customerAddress, lat: Number(o.customerLatitude), lng: Number(o.customerLongitude) },
    dropoff: { address: o.storeAddress, lat: Number(o.storeLatitude), lng: Number(o.storeLongitude) },
  };
}

/** Cria a corrida de volta no pool e avisa os motoboys. */
export async function createReturnRide(rr: ReturnRequest, points: NonNullable<Awaited<ReturnType<typeof returnRidePoints>>>): Promise<Delivery> {
  const route = await getRoute({ origin: { lat: points.pickup.lat, lng: points.pickup.lng }, destination: { lat: points.dropoff.lat, lng: points.dropoff.lng } });
  const distance = round2(Number(route?.distanceKm) || 0);
  const fee = round2(await calculateDeliveryFeeWithConfig(distance));

  const ride = await prisma.delivery.create({
    data: {
      orderId: rr.orderId,
      kind: 'devolucao',
      returnRequestId: rr.id,
      status: 'pending',
      distance,
      fee,
      storeAddress: points.pickup.address,
      storeLatitude: points.pickup.lat,
      storeLongitude: points.pickup.lng,
      customerAddress: points.dropoff.address,
      customerLatitude: points.dropoff.lat,
      customerLongitude: points.dropoff.lng,
      routePolyline: route?.polyline ?? null,
    },
  });

  const api = toApiDelivery(ride);
  emitDeliveryCreated(api);
  try {
    notifier.notifyMotoboys({ type: 'new_delivery', delivery: { id: ride.id, orderId: ride.orderId, fee: Number(ride.fee), distance: ride.distance } });
  } catch (err) {
    logger.warn('[returnRide] falha ao avisar os motoboys', { deliveryId: ride.id, errName: (err as Error)?.name });
  }
  return ride;
}

/** A corrida de volta de um pedido de reembolso (a mais recente). */
export function findReturnRide(returnRequestId: string) {
  return prisma.delivery.findFirst({ where: { returnRequestId }, orderBy: { createdAt: 'desc' } });
}
