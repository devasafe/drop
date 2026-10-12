/**
 * D1 · Product.isActive em TODOS os caminhos (spec seção 6, item 5).
 * Um produto pausado pela loja não aparece em nenhuma leitura pública e não pode ser comprado por
 * nenhum caminho; a visão do dono continua mostrando o pausado.
 *  - bloco 1 (P2.2): vitrine da loja, produto por id, busca, sugestões, ofertas, mais vendidos,
 *    "comprar de novo" (sacola);
 *  - bloco 2 (P2.3): checkout custódia, checkout direto, API de integração, export CSV, painel do dono.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { generateApiKey } from '../services/storeIntegration';

const DOMAIN = '@d1paths.test';
// Rio Branco (AC): coordenada exclusiva desta suíte, para a vitrine por ponto só achar estas lojas.
const LAT = -9.9711;
const LNG = -67.8249;

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

/**
 * Loja visível (verificada, Plano 3, com localização) com um produto PAUSADO e um ATIVO, os dois
 * em oferta (99% de desconto) e com vendas altas nos últimos 30 dias (entram em "mais vendidos").
 */
async function cenario() {
  const tag = Math.random().toString(36).slice(2, 8);
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: `Mercearia Pausa ${tag}`, isOpen: true, isVerified: true, plan: 3,
      latitude: String(LAT), longitude: String(LNG),
    },
  });
  const pausado = await prisma.product.create({
    data: { storeId: store.id, name: `Zarabatana Pausada ${tag}`, price: 1, oldPrice: 100, quantity: 50, isActive: false } as any,
  });
  const ativo = await prisma.product.create({
    data: { storeId: store.id, name: `Zarabatana Ativa ${tag}`, price: 1, oldPrice: 100, quantity: 50 },
  });
  const order = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 2, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid' },
  });
  await prisma.orderItem.create({ data: { orderId: order.id, productId: pausado.id, quantity: 100000, price: 1 } as any });
  await prisma.orderItem.create({ data: { orderId: order.id, productId: ativo.id, quantity: 90000, price: 1 } as any });
  return { tag, dono, cliente, store, pausado, ativo, order };
}

const idsOf = (list: any[]) => (list || []).map((p) => String(p._id ?? p.id));

describe('produto pausado — leituras públicas', () => {
  it('vitrine da loja (GET /products?storeId): só o ativo', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/products').query({ storeId: c.store.id, limit: 100 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body.products)).toContain(c.ativo.id);
    expect(idsOf(res.body.products)).not.toContain(c.pausado.id);
    expect(res.body.pagination.total).toBe(1);
  });

  it('produto por id: 404 para o público e para o cliente; o dono ainda abre', async () => {
    const c = await cenario();
    expect((await request(app).get(`/api/products/${c.pausado.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/products/${c.pausado.id}`).set('Authorization', bearer(c.cliente))).status).toBe(404);
    const dono = await request(app).get(`/api/products/${c.pausado.id}`).set('Authorization', bearer(c.dono));
    expect(dono.status).toBe(200);
    expect(dono.body.isActive).toBe(false);
    expect((await request(app).get(`/api/products/${c.ativo.id}`)).status).toBe(200);
  });

  it('busca (GET /search): o pausado não aparece; o ativo sim', async () => {
    const c = await cenario();
    const p = await request(app).get('/api/search').query({ q: c.pausado.name, limit: 40 });
    expect(p.status).toBe(200);
    expect(idsOf(p.body.data.items)).not.toContain(c.pausado.id);
    const a = await request(app).get('/api/search').query({ q: c.ativo.name, limit: 40 });
    expect(idsOf(a.body.data.items)).toContain(c.ativo.id);
  });

  it('sugestões (GET /search/suggest): o pausado não aparece', async () => {
    const c = await cenario();
    const p = await request(app).get('/api/search/suggest').query({ q: c.pausado.name });
    expect(p.status).toBe(200);
    expect(idsOf(p.body.data.products)).not.toContain(c.pausado.id);
    const a = await request(app).get('/api/search/suggest').query({ q: c.ativo.name });
    expect(idsOf(a.body.data.products)).toContain(c.ativo.id);
  });

  it('ofertas por ponto (GET /products/offers): só o ativo', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/products/offers').query({ lat: LAT, lng: LNG, limit: 20 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body.data)).toContain(c.ativo.id);
    expect(idsOf(res.body.data)).not.toContain(c.pausado.id);
  });

  it('mais vendidos da plataforma (GET /products/top): só o ativo', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/products/top').query({ limit: 100 });
    expect(res.status).toBe(200);
    expect(idsOf(res.body)).toContain(c.ativo.id);
    expect(idsOf(res.body)).not.toContain(c.pausado.id);
  });

  it('mais vendidos da loja (GET /stores/:id/top-products): só o ativo', async () => {
    const c = await cenario();
    const res = await request(app).get(`/api/stores/${c.store.id}/top-products`);
    expect(res.status).toBe(200);
    expect(idsOf(res.body.products)).toEqual([c.ativo.id]);
  });

  it('comprar de novo (GET /orders/:id/reorder): o pausado volta indisponível', async () => {
    const c = await cenario();
    const res = await request(app).get(`/api/orders/${c.order.id}/reorder`).set('Authorization', bearer(c.cliente));
    expect(res.status).toBe(200);
    const items = res.body.data.items as any[];
    const p = items.find((i) => i.productId === c.pausado.id);
    const a = items.find((i) => i.productId === c.ativo.id);
    expect(p).toMatchObject({ available: false, reason: 'OUT_OF_STOCK', quantity: 0 });
    expect(a).toMatchObject({ available: true, reason: null });
  });
});

describe('produto pausado — compra, integração e visão do dono', () => {
  const pedido = (storeId: string, productIds: string[]) => ({
    storeId,
    products: productIds.map((productId) => ({ productId, quantity: 1 })),
    paymentMethod: 'pix',
    deliveryDistanceKm: 0,
    address: 'Rua das Flores, 100 - Centro',
  });

  /** Coluna `column` da linha do produto num CSV simples (nomes de teste não têm vírgula). */
  function csvField(csv: string, productId: string, column: string): string | undefined {
    const lines = csv.replace(/^﻿/, '').split('\n');
    const header = lines[0].split(',');
    const row = lines.find((l) => l.startsWith(`${productId},`));
    return row?.split(',')[header.indexOf(column)];
  }

  it('checkout custódia: 409 PRODUCT_PAUSED com o nome, sem baixar estoque nem criar pedido', async () => {
    const c = await cenario();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(c.cliente)).send(pedido(c.store.id, [c.pausado.id]));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCT_PAUSED');
    expect(res.body.error).toContain(c.pausado.name);
    expect((await prisma.product.findUnique({ where: { id: c.pausado.id } }))?.quantity).toBe(50);
    expect(await prisma.order.count({ where: { storeId: c.store.id } })).toBe(1); // só o pedido antigo do cenário
  });

  it('checkout custódia, sacola mista: recusa antes de baixar o estoque do item ativo', async () => {
    const c = await cenario();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(c.cliente)).send(pedido(c.store.id, [c.ativo.id, c.pausado.id]));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCT_PAUSED');
    expect((await prisma.product.findUnique({ where: { id: c.ativo.id } }))?.quantity).toBe(50);
  });

  it('checkout direto: 409 PRODUCT_PAUSED', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const c = await cenario();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(c.cliente)).send(pedido(c.store.id, [c.pausado.id]));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCT_PAUSED');
    expect((await prisma.product.findUnique({ where: { id: c.pausado.id } }))?.quantity).toBe(50);
    expect(await prisma.order.count({ where: { storeId: c.store.id } })).toBe(1);
  });

  it('API de integração (JSON e CSV): o pausado sai indisponível, com active=false', async () => {
    const c = await cenario();
    const { key, prefix, keyHash } = generateApiKey();
    await prisma.storeApiKey.create({ data: { storeId: c.store.id, name: 'ERP teste', prefix, keyHash, scopes: ['read'] } });

    const json = await request(app).get('/api/integrations/v1/products').set('Authorization', `Bearer ${key}`);
    expect(json.status).toBe(200);
    const p = (json.body.products as any[]).find((r) => r.id === c.pausado.id);
    const a = (json.body.products as any[]).find((r) => r.id === c.ativo.id);
    expect(p).toMatchObject({ quantity: 50, available: false, active: false });
    expect(a).toMatchObject({ quantity: 50, available: true, active: true });

    const csv = await request(app).get('/api/integrations/v1/products').query({ format: 'csv' }).set('Authorization', `Bearer ${key}`);
    expect(csv.status).toBe(200);
    expect(csvField(csv.text, c.pausado.id, 'available')).toBe('false');
    expect(csvField(csv.text, c.pausado.id, 'active')).toBe('false');
    expect(csvField(csv.text, c.ativo.id, 'active')).toBe('true');
  });

  it('painel: export CSV e prévia em tabela mostram a coluna active', async () => {
    const c = await cenario();
    const csv = await request(app).get('/api/integrations/export/products.csv').set('Authorization', bearer(c.dono));
    expect(csv.status).toBe(200);
    expect(csvField(csv.text, c.pausado.id, 'active')).toBe('false');
    expect(csvField(csv.text, c.pausado.id, 'available')).toBe('false');

    const tabela = await request(app).get('/api/integrations/products').set('Authorization', bearer(c.dono));
    expect(tabela.status).toBe(200);
    expect((tabela.body.products as any[]).find((r) => r.id === c.pausado.id)).toMatchObject({ active: false, available: false });
  });

  it('painel do dono (GET /stores/dashboard) continua listando o pausado', async () => {
    const c = await cenario();
    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(c.dono));
    expect(res.status).toBe(200);
    expect((res.body.products as any[]).find((p) => p._id === c.pausado.id)?.isActive).toBe(false);
  });
});
