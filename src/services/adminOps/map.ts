/**
 * D3b-1 · Mapa ao vivo (spec 3.4). Só leitura.
 *
 * Motoboy: só online com currentLocation válido ({ lat, lng, updatedAt }, como o app grava em
 * PATCH de localização). Localização com mais de 2 min = 'stale' (sem sinal), mesmo em entrega.
 * Nada do cliente sai daqui: só a posição da loja e a do motoboy. O raio é o mesmo do despacho
 * (radiusForAgeKm pela idade da entrega); passou do teto = null (aberto a todos).
 *
 * D3b-4b: as regras de motoboy (online, posição, frescor e "livre") e a coordenada da loja saem
 * daqui exportadas; os "motoboys por perto" (couriersNear.ts) as reaproveitam, sem cópia.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { DISPATCH_BASE_KM, DISPATCH_MAX_KM, DISPATCH_STEP_KM, DISPATCH_STEP_MS, radiusForAgeKm } from '../dispatch';
import { OpsMapResponse } from './types';
import { ACTIVE_ORDER_STATUSES, MIN_MS, readOpsLimits, shortOrderId } from './common';

export const STALE_LOCATION_MS = 2 * MIN_MS;
const WAITING_MAX = 200;

/** Motoboy online com posição gravada. A posição ainda pode estar velha: quem decide é `courierState`. */
export const ONLINE_COURIER_WHERE: Prisma.UserWhereInput = {
  isOnline: true,
  roles: { has: 'motoboy' },
  NOT: { currentLocation: { equals: Prisma.AnyNull } },
};

export interface CourierLocation {
  lat: number;
  lng: number;
  updatedAt: Date;
}

/** User.currentLocation → posição; campo faltando ou inválido → null. */
export function parseCourierLocation(raw: Prisma.JsonValue | null): CourierLocation | null {
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
export const storeCoord = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export type CourierState = OpsMapResponse['motoboys'][number]['state'];

/**
 * A regra de "livre": posição com mais de STALE_LOCATION_MS = 'stale' (sem sinal), mesmo em entrega;
 * senão, com entrega em curso (activeCourierDeliveries) = 'delivering'; senão, 'free'.
 */
export function courierState(loc: CourierLocation, busy: boolean, now: Date): CourierState {
  if (now.getTime() - loc.updatedAt.getTime() > STALE_LOCATION_MS) return 'stale';
  return busy ? 'delivering' : 'free';
}

export interface ActiveCourierDelivery {
  orderId: string;
  motoboyId: string;
  status: 'assigned' | 'picked';
}

/**
 * Entregas que ocupam o motoboy: `assigned` ou `picked`, com motoboy, de pedido em andamento
 * (ACTIVE_ORDER_STATUSES). Entrega órfã (pedido já encerrado) não ocupa ninguém. Uma consulta só
 * (Delivery não tem relação com Order no schema, daí o JOIN em SQL).
 */
export async function activeCourierDeliveries(): Promise<ActiveCourierDelivery[]> {
  return prisma.$queryRaw<ActiveCourierDelivery[]>`
    SELECT d."orderId", d."motoboyId", d.status::text AS status
      FROM "Delivery" d
      JOIN "Order" o ON o.id = d."orderId"
     WHERE d.status::text IN ('assigned', 'picked')
       AND d."motoboyId" IS NOT NULL
       AND o.status::text IN (${Prisma.join(ACTIVE_ORDER_STATUSES)})`;
}

export async function getOpsMap(now: Date = new Date()): Promise<OpsMapResponse> {
  const [limits, online, pending, moving] = await Promise.all([
    readOpsLimits(),
    prisma.user.findMany({ where: ONLINE_COURIER_WHERE, select: { id: true, name: true, currentLocation: true } }),
    // Sem `take` aqui: entregas órfãs (pedido já encerrado) não podem ocupar o limite; o corte vem depois do filtro.
    prisma.delivery.findMany({
      where: { status: 'pending', motoboyId: null },
      orderBy: { createdAt: 'asc' },
      select: { orderId: true, createdAt: true, storeLatitude: true, storeLongitude: true },
    }),
    activeCourierDeliveries(),
  ]);

  const orderIds = Array.from(new Set(pending.map((d) => d.orderId)));
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

  // motoboy → pedido da entrega em curso (assigned/picked de pedido em andamento)
  const orderOfMotoboy = new Map(moving.map((d) => [d.motoboyId, d.orderId]));
  const busy = new Set(orderOfMotoboy.keys());
  const movingUsers = busy.size
    ? await prisma.user.findMany({ where: { id: { in: Array.from(busy) } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(movingUsers.map((u) => [u.id, u.name]));

  const motoboys = online.flatMap((u): OpsMapResponse['motoboys'] => {
    const loc = parseCourierLocation(u.currentLocation);
    if (!loc) return [];
    const orderId = orderOfMotoboy.get(u.id) ?? null;
    return [{
      id: u.id,
      name: u.name,
      lat: loc.lat,
      lng: loc.lng,
      updatedAt: loc.updatedAt.toISOString(),
      state: courierState(loc, busy.has(u.id), now),
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
      storeLat: d.storeLatitude ?? o.storeLatitude ?? storeCoord(o.store.latitude),
      storeLng: d.storeLongitude ?? o.storeLongitude ?? storeCoord(o.store.longitude),
      since: d.createdAt.toISOString(),
      radiusKm: Number.isFinite(radius) ? radius : null,
      customerDeciding: o.awaitingCustomerPoolDecision,
    }];
  }).slice(0, WAITING_MAX);

  const inDelivery = moving.map((d): OpsMapResponse['inDelivery'][number] => ({
    orderId: d.orderId,
    shortId: shortOrderId(d.orderId),
    motoboyName: nameById.get(d.motoboyId) ?? 'Motoboy',
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
