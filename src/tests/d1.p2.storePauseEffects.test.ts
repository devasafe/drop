/**
 * D1 · P2.6 — loja pausada é tratada como fechada: GET público (isOpenNow), cotação da vitrine
 * (open=false com a hora da volta), busca "aberta agora" e checkout (409 STORE_PAUSED nos dois modos).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1pausefx.test';
// Porto Velho (RO): coordenada exclusiva desta suíte.
const LAT = -8.7612;
const LNG = -63.9039;
const spHHMM = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const inOneHour = () => new Date(Date.now() + 60 * 60_000);

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function cenario(pausedUntil: Date | null, extra: Record<string, unknown> = {}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: `Quiosque Pausa ${tag}`, isOpen: true, isVerified: true,
      latitude: String(LAT), longitude: String(LNG), pausedUntil, ...extra,
    } as any,
  });
  const prod = await prisma.product.create({ data: { storeId: store.id, name: `Tapioca ${tag}`, price: 20, quantity: 10 } });
  return { dono, cliente, store, prod };
}

const pedido = (storeId: string, productId: string) => ({
  storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua das Flores, 100 - Centro',
});

describe('GET /stores/:id — isOpenNow e campos novos', () => {
  it('sem pausa: aberta; logoUrl, tagline e pausedUntil vêm nulos', async () => {
    const c = await cenario(null);
    const res = await request(app).get(`/api/stores/${c.store.id}`);
    expect(res.status).toBe(200);
    expect(res.body.isOpenNow).toBe(true);
    expect(res.body).toHaveProperty('pausedUntil', null);
    expect(res.body).toHaveProperty('logoUrl', null);
    expect(res.body).toHaveProperty('tagline', null);
  });

  it('pausada: isOpenNow false e pausedUntil com a hora da volta', async () => {
    const until = inOneHour();
    const c = await cenario(until);
    const res = await request(app).get(`/api/stores/${c.store.id}`);
    expect(res.status).toBe(200);
    expect(res.body.isOpenNow).toBe(false);
    expect(res.body.pausedUntil).toBe(until.toISOString());
  });

  it('pausa vencida: aberta de novo, sem job', async () => {
    const c = await cenario(new Date(Date.now() - 60_000));
    expect((await request(app).get(`/api/stores/${c.store.id}`)).body.isOpenNow).toBe(true);
  });

  it('toggle desligado: isOpenNow false mesmo sem pausa', async () => {
    const c = await cenario(null, { isOpen: false });
    expect((await request(app).get(`/api/stores/${c.store.id}`)).body.isOpenNow).toBe(false);
  });
});

describe('vitrine — loja pausada = fechada', () => {
  it('POST /stores/quotes: pausada vem fechada com a hora da volta; a outra segue aberta', async () => {
    const until = inOneHour();
    const pausada = await cenario(until);
    const livre = await cenario(null);
    const res = await request(app).post('/api/stores/quotes').send({ latitude: LAT, longitude: LNG, storeIds: [pausada.store.id, livre.store.id] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body.data as any[]).map((q) => [q.storeId, q]));
    expect(byId.get(pausada.store.id)).toMatchObject({ open: false, opensAt: spHHMM(until) });
    expect(byId.get(livre.store.id)).toMatchObject({ open: true });
  });

  it('GET /stores/nearby: a pausada vem com quote.open false', async () => {
    const c = await cenario(inOneHour());
    const res = await request(app).get('/api/stores/nearby').query({ lat: LAT, lng: LNG, limit: 30 });
    expect(res.status).toBe(200);
    const mine = (res.body.data as any[]).find((s) => s._id === c.store.id);
    expect(mine).toBeDefined();
    expect(mine.quote.open).toBe(false);
  });

  it('busca com openNow=1 tira a loja pausada; sem openNow ela aparece', async () => {
    const c = await cenario(inOneHour());
    const ids = (res: request.Response) => (res.body.data.items as any[]).map((i) => i._id ?? i.id);
    const aberta = await request(app).get('/api/search').query({ type: 'stores', q: c.store.name, lat: LAT, lng: LNG, openNow: '1', limit: 40 });
    expect(aberta.status).toBe(200);
    expect(ids(aberta)).not.toContain(c.store.id);
    const todas = await request(app).get('/api/search').query({ type: 'stores', q: c.store.name, limit: 40 });
    expect(ids(todas)).toContain(c.store.id);
  });
});

describe('checkout — 409 STORE_PAUSED', () => {
  it('custódia: recusa e não baixa estoque', async () => {
    const c = await cenario(inOneHour());
    const res = await request(app).post('/api/orders').set('Authorization', bearer(c.cliente)).send(pedido(c.store.id, c.prod.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_PAUSED');
    expect((await prisma.product.findUnique({ where: { id: c.prod.id } }))?.quantity).toBe(10);
    expect(await prisma.order.count({ where: { storeId: c.store.id } })).toBe(0);
  });

  it('direto: recusa e não baixa estoque', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const c = await cenario(inOneHour());
    const res = await request(app).post('/api/orders').set('Authorization', bearer(c.cliente)).send(pedido(c.store.id, c.prod.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_PAUSED');
    expect((await prisma.product.findUnique({ where: { id: c.prod.id } }))?.quantity).toBe(10);
  });
});
