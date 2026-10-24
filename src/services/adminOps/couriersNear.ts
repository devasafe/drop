/**
 * D3b-4b · motoboys por perto de cada loja (spec 7.1) e as lojas abertas sem nenhum (spec 7.2). Só leitura.
 *
 * - Online: as regras do mapa (map.ts), sem cópia. Conta só quem está online, com posição, e cuja posição
 *   não é velha (courierState ≠ 'stale', o mesmo STALE_LOCATION_MS do mapa). Quem está em entrega conta como online.
 * - Livre: courierState === 'free' (sem entrega assigned/picked de pedido em andamento).
 * - Raio: DISPATCH_MAX_KM, com calculateDistance e `<=`, igual ao despacho (isDeliveryWithinRadius).
 * - Loja sem coordenada → null. Duas consultas no máximo, qualquer que seja o número de lojas; nenhuma se
 *   nenhuma loja tem coordenada.
 * - Aberta: a regra da vitrine. Visível ao público (publicStoreVisibilityWhere) e aberta agora com horário
 *   (isStoreOpenWithHoursNow, a mesma do GET público da loja e da situação "Aberta" do admin).
 */
import { prisma } from '../../lib/prisma';
import { isStoreOpenWithHoursNow } from '../../utils/storeOpen';
import { publicStoreVisibilityWhere } from '../catalog/visibility';
import { DISPATCH_MAX_KM } from '../dispatch';
import { calculateDistance } from '../routeCalculator';
import { ONLINE_COURIER_WHERE, activeCourierDeliveries, courierState, parseCourierLocation, storeCoord } from './map';
import { OpsMapStorePoint } from './types';

export interface NearbyCouriers {
  online: number;
  free: number;
}

interface StorePoint {
  id: string;
  lat: number;
  lng: number;
}

export async function couriersNearStores(
  stores: Array<{ id: string; lat: number | null; lng: number | null }>,
  now: Date = new Date(),
): Promise<Map<string, NearbyCouriers | null>> {
  const result = new Map<string, NearbyCouriers | null>();
  const located: StorePoint[] = [];
  for (const s of stores) {
    if (s.lat === null || s.lng === null || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) result.set(s.id, null);
    else located.push({ id: s.id, lat: s.lat, lng: s.lng });
  }
  if (located.length === 0) return result;

  const [online, moving] = await Promise.all([
    prisma.user.findMany({ where: ONLINE_COURIER_WHERE, select: { id: true, currentLocation: true } }),
    activeCourierDeliveries(),
  ]);
  const busy = new Set(moving.map((d) => d.motoboyId));
  const couriers = online.flatMap((u) => {
    const loc = parseCourierLocation(u.currentLocation);
    if (!loc) return [];
    const state = courierState(loc, busy.has(u.id), now);
    return state === 'stale' ? [] : [{ lat: loc.lat, lng: loc.lng, free: state === 'free' }];
  });

  for (const s of located) {
    let count = 0;
    let free = 0;
    for (const c of couriers) {
      // Mesma ordem de argumentos e mesmo `<=` do despacho (dispatch.ts, isDeliveryWithinRadius).
      if (calculateDistance(c.lat, c.lng, s.lat, s.lng) <= DISPATCH_MAX_KM) {
        count += 1;
        if (c.free) free += 1;
      }
    }
    result.set(s.id, { online: count, free });
  }
  return result;
}

/** Lojas visíveis na vitrine, abertas agora (com horário) e com coordenada válida, por nome. */
export async function openStoresWithCoords(now: Date = new Date()): Promise<OpsMapStorePoint[]> {
  const stores = await prisma.store.findMany({
    where: {
      AND: [
        await publicStoreVisibilityWhere(),
        { isOpen: true, latitude: { not: null }, longitude: { not: null } },
      ],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      isOpen: true,
      pausedUntil: true,
      openOverrideUntil: true,
      operatingHours: true,
      adminPausedAt: true,
    },
  });
  return stores.flatMap((s): OpsMapStorePoint[] => {
    const lat = storeCoord(s.latitude);
    const lng = storeCoord(s.longitude);
    if (lat === null || lng === null || !isStoreOpenWithHoursNow(s, now)) return [];
    return [{ id: s.id, name: s.name, lat, lng }];
  });
}

/** O alerta do mapa: loja aberta, com ponto e com 0 motoboy online a até DISPATCH_MAX_KM. */
export async function storesWithoutCourier(now: Date = new Date()): Promise<OpsMapStorePoint[]> {
  const open = await openStoresWithCoords(now);
  const near = await couriersNearStores(open, now);
  return open.filter((s) => near.get(s.id)?.online === 0);
}
