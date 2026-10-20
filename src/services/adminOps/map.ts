/**
 * D3b-1 · Mapa ao vivo (spec 3.4). Só leitura.
 *
 * Motoboy: só online com currentLocation válido ({ lat, lng, updatedAt }, como o app grava em
 * PATCH de localização). Localização com mais de 2 min = 'stale' (sem sinal), mesmo em entrega.
 * Nada do cliente sai daqui: só a posição da loja e a do motoboy. O raio é o mesmo do despacho
 * (radiusForAgeKm pela idade da entrega); passou do teto = null (aberto a todos).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DISPATCH_BASE_KM, DISPATCH_MAX_KM, DISPATCH_STEP_KM, DISPATCH_STEP_MS, radiusForAgeKm } from '../dispatch';
import { OpsMapResponse } from './types';
import { ACTIVE_ORDER_STATUSES, MIN_MS, readOpsLimits, shortOrderId } from './common';

export const STALE_LOCATION_MS = 2 * MIN_MS;
const WAITING_MAX = 200;

interface Location {
  lat: number;
  lng: number;
  updatedAt: Date;
}

function parseLocation(raw: Prisma.JsonValue | null): Location | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const loc = raw as { lat?: unknown; lng?: unknown; updatedAt?: unknown };
  if (loc.lat == null || loc.lng == null || loc.updatedAt == null) return null;
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  const updatedAt = new Date(String(loc.updatedAt));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Number.isNaN(updatedAt.getTime())) return null;
  return { lat, lng, updatedAt };
}

/** Store.latitude/longitude são texto; vazio ou inválido → null. */
const coord = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getOpsMap(now: Date = new Date()): Promise<OpsMapResponse> {
  const [limits, online, pending, moving] = await Promise.all([
    readOpsLimits(),
    prisma.user.findMany({
      where: { isOnline: true, roles: { has: 'motoboy' }, NOT: { currentLocation: { equals: Prisma.AnyNull } } },
      select: { id: true, name: true, currentLocation: true },
    }),
    // Sem `take` aqui: entregas órfãs (pedido já encerrado) não podem ocupar o limite; o corte vem depois do filtro.
    prisma.delivery.findMany({
      where: { status: 'pending', motoboyId: null },
      orderBy: { createdAt: 'asc' },
      select: { orderId: true, createdAt: true, storeLatitude: true, storeLongitude: true },
    }),
    prisma.delivery.findMany({
      where: { status: { in: ['assigned', 'picked'] }, motoboyId: { not: null } },
      select: { orderId: true, motoboyId: true, status: true },
    }),
  ]);

  const orderIds = Array.from(new Set([...pending, ...moving].map((d) => d.orderId)));
  const orders = orderIds.length
    ? await prisma.order.findMany({
        where: { id: { in: orderIds }, status: { in: ACTIVE_ORDER_STATUSES } },
        select: {
          id: true,
          awaitingCustomerPoolDecision: true,
          storeLatitude: true,
          storeLongitude: true,
          store: { select: { name: true, latitude: true, longitude: true } },
        },
      })
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const activeMoving = moving.filter((d) => orderById.has(d.orderId));
  // motoboy → pedido da entrega em curso (assigned/picked de pedido em andamento)
  const orderOfMotoboy = new Map(activeMoving.map((d) => [d.motoboyId as string, d.orderId]));
  const busy = new Set(orderOfMotoboy.keys());
  const movingUsers = busy.size
    ? await prisma.user.findMany({ where: { id: { in: Array.from(busy) } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(movingUsers.map((u) => [u.id, u.name]));

  const motoboys = online.flatMap((u): OpsMapResponse['motoboys'] => {
    const loc = parseLocation(u.currentLocation);
    if (!loc) return [];
    const stale = now.getTime() - loc.updatedAt.getTime() > STALE_LOCATION_MS;
    const orderId = orderOfMotoboy.get(u.id) ?? null;
    return [{
      id: u.id,
      name: u.name,
      lat: loc.lat,
      lng: loc.lng,
      updatedAt: loc.updatedAt.toISOString(),
      state: stale ? 'stale' : busy.has(u.id) ? 'delivering' : 'free',
      orderId,
      shortId: orderId ? shortOrderId(orderId) : null,
    }];
  });

  const waiting = pending.flatMap((d): OpsMapResponse['waiting'] => {
    const o = orderById.get(d.orderId);
    if (!o) return [];
    const radius = radiusForAgeKm(now.getTime() - d.createdAt.getTime());
    return [{
      orderId: o.id,
      shortId: shortOrderId(o.id),
      storeName: o.store.name,
      storeLat: d.storeLatitude ?? o.storeLatitude ?? coord(o.store.latitude),
      storeLng: d.storeLongitude ?? o.storeLongitude ?? coord(o.store.longitude),
      since: d.createdAt.toISOString(),
      radiusKm: Number.isFinite(radius) ? radius : null,
      customerDeciding: o.awaitingCustomerPoolDecision,
    }];
  }).slice(0, WAITING_MAX);

  const inDelivery = activeMoving.map((d): OpsMapResponse['inDelivery'][number] => ({
    orderId: d.orderId,
    shortId: shortOrderId(d.orderId),
    motoboyName: nameById.get(d.motoboyId as string) ?? 'Motoboy',
    stage: d.status === 'picked' ? 'levando' : 'indo_para_loja',
  }));

  return {
    motoboys,
    waiting,
    inDelivery,
    dispatch: {
      initialKm: DISPATCH_BASE_KM,
      stepKm: DISPATCH_STEP_KM,
      stepSeconds: DISPATCH_STEP_MS / 1000,
      maxKm: DISPATCH_MAX_KM,
      poolTimeoutMin: limits.poolTimeoutMin,
    },
  };
}
