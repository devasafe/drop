/**
 * Task 6 (DS v2) — ofertas com desconto real e lojas próximas.
 *  - GET /api/products/offers: oldPrice > price, ordem por desconto %, raio efetivo, KYC e mensalidade.
 *  - GET /api/stores/nearby: todos os planos, só quem cobre o ponto, por distância, com quote.
 *  - As duas rotas fixas vêm ANTES de /:id e /:idOrSlug.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@catalog6.test';
const ORIGINAL_KYC = process.env.KYC_ENFORCED;

// ~1 grau de latitude = 111,19 km.
const LAT = -22.9;
const LNG = -43.2;
const north = (km: number) => String(LAT + km / 111.19);

let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  if (ORIGINAL_KYC === undefined) delete process.env.KYC_ENFORCED;
  else process.env.KYC_ENFORCED = ORIGINAL_KYC;
});
beforeEach(async () => {
  process.env.KYC_ENFORCED = 'true';
  await updatePlatformConfig({ settlementMode: 'direto', defaultDeliveryRadiusKm: 12 } as any, 'test');
});
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function makeStore(data: Record<string, unknown> = {}) {
  return prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(DOMAIN), name: 'Loja T6', isOpen: true, isVerified: true,
      latitude: String(LAT), longitude: String(LNG), ...data,
    } as any,
  });
}
const makeProduct = (storeId: string, name: string, price: number, oldPrice?: number) =>
  prisma.product.create({ data: { storeId, name, price, oldPrice, quantity: 5 } as any });

const offers = (qs: Record<string, string | number> = {}) => request(app).get('/api/products/offers').query(qs);
const nearby = (qs: Record<string, string | number> = {}) => request(app).get('/api/stores/nearby').query(qs);
const ids = (res: request.Response) => (res.body.data as any[]).map((i) => i.id);

describe('GET /api/products/offers', () => {
  it('só produto com desconto real, do maior % para o menor, no formato esperado', async () => {
    const store = await makeStore({ name: 'Loja Ofertas T6' });
    const d20 = await makeProduct(store.id, 'D20', 80, 100);
    const d50 = await makeProduct(store.id, 'D50', 50, 100);
    const igual = await makeProduct(store.id, 'Igual', 100, 100);
    const maior = await makeProduct(store.id, 'Preco maior', 120, 100);
    const sem = await makeProduct(store.id, 'Sem old', 10);

    const res = await offers({ limit: 20 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const mine = ids(res).filter((id) => [d20, d50, igual, maior, sem].some((p) => p.id === id));
    expect(mine).toEqual([d50.id, d20.id]);
    const item = res.body.data.find((i: any) => i.id === d50.id);
    expect(item._id).toBe(d50.id);
    expect(item.price).toBe(50);
    expect(item.storeName).toBe('Loja Ofertas T6');
    expect(item.discountPercent).toBe(50);
  });

  it('respeita limit e o teto de 20', async () => {
    const store = await makeStore();
    await makeProduct(store.id, 'A', 10, 20);
    await makeProduct(store.id, 'B', 10, 30);
    expect((await offers({ limit: 1 })).body.data).toHaveLength(1);
    expect((await offers({ limit: 21 })).status).toBe(400);
  });

  it('com ponto, exclui loja cujo raio não cobre (e a sem coordenadas)', async () => {
    const perto = await makeStore({ latitude: north(2) });
    const longe = await makeStore({ latitude: north(20) });
    const pequeno = await makeStore({ latitude: north(6), deliveryRadiusKm: 3 });
    const semCoord = await makeStore({ latitude: null, longitude: null });
    const pp = await makeProduct(perto.id, 'perto', 5, 10);
    const pl = await makeProduct(longe.id, 'longe', 5, 10);
    const ps = await makeProduct(pequeno.id, 'pequeno', 5, 10);
    const pc = await makeProduct(semCoord.id, 'semcoord', 5, 10);

    const res = await offers({ lat: LAT, lng: LNG, limit: 20 });
    expect(res.status).toBe(200);
    const got = ids(res);
    expect(got).toContain(pp.id);
    for (const p of [pl, ps, pc]) expect(got).not.toContain(p.id);
    // sem ponto, todas aparecem
    const all = ids(await offers({ limit: 20 }));
    for (const p of [pp, pl, ps, pc]) expect(all).toContain(p.id);
  });

  it('KYC e mensalidade: loja não verificada ou pausada (modo direto) não aparece', async () => {
    const ok = await makeStore();
    const naoVerificada = await makeStore({ isVerified: false });
    const pausada = await makeStore();
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const po = await makeProduct(ok.id, 'ok', 5, 10);
    const pn = await makeProduct(naoVerificada.id, 'nv', 5, 10);
    const pp = await makeProduct(pausada.id, 'pausada', 5, 10);

    const got = ids(await offers({ limit: 20 }));
    expect(got).toContain(po.id);
    expect(got).not.toContain(pn.id);
    expect(got).not.toContain(pp.id);

    // KYC desligado: a não verificada aparece (a pausada continua fora)
    process.env.KYC_ENFORCED = 'false';
    const relaxed = ids(await offers({ limit: 20 }));
    expect(relaxed).toContain(pn.id);
    expect(relaxed).not.toContain(pp.id);
  });

  it('lat sem lng ou valor inválido/fora dos limites = 400', async () => {
    expect((await offers({ lat: LAT })).status).toBe(400);
    expect((await offers({ lat: 91, lng: 0 })).status).toBe(400);
    expect((await offers({ lat: 'abc', lng: 0 })).status).toBe(400);
    expect((await offers({ lat: 'Infinity', lng: 0 })).status).toBe(400);
  });

  it('/products/offers não é lido como /products/:id', async () => {
    const res = await offers();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/stores/nearby', () => {
  it('inclui planos 1, 2 e 3 (custódia), exclui fora do raio e sem coordenadas, ordena por distância', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const p3 = await makeStore({ name: 'P3', latitude: north(9) });
    const p1 = await makeStore({ name: 'P1', latitude: north(1) });
    const p2 = await makeStore({ name: 'P2', latitude: north(4) });
    const fora = await makeStore({ name: 'Fora', latitude: north(30) });
    const semCoord = await makeStore({ name: 'SemCoord', latitude: null, longitude: null });
    const lixo = await makeStore({ name: 'Lixo', latitude: 'abc' });
    for (const [s, plan] of [[p1, 'plan1'], [p2, 'plan2'], [p3, 'plan3']] as const) {
      await prisma.storeSubscription.create({ data: { storeId: s.id, storeName: s.name, currentPlan: plan } as any });
    }

    const res = await nearby({ lat: LAT, lng: LNG, limit: 30 });
    expect(res.status).toBe(200);
    const mine = ids(res).filter((id) => [p1, p2, p3, fora, semCoord, lixo].some((s) => s.id === id));
    expect(mine).toEqual([p1.id, p2.id, p3.id]);

    const byId = new Map<string, any>((res.body.data as any[]).map((s) => [s.id, s]));
    expect(byId.get(p1.id).quote.inArea).toBe(true);
    expect(byId.get(p1.id).quote.fee).toBe(0); // Plano 1 na custódia
    expect(byId.get(p2.id).quote.fee).toBeGreaterThan(0);
    expect(byId.get(p3.id).quote.storeId).toBe(p3.id);
    expect(byId.get(p1.id)._id).toBe(p1.id);
    expect(byId.get(p1.id).name).toBe('P1');
  });

  it('coordenada malformada ("-22,9") não derruba a listagem: só essa loja é ignorada', async () => {
    const a = await makeStore({ latitude: north(1) });
    const b = await makeStore({ latitude: north(2) });
    const virgula = await makeStore({ latitude: '-22,9' });
    const res = await nearby({ lat: LAT, lng: LNG, limit: 30 });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(ids(res)).not.toContain(virgula.id);
  });

  it('loja com raio próprio menor não aparece além dele', async () => {
    const pequeno = await makeStore({ latitude: north(6), deliveryRadiusKm: 3 });
    const normal = await makeStore({ latitude: north(6) });
    const got = ids(await nearby({ lat: LAT, lng: LNG, limit: 30 }));
    expect(got).toContain(normal.id);
    expect(got).not.toContain(pequeno.id);
  });

  it('respeita limit, KYC e mensalidade, e o teto de 30', async () => {
    const a = await makeStore({ latitude: north(1) });
    const b = await makeStore({ latitude: north(2) });
    const nv = await makeStore({ latitude: north(0.5), isVerified: false });
    const pausada = await makeStore({ latitude: north(0.6) });
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 30 * 86400000), status: 'paused', pausedAt: new Date() } as any,
    });
    const got = ids(await nearby({ lat: LAT, lng: LNG, limit: 30 }));
    expect(got).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(got).not.toContain(nv.id);
    expect(got).not.toContain(pausada.id);
    expect((await nearby({ lat: LAT, lng: LNG, limit: 1 })).body.data).toHaveLength(1);
    expect((await nearby({ lat: LAT, lng: LNG, limit: 31 })).status).toBe(400);
  });

  it('sem lat/lng ou inválido = 400', async () => {
    expect((await nearby()).status).toBe(400);
    expect((await nearby({ lat: LAT })).status).toBe(400);
    expect((await nearby({ lat: 95, lng: 0 })).status).toBe(400);
    expect((await nearby({ lat: 'NaN', lng: 0 })).status).toBe(400);
  });

  it('/stores/nearby não é lido como /stores/:idOrSlug', async () => {
    const res = await nearby({ lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
