/**
 * D3b-2a · P1.5 — loja pausada pelo admin some de toda a vitrine (cotação, perto de mim, ofertas,
 * busca, listas, destaques, mais vendidos, produtos, sacola, página pública, comprar de novo), não
 * recebe pedido novo (409 STORE_ADMIN_PAUSED nos dois modos) e o lojista não reabre por nenhuma
 * rota. Pedido em andamento segue. Um teste por ponto da tabela da Task 1.5.
 */
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { getRoute } from '../services/routeService';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { isStoreCurrentlyOpen } from '../utils/storeHours';
import { isStoreOpenNow, isStoreOpenWithHoursNow } from '../utils/storeOpen';
import { estimateQuote } from '../services/deliveryQuote/quote';
import { getDeliveryConfig } from '../services/deliveryQuote/config';

const DOMAIN = '@d3b2ap15.test';
// Macapá (AP): coordenada exclusiva desta suíte.
const LAT = 0.0349;
const LNG = -51.0694;
const MOTIVO = 'Denúncia em análise pelo DROP';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let ceo: TestUser;
let cliente: TestUser;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  (env as any).PAYMENT_GATEWAY = 'none';
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 1, durationSeconds: 300, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: orderIds } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

/** Loja verificada, Plano 3 com banner, na coordenada da suíte, com um produto em oferta (90%). */
async function loja(paused: boolean, extra: Record<string, unknown> = {}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: `Açaí Pausa Admin ${tag}`, isOpen: true, isVerified: true, plan: 3,
      featuredBannerUrl: 'https://res.cloudinary.com/drop/banner-p15.png',
      latitude: String(LAT), longitude: String(LNG),
      ...(paused ? { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: MOTIVO } : {}),
      ...extra,
    } as any,
  });
  const product = await prisma.product.create({
    data: { storeId: store.id, name: `Tigela ${tag}`, price: 10, oldPrice: 100, quantity: 1000 } as any,
  });
  return { dono, store, product };
}

/** Três vendas entregues hoje: entram nos "mais vendidos" de lojas e de produtos. */
async function vendas(storeId: string, productId: string) {
  for (let i = 0; i < 3; i++) {
    await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId, totalValue: 2000, deliveryFee: 0, status: 'entregue', paymentStatus: 'paid',
        items: { create: [{ productId, quantity: 200, price: 10 }] },
      } as any,
    });
  }
}

const idsOf = (rows: any[]) => rows.map((r) => String(r._id ?? r.id ?? r.storeId));
const pedido = (storeId: string, productId: string) => ({
  storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
  address: 'Rua das Flores, 100 - Centro', latitude: LAT, longitude: LNG,
});

describe('A/B · vitrine pelo filtro de visibilidade', () => {
  it('quotes: a pausada fica fora da resposta, a outra vem', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const res = await request(app).post('/api/stores/quotes').send({ latitude: LAT, longitude: LNG, storeIds: [pausada.store.id, livre.store.id] });
    expect(res.status).toBe(200);
    expect((res.body.data as any[]).map((q) => q.storeId)).toEqual([livre.store.id]);
  });

  it('nearby: a pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const res = await request(app).get('/api/stores/nearby').query({ lat: LAT, lng: LNG, limit: 30 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body.data)).toContain(livre.store.id);
    expect(idsOf(res.body.data)).not.toContain(pausada.store.id);
  });

  it('offers: o produto da pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const res = await request(app).get('/api/products/offers').query({ lat: LAT, lng: LNG, limit: 20 });
    expect(res.status).toBe(200);
    const storeIds = (res.body.data as any[]).map((p) => p.storeId);
    expect(storeIds).toContain(livre.store.id);
    expect(storeIds).not.toContain(pausada.store.id);
  });

  it('busca: some em lojas (com e sem openNow) e em produtos', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const items = (res: request.Response) => (res.body.data.items as any[]).map((i) => String(i._id ?? i.id));
    const lojas = await request(app).get('/api/search').query({ type: 'stores', q: 'Açaí Pausa Admin', limit: 40 });
    expect(lojas.status).toBe(200);
    expect(items(lojas)).toContain(livre.store.id);
    expect(items(lojas)).not.toContain(pausada.store.id);
    const abertas = await request(app).get('/api/search').query({ type: 'stores', q: 'Açaí Pausa Admin', lat: LAT, lng: LNG, openNow: '1', limit: 40 });
    expect(items(abertas)).not.toContain(pausada.store.id);
    const produtos = await request(app).get('/api/search').query({ type: 'products', q: pausada.product.name, limit: 40 });
    expect(produtos.status).toBe(200);
    expect(items(produtos)).not.toContain(pausada.product.id);
    const produtoLivre = await request(app).get('/api/search').query({ type: 'products', q: livre.product.name, limit: 40 });
    expect(items(produtoLivre)).toContain(livre.product.id);
  });

  it('reorder: a loja pausada fica indisponível no "comprar de novo"', async () => {
    const pausada = await loja(true);
    const antigo = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: pausada.store.id, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentStatus: 'paid',
        items: { create: [{ productId: pausada.product.id, quantity: 1, price: 10 }] },
      } as any,
    });
    const res = await request(app).get(`/api/orders/${antigo.id}/reorder`).set('Authorization', bearer(cliente));
    expect(res.status).toBe(200);
    expect(res.body.data.storeAvailable).toBe(false);
    expect(res.body.data.items[0]).toMatchObject({ available: false, reason: 'STORE_UNAVAILABLE' });
  });
});

describe('C · listas públicas, página da loja e produtos', () => {
  it('lista de lojas: a pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const res = await request(app).get('/api/stores');
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(livre.store.id);
    expect(idsOf(res.body)).not.toContain(pausada.store.id);
  });

  it('destaques: a pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const res = await request(app).get('/api/stores/featured');
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(livre.store.id);
    expect(idsOf(res.body)).not.toContain(pausada.store.id);
  });

  it('mais vendidos da loja: a pausada não mostra nada', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    await vendas(pausada.store.id, pausada.product.id);
    await vendas(livre.store.id, livre.product.id);
    const fora = await request(app).get(`/api/stores/${pausada.store.id}/top-products`);
    expect(fora.status).toBe(200);
    expect(fora.body).toEqual({ products: [] });
    const dentro = await request(app).get(`/api/stores/${livre.store.id}/top-products`);
    expect(dentro.body.products).toHaveLength(1);
  });

  it('lojas mais vendidas: a pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    await vendas(pausada.store.id, pausada.product.id);
    await vendas(livre.store.id, livre.product.id);
    const res = await request(app).get('/api/stores/top').query({ limit: 100 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(livre.store.id);
    expect(idsOf(res.body)).not.toContain(pausada.store.id);
  });

  it('produtos mais vendidos: o da pausada some', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    await vendas(pausada.store.id, pausada.product.id);
    await vendas(livre.store.id, livre.product.id);
    const res = await request(app).get('/api/products/top').query({ limit: 100 });
    expect(res.status).toBe(200);
    const storeIds = (res.body as any[]).map((p) => p.storeId);
    expect(storeIds).toContain(livre.store.id);
    expect(storeIds).not.toContain(pausada.store.id);
  });

  it('página pública: 404 STORE_UNAVAILABLE com nome e bairro, sem o motivo', async () => {
    const pausada = await loja(true, { neighborhood: 'Centro', city: 'Macapá' });
    const res = await request(app).get(`/api/stores/${pausada.store.id}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('STORE_UNAVAILABLE');
    expect(res.body.store).toEqual({
      _id: pausada.store.id, id: pausada.store.id, name: pausada.store.name, neighborhood: 'Centro', city: 'Macapá',
    });
    expect(JSON.stringify(res.body)).not.toContain(MOTIVO);
    const livre = await loja(false);
    expect((await request(app).get(`/api/stores/${livre.store.id}`)).status).toBe(200);
  });

  it('produtos e sacola: ?storeId e ?ids= não trazem nada da pausada', async () => {
    const pausada = await loja(true);
    const livre = await loja(false);
    const porLoja = await request(app).get('/api/products').query({ storeId: pausada.store.id });
    expect(porLoja.status).toBe(200);
    expect(porLoja.body.products).toEqual([]);
    const sacola = await request(app).get('/api/products').query({ ids: `${pausada.product.id},${livre.product.id}` });
    expect(sacola.status).toBe(200);
    expect(idsOf(sacola.body.products)).toEqual([livre.product.id]);
  });

  it('produto por id: 404 para o público; o dono continua vendo', async () => {
    const pausada = await loja(true);
    expect((await request(app).get(`/api/products/${pausada.product.id}`)).status).toBe(404);
    const dono = await request(app).get(`/api/products/${pausada.product.id}`).set('Authorization', bearer(pausada.dono));
    expect(dono.status).toBe(200);
    expect(dono.body._id).toBe(pausada.product.id);
  });
});

describe('D · pedido', () => {
  it('pedido custódia: 409 STORE_ADMIN_PAUSED, sem baixar estoque nem criar pedido', async () => {
    const pausada = await loja(true);
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(pausada.store.id, pausada.product.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Esta loja está indisponível no momento.', code: 'STORE_ADMIN_PAUSED' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pausada.product.id } })).quantity).toBe(1000);
    expect(await prisma.order.count({ where: { storeId: pausada.store.id } })).toBe(0);
  });

  it('pedido direto: 409 STORE_ADMIN_PAUSED, mesmo se a loja também estiver pausada pelo lojista', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const pausada = await loja(true, { pausedUntil: new Date(Date.now() + 60 * 60_000) });
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(pausada.store.id, pausada.product.id));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_ADMIN_PAUSED');
    expect(await prisma.order.count({ where: { storeId: pausada.store.id } })).toBe(0);
  });

  it('pedido em andamento: a loja pausada pelo admin ainda aceita o pedido que já existia e ele chega à entrega', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({
      data: {
        ownerId: dono.userId, name: 'Loja em andamento', plan: 1, isOpen: true, latitude: '-22.90', longitude: '-43.20',
        adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: MOTIVO,
      } as any,
    });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
        subtotal: 20, totalValue: 20, deliveryFee: 0, deliveryDistance: 3, status: 'criado', paymentMethod: 'pix',
        paymentStatus: 'paid', asaasChargeStatus: 'received', paymentProvider: 'asaas',
      } as any,
    });
    const res = await request(app).post(`/api/orders/${order.id}/accept`).set('Authorization', bearer(dono)).send({});
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pago');
    // Plano 1: o cliente confirma o recebimento com a loja ainda pausada.
    const entregue = await request(app).post(`/api/orders/${order.id}/deliver`).set('Authorization', bearer(cliente)).send({});
    expect(entregue.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('entregue');
  });

  it('pedido em andamento com motoboy: a entrega de loja pausada pelo admin fecha pelo PIN', async () => {
    const pausada = await loja(true);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: pausada.store.id, totalValue: 30, deliveryFee: 10, status: 'pago',
        paymentMethod: 'pix', paymentStatus: 'paid',
        items: { create: [{ productId: pausada.product.id, quantity: 1, price: 20 }] },
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, status: 'picked', motoboyId: motoboy.userId, fee: 10, distance: 4, pin: '12345', pinRetirada: '54321' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
    const res = await request(app).post(`/api/deliveries/${delivery.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: '12345' });
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('entregue');
  });
});

describe('E · funções puras de "aberta agora"', () => {
  it('isStoreCurrentlyOpen, isStoreOpenNow e isStoreOpenWithHoursNow: pausada pelo admin = fechada, até com override', () => {
    const later = new Date(Date.now() + 60 * 60_000);
    expect(isStoreCurrentlyOpen({ isOpen: true })).toBe(true);
    expect(isStoreCurrentlyOpen({ isOpen: true, adminPausedAt: new Date() })).toBe(false);
    expect(isStoreCurrentlyOpen({ isOpen: true, openOverrideUntil: later, adminPausedAt: new Date() })).toBe(false);
    expect(isStoreOpenNow({ isOpen: true })).toBe(true);
    expect(isStoreOpenNow({ isOpen: true, adminPausedAt: new Date() })).toBe(false);
    expect(isStoreOpenWithHoursNow({ isOpen: true, adminPausedAt: new Date() })).toBe(false);
  });

  it('cotação pura: pausada pelo admin vem fechada e sem hora de volta', async () => {
    const cfg = await getDeliveryConfig();
    const base = { id: 'loja-pura', latitude: String(LAT), longitude: String(LNG), isOpen: true };
    expect(estimateQuote(base, { lat: LAT, lng: LNG }, cfg).open).toBe(true);
    const q = estimateQuote({ ...base, adminPausedAt: new Date() }, { lat: LAT, lng: LNG }, cfg);
    expect(q.open).toBe(false);
    expect(q.opensAt).toBeUndefined();
  });
});

describe('F · o lojista não reabre', () => {
  const putHours = (dono: TestUser, id: string, body: Record<string, unknown>) =>
    request(app).put(`/api/stores/${id}/operating-hours`).set('Authorization', bearer(dono)).send(body);

  it('lojista abre (inclusive fora do horário): 409 STORE_ADMIN_PAUSED e nada muda', async () => {
    const pausada = await loja(true, { isOpen: false });
    const res = await putHours(pausada.dono, pausada.store.id, { isOpen: true });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Sua loja está pausada pelo DROP. Fale com o suporte.', code: 'STORE_ADMIN_PAUSED', reason: MOTIVO });
    const saved = await prisma.store.findUniqueOrThrow({ where: { id: pausada.store.id } });
    expect(saved.isOpen).toBe(false);
    expect(saved.openOverrideUntil).toBeNull();
  });

  it('fechar e mexer só no horário continuam valendo', async () => {
    const pausada = await loja(true);
    expect((await putHours(pausada.dono, pausada.store.id, { isOpen: false })).status).toBe(200);
    const hours = { monday: { open: '09:00', close: '18:00' } };
    const res = await putHours(pausada.dono, pausada.store.id, { operatingHours: hours });
    expect(res.status).toBe(200);
    expect(res.body.store.operatingHours).toEqual(hours);
  });

  it('lojista pausa: 409 STORE_ADMIN_PAUSED e pausedUntil fica nulo', async () => {
    const pausada = await loja(true);
    const res = await request(app).put(`/api/stores/${pausada.store.id}/pause`).set('Authorization', bearer(pausada.dono)).send({ minutes: 30 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'Sua loja está pausada pelo DROP. Fale com o suporte.', statusCode: 409, code: 'STORE_ADMIN_PAUSED', reason: MOTIVO },
    });
    expect((await prisma.store.findUniqueOrThrow({ where: { id: pausada.store.id } })).pausedUntil).toBeNull();
  });

  it('lojista despausa: 409 STORE_ADMIN_PAUSED e a pausa dele fica como estava', async () => {
    const until = new Date(Date.now() + 60 * 60_000);
    const pausada = await loja(true, { pausedUntil: until });
    const res = await request(app).delete(`/api/stores/${pausada.store.id}/pause`).set('Authorization', bearer(pausada.dono));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'STORE_ADMIN_PAUSED', reason: MOTIVO });
    expect((await prisma.store.findUniqueOrThrow({ where: { id: pausada.store.id } })).pausedUntil?.getTime()).toBe(until.getTime());
  });

  /** A leitura do controller vê a loja ainda livre; no banco o admin já pausou (a escrita perde a corrida). */
  const lerComoLivre = async (storeId: string) => {
    const real = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    return jest.spyOn(prisma.store, 'findUnique')
      .mockResolvedValueOnce({ ...real, adminPausedAt: null, adminPausedBy: null, adminPauseReason: null } as any);
  };

  it('corrida no horário (determinística): o WHERE barra a abertura e o motivo vem da releitura', async () => {
    const pausada = await loja(true, { isOpen: false });
    const spy = await lerComoLivre(pausada.store.id);
    try {
      const res = await putHours(pausada.dono, pausada.store.id, { isOpen: true });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Sua loja está pausada pelo DROP. Fale com o suporte.', code: 'STORE_ADMIN_PAUSED', reason: MOTIVO });
    } finally {
      spy.mockRestore();
    }
    const saved = await prisma.store.findUniqueOrThrow({ where: { id: pausada.store.id } });
    expect(saved.isOpen).toBe(false);
    expect(saved.openOverrideUntil).toBeNull();
  });

  it('corrida na pausa e na despausa (determinística): o WHERE barra a escrita e o motivo vem da releitura', async () => {
    const until = new Date(Date.now() + 60 * 60_000);
    const pausada = await loja(true, { pausedUntil: until });
    const corpo = {
      success: false,
      error: { message: 'Sua loja está pausada pelo DROP. Fale com o suporte.', statusCode: 409, code: 'STORE_ADMIN_PAUSED', reason: MOTIVO },
    };
    let spy = await lerComoLivre(pausada.store.id);
    try {
      const res = await request(app).put(`/api/stores/${pausada.store.id}/pause`).set('Authorization', bearer(pausada.dono)).send({ minutes: 30 });
      expect(res.status).toBe(409);
      expect(res.body).toEqual(corpo);
    } finally {
      spy.mockRestore();
    }
    spy = await lerComoLivre(pausada.store.id);
    try {
      const res = await request(app).delete(`/api/stores/${pausada.store.id}/pause`).set('Authorization', bearer(pausada.dono));
      expect(res.status).toBe(409);
      expect(res.body).toEqual(corpo);
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.store.findUniqueOrThrow({ where: { id: pausada.store.id } })).pausedUntil?.getTime()).toBe(until.getTime());
  });

  it('corrida: admin pausa enquanto o lojista abre; a pausa sempre vale e o lojista não abre depois', async () => {
    const livre = await loja(false, { isOpen: false });
    const [admin, lojista] = await Promise.all([
      request(app).post(`/api/admin/stores/${livre.store.id}/pause`).set('Authorization', bearer(ceo)).send({ reason: MOTIVO }),
      putHours(livre.dono, livre.store.id, { isOpen: true }),
    ]);
    expect(admin.status).toBe(200);
    expect([200, 409]).toContain(lojista.status);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: livre.store.id } })).adminPausedAt).not.toBeNull();
    expect((await putHours(livre.dono, livre.store.id, { isOpen: true })).status).toBe(409);
    expect((await request(app).get(`/api/stores/${livre.store.id}`)).body.code).toBe('STORE_UNAVAILABLE');
  });
});

describe('G · painel do lojista', () => {
  it('o dono vê a pausa e o motivo, não quem pausou', async () => {
    const pausada = await loja(true);
    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(pausada.dono));
    expect(res.status).toBe(200);
    expect(res.body.store.adminPauseReason).toBe(MOTIVO);
    expect(typeof res.body.store.adminPausedAt).toBe('string');
    expect(res.body.store).not.toHaveProperty('adminPausedBy');
  });
});
