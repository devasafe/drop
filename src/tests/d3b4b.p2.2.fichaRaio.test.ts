/**
 * D3b-4b · P2.2 — GET /admin/stores/:id traz nearbyCouriers e nearbyRadiusKm (spec 7.2): N online e M livres a até
 * DISPATCH_MAX_KM; loja sem coordenada → null, e a ficha continua inteira (Review Focus 1).
 */
import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cleanupOpsFixtures, createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { DISPATCH_MAX_KM } from '../services/dispatch';

const DOMAIN = '@d3b4bp22.test';
const MARK = 'd3b4bp22';
let ceo: TestUser;
let customerId: string;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  customerId = (await createTestUser('cliente', DOMAIN)).userId;
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const detail = (id: string) => request(app).get(`/api/admin/stores/${id}`).set('Authorization', bearer(ceo));

/** Motoboy online, com posição agora, longe das outras suítes (perto de 1°, 1°). */
async function motoboyAt(lat: number, lng: number): Promise<string> {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({
    where: { id: m.userId },
    data: { isOnline: true, currentLocation: { lat, lng, updatedAt: new Date().toISOString() } as Prisma.InputJsonValue },
  });
  return m.userId;
}

describe('GET /admin/stores/:id · motoboys por perto', () => {
  it('loja com ponto: online e livres no raio do despacho; o raio é DISPATCH_MAX_KM', async () => {
    const storeId = await createOpsStore(DOMAIN, { name: 'Loja Ficha Raio', latitude: '1', longitude: '1' });
    await motoboyAt(1.01, 1);
    const ocupado = await motoboyAt(1.02, 1);
    await motoboyAt(1.5, 1); // ~55 km: fora do raio
    const now = new Date();
    await createOpsOrder({
      customerId, storeId, status: 'aguardando_motoboy', acceptedAt: now,
      delivery: { status: 'assigned', motoboyId: ocupado, assignedAt: now },
    });

    const res = await detail(storeId);
    expect(res.status).toBe(200);
    expect(res.body.nearbyCouriers).toEqual({ online: 2, free: 1 });
    expect(res.body.nearbyRadiusKm).toBe(DISPATCH_MAX_KM);
  });

  it('loja sem ponto no mapa: nearbyCouriers null, e o resto da ficha vem', async () => {
    const storeId = await createOpsStore(DOMAIN, { name: 'Loja Ficha Sem Ponto' });
    await motoboyAt(1.01, 1);

    const res = await detail(storeId);
    expect(res.status).toBe(200);
    expect(res.body.nearbyCouriers).toBeNull();
    expect(res.body.nearbyRadiusKm).toBe(DISPATCH_MAX_KM);
    expect(res.body.profile.id).toBe(storeId);
    expect(res.body.stats30d).toEqual({ orders: 0, cancelledByStore: 0, rating: null });
  });
});
