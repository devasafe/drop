import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { getDeliveryConfig, effectiveRadiusKm, effectivePrepMinutes } from '../services/deliveryQuote/config';

const DOMAIN = '@dq1.test';
let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

describe('deliveryQuote t1 — raio e preparo (config da plataforma)', () => {
  it('CEO grava os 4 campos, GET devolve e getDeliveryConfig reflete', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ defaultDeliveryRadiusKm: 8, defaultPrepMinutes: 20, courierAvgSpeedKmh: 30, routeDetourFactor: 1.5 });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/admin/switches').set('Authorization', bearer(ceo));
    expect(get.body).toMatchObject({ defaultDeliveryRadiusKm: 8, defaultPrepMinutes: 20, courierAvgSpeedKmh: 30, routeDetourFactor: 1.5 });
    expect(await getDeliveryConfig()).toMatchObject({
      defaultRadiusKm: 8, defaultPrepMinutes: 20, avgSpeedKmh: 30, detourFactor: 1.5,
    });
  });

  it('getDeliveryConfig traz base e perKm da taxa de entrega', async () => {
    const cfg = await getDeliveryConfig();
    expect(typeof cfg.base).toBe('number');
    expect(typeof cfg.perKm).toBe('number');
  });

  it('não-CEO com settings:manage recebe 403 CEO_ONLY', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: 'gerente_geral' },
      create: { role: 'gerente_geral', permissions: ['settings:manage'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['settings:manage'] },
    });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    for (const body of [{ defaultDeliveryRadiusKm: 10 }, { defaultPrepMinutes: 10 }, { courierAvgSpeedKmh: 20 }, { routeDetourFactor: 1.2 }]) {
      const r = await request(app).put('/api/admin/switches').set('Authorization', bearer(gerente)).send(body);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('CEO_ONLY');
    }
  });

  it('faixas inválidas → 400', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const bad = [
      { defaultDeliveryRadiusKm: 0.5 }, { defaultDeliveryRadiusKm: 51 },
      { defaultPrepMinutes: -1 }, { defaultPrepMinutes: 181 }, { defaultPrepMinutes: 1.5 },
      { courierAvgSpeedKmh: 4 }, { courierAvgSpeedKmh: 81 },
      { routeDetourFactor: 0.9 }, { routeDetourFactor: 3.1 },
    ];
    for (const body of bad) {
      const r = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send(body);
      expect(r.status).toBe(400);
    }
  });

  it('limites das faixas são aceitos', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const r = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ defaultDeliveryRadiusKm: 1, defaultPrepMinutes: 0, courierAvgSpeedKmh: 80, routeDetourFactor: 3 });
    expect(r.status).toBe(200);
    const r2 = await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo))
      .send({ defaultDeliveryRadiusKm: 50, defaultPrepMinutes: 180, courierAvgSpeedKmh: 5, routeDetourFactor: 1 });
    expect(r2.status).toBe(200);
  });
});

describe('deliveryQuote t1 — raio e preparo por loja', () => {
  async function setup() {
    const ceo = await createTestUser('ceo', DOMAIN);
    await request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send({ defaultDeliveryRadiusKm: 12, defaultPrepMinutes: 15 });
    const owner = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja DQ1' } });
    return { owner, store };
  }

  it('dono grava raio (<= padrão) e preparo na própria loja', async () => {
    const { owner, store } = await setup();
    const r = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(owner))
      .send({ deliveryRadiusKm: 5.5, prepMinutes: 25 });
    expect(r.status).toBe(200);
    const db = await prisma.store.findUnique({ where: { id: store.id } });
    expect(db?.deliveryRadiusKm).toBe(5.5);
    expect(db?.prepMinutes).toBe(25);
    expect(r.body).toMatchObject({ deliveryRadiusKm: 5.5, prepMinutes: 25 });
  });

  it('raio maior que o padrão da plataforma → 400 com mensagem clara', async () => {
    const { owner, store } = await setup();
    const r = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(owner)).send({ deliveryRadiusKm: 13 });
    expect(r.status).toBe(400);
    expect(String(r.body.error?.message ?? r.body.error)).toMatch(/12/);
    const db = await prisma.store.findUnique({ where: { id: store.id } });
    expect(db?.deliveryRadiusKm).toBeNull();
  });

  it('valores fora da faixa → 400; null volta ao padrão', async () => {
    const { owner, store } = await setup();
    for (const body of [{ prepMinutes: 181 }, { prepMinutes: -1 }, { prepMinutes: 2.5 }, { deliveryRadiusKm: 0 }, { deliveryRadiusKm: -3 }]) {
      const r = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(owner)).send(body);
      expect(r.status).toBe(400);
    }
    await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(owner)).send({ deliveryRadiusKm: 4, prepMinutes: 10 });
    const r = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(owner)).send({ deliveryRadiusKm: null, prepMinutes: null });
    expect(r.status).toBe(200);
    const db = await prisma.store.findUnique({ where: { id: store.id } });
    expect(db?.deliveryRadiusKm).toBeNull();
    expect(db?.prepMinutes).toBeNull();
  });

  it('outro lojista recebe 403', async () => {
    const { store } = await setup();
    const other = await createTestUser('lojista', DOMAIN);
    const r = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(other)).send({ deliveryRadiusKm: 3, prepMinutes: 10 });
    expect(r.status).toBe(403);
    const db = await prisma.store.findUnique({ where: { id: store.id } });
    expect(db?.deliveryRadiusKm).toBeNull();
  });
});

describe('deliveryQuote t1 — helpers efetivos', () => {
  const cfg = { defaultRadiusKm: 12, defaultPrepMinutes: 15, avgSpeedKmh: 25, detourFactor: 1.3, base: 5, perKm: 1 };

  it('effectiveRadiusKm: null → padrão; menor vale; nunca passa do padrão', () => {
    expect(effectiveRadiusKm({ deliveryRadiusKm: null }, cfg)).toBe(12);
    expect(effectiveRadiusKm({}, cfg)).toBe(12);
    expect(effectiveRadiusKm({ deliveryRadiusKm: 5 }, cfg)).toBe(5);
    // valor gravado antes de o padrão ser reduzido
    expect(effectiveRadiusKm({ deliveryRadiusKm: 20 }, cfg)).toBe(12);
    expect(effectiveRadiusKm({ deliveryRadiusKm: 20 }, { ...cfg, defaultRadiusKm: 8 })).toBe(8);
  });

  it('effectivePrepMinutes: null → padrão; valor da loja vale (inclusive 0)', () => {
    expect(effectivePrepMinutes({ prepMinutes: null }, cfg)).toBe(15);
    expect(effectivePrepMinutes({ prepMinutes: 30 }, cfg)).toBe(30);
    expect(effectivePrepMinutes({ prepMinutes: 0 }, cfg)).toBe(0);
  });
});
