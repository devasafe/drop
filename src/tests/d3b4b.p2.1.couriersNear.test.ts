/**
 * D3b-4b · P2.1 — couriersNearStores (spec 7.1 e 10): raio do despacho com `<=` (limite dentro e fora), posição
 * velha pela regra do mapa, motoboy em entrega (online, não livre), loja sem coordenada (null, sem derrubar as
 * outras) e no máximo duas consultas para qualquer número de lojas.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createTestUser } from './helpers/authUser';
import { cleanupOpsFixtures, createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { couriersNearStores } from '../services/adminOps/couriersNear';
import { STALE_LOCATION_MS, storeCoord } from '../services/adminOps/map';
import { DISPATCH_MAX_KM } from '../services/dispatch';
import { calculateDistance } from '../services/routeCalculator';

const DOMAIN = '@d3b4bp21.test';
const MARK = 'd3b4bp21';
// Longe das outras suítes (São Paulo e Rio): nenhum motoboy de fora cai no raio destas lojas.
const LAT = 1;
const LNG = 1;
/** Latitude do ponto `km` ao norte da loja, no mesmo meridiano. */
const north = (km: number) => LAT + (km / 6371) * (180 / Math.PI);

let customerId: string;
let storeId: string;

beforeEach(async () => {
  customerId = (await createTestUser('cliente', DOMAIN)).userId;
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Raio', latitude: String(LAT), longitude: String(LNG) });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupOpsFixtures(DOMAIN, MARK);
});

/** Motoboy com presença e posição gravadas como o app grava ({ lat, lng, updatedAt }). `at` null = sem posição. */
async function motoboy(lat: number, lng: number, at: Date | null, online = true): Promise<string> {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({
    where: { id: m.userId },
    data: { isOnline: online, currentLocation: at ? { lat, lng, updatedAt: at.toISOString() } : Prisma.DbNull },
  });
  return m.userId;
}

/** Entrega do motoboy num pedido com o status dado ('cancelado' = pedido encerrado, entrega órfã). */
const deliveryOf = (motoboyId: string, status: 'assigned' | 'picked', orderStatus: 'aguardando_motoboy' | 'enviado' | 'cancelado') =>
  createOpsOrder({
    customerId, storeId, status: orderStatus, acceptedAt: new Date(),
    delivery: { status, motoboyId, assignedAt: new Date() },
  });

const point = (id: string, lat: number | null, lng: number | null) => ({ id, lat, lng });

describe('couriersNearStores', () => {
  it('limite do raio: distância igual a DISPATCH_MAX_KM conta (<=, como o despacho); um pouco além, não', async () => {
    const now = new Date();
    const noLimite = north(DISPATCH_MAX_KM + 0.003);
    const alem = north(DISPATCH_MAX_KM + 0.02);
    // calculateDistance arredonda a 2 casas: 12,003 km vira exatamente o teto; 12,02 km passa dele.
    expect(calculateDistance(noLimite, LNG, LAT, LNG)).toBe(DISPATCH_MAX_KM);
    expect(calculateDistance(alem, LNG, LAT, LNG)).toBeGreaterThan(DISPATCH_MAX_KM);
    await motoboy(noLimite, LNG, now);
    await motoboy(alem, LNG, now);

    const near = await couriersNearStores([point(storeId, LAT, LNG)], now);
    expect(near.get(storeId)).toEqual({ online: 1, free: 1 });
  });

  it('posição velha (mais de STALE_LOCATION_MS, a regra do mapa), offline e sem posição não contam', async () => {
    const now = new Date();
    const perto = north(1);
    // Exatamente STALE_LOCATION_MS ainda vale (o mapa só marca "sem sinal" acima disso).
    await motoboy(perto, LNG, new Date(now.getTime() - STALE_LOCATION_MS));
    await motoboy(perto, LNG, new Date(now.getTime() - STALE_LOCATION_MS - 1_000));
    await motoboy(perto, LNG, now, false);
    await motoboy(perto, LNG, null);

    const near = await couriersNearStores([point(storeId, LAT, LNG)], now);
    expect(near.get(storeId)).toEqual({ online: 1, free: 1 });
  });

  it('motoboy em entrega conta como online e não como livre; entrega de pedido encerrado não ocupa', async () => {
    const now = new Date();
    const perto = north(2);
    const indo = await motoboy(perto, LNG, now);
    const levando = await motoboy(perto, LNG, now);
    const orfao = await motoboy(perto, LNG, now);
    await deliveryOf(indo, 'assigned', 'aguardando_motoboy');
    await deliveryOf(levando, 'picked', 'enviado');
    await deliveryOf(orfao, 'assigned', 'cancelado');

    const near = await couriersNearStores([point(storeId, LAT, LNG)], now);
    expect(near.get(storeId)).toEqual({ online: 3, free: 1 });
  });

  it('loja sem coordenada: null, sem derrubar as outras; só lojas sem coordenada não consultam o banco', async () => {
    const now = new Date();
    await motoboy(north(1), LNG, now);
    const semPonto = await createOpsStore(DOMAIN, { name: 'Loja Sem Ponto' });
    const pontoVazio = await createOpsStore(DOMAIN, { name: 'Loja Ponto Vazio', latitude: '', longitude: '' });
    // A entrada montada a partir da Store, como a ficha e a lista (P3) montam.
    const lojas = await prisma.store.findMany({
      where: { id: { in: [storeId, semPonto, pontoVazio] } },
      select: { id: true, latitude: true, longitude: true },
    });
    const entrada = lojas.map((s) => ({ id: s.id, lat: storeCoord(s.latitude), lng: storeCoord(s.longitude) }));

    const near = await couriersNearStores(entrada, now);
    expect(near.size).toBe(3);
    expect(near.get(storeId)).toEqual({ online: 1, free: 1 });
    expect(near.get(semPonto)).toBeNull();
    expect(near.get(pontoVazio)).toBeNull();

    const users = jest.spyOn(prisma.user, 'findMany');
    const raw = jest.spyOn(prisma, '$queryRaw');
    const soSemPonto = await couriersNearStores([point(semPonto, null, null), point(pontoVazio, LAT, null)], now);
    expect(soSemPonto.get(semPonto)).toBeNull();
    expect(soSemPonto.get(pontoVazio)).toBeNull();
    expect(users).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });

  it('no máximo duas consultas, qualquer que seja o número de lojas', async () => {
    const now = new Date();
    await motoboy(north(1), LNG, now);
    // 40 lojas, cada uma 0,5° (~55 km) a leste da anterior: só a primeira tem o motoboy no raio.
    const lojas = Array.from({ length: 40 }, (_, i) => point(`loja-${i}`, LAT, LNG + i * 0.5));
    const users = jest.spyOn(prisma.user, 'findMany');
    const raw = jest.spyOn(prisma, '$queryRaw');
    const deliveries = jest.spyOn(prisma.delivery, 'findMany');
    const orders = jest.spyOn(prisma.order, 'findMany');
    const stores = jest.spyOn(prisma.store, 'findMany');

    const near = await couriersNearStores(lojas, now);
    expect(users).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(1);
    expect(deliveries).not.toHaveBeenCalled();
    expect(orders).not.toHaveBeenCalled();
    expect(stores).not.toHaveBeenCalled();
    expect(near.size).toBe(40);
    expect(near.get('loja-0')).toEqual({ online: 1, free: 1 });
    expect(near.get('loja-1')).toEqual({ online: 0, free: 0 });
  });
});
