/**
 * D1 · P2.1 — Product.isActive: nasce ativo, o dono pausa/reativa por PUT /products/:id/active,
 * o painel do dono continua listando o pausado e assertProductsActive recusa com PRODUCT_PAUSED.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { ACTIVE_PRODUCT_WHERE, assertProductsActive } from '../services/catalog/activeProduct';
import { AppError } from '../utils/AppError';

const DOMAIN = '@d1p21.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function cenario() {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Lanchonete P21', isOpen: true, isVerified: true } });
  const prod = await prisma.product.create({ data: { storeId: store.id, name: 'Coxinha P21', price: 8, quantity: 10 } });
  return { dono, store, prod };
}

describe('Product.isActive — campo e rota do dono', () => {
  it('produto novo nasce ativo e ACTIVE_PRODUCT_WHERE é { isActive: true }', async () => {
    const c = await cenario();
    expect((c.prod as any).isActive).toBe(true);
    expect(ACTIVE_PRODUCT_WHERE).toEqual({ isActive: true });
  });

  it('o dono pausa e reativa; a resposta é o produto no formato da API', async () => {
    const c = await cenario();
    const pausa = await request(app).put(`/api/products/${c.prod.id}/active`).set('Authorization', bearer(c.dono)).send({ isActive: false });
    expect(pausa.status).toBe(200);
    expect(pausa.body.success).toBe(true);
    expect(pausa.body.data._id).toBe(c.prod.id);
    expect(pausa.body.data.isActive).toBe(false);
    expect(pausa.body.data.price).toBe(8);
    expect((await prisma.product.findUnique({ where: { id: c.prod.id } }) as any).isActive).toBe(false);

    const volta = await request(app).put(`/api/products/${c.prod.id}/active`).set('Authorization', bearer(c.dono)).send({ isActive: true });
    expect(volta.status).toBe(200);
    expect(volta.body.data.isActive).toBe(true);
  });

  it('outro lojista: 403 NOT_STORE_OWNER e nada muda', async () => {
    const c = await cenario();
    const intruso = await createTestUser('lojista', DOMAIN);
    const res = await request(app).put(`/api/products/${c.prod.id}/active`).set('Authorization', bearer(intruso)).send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_STORE_OWNER');
    expect((await prisma.product.findUnique({ where: { id: c.prod.id } }) as any).isActive).toBe(true);
  });

  it('cliente não pausa produto (403 pelo papel)', async () => {
    const c = await cenario();
    const cliente = await createTestUser('cliente', DOMAIN);
    const res = await request(app).put(`/api/products/${c.prod.id}/active`).set('Authorization', bearer(cliente)).send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it('corpo inválido: 400 e nada muda', async () => {
    const c = await cenario();
    for (const body of [{}, { isActive: 'false' }, { isActive: false, extra: 1 }]) {
      const res = await request(app).put(`/api/products/${c.prod.id}/active`).set('Authorization', bearer(c.dono)).send(body);
      expect(res.status).toBe(400);
    }
    expect((await prisma.product.findUnique({ where: { id: c.prod.id } }) as any).isActive).toBe(true);
  });

  it('produto inexistente: 404 PRODUCT_NOT_FOUND', async () => {
    const c = await cenario();
    const res = await request(app).put('/api/products/nao-existe-p21/active').set('Authorization', bearer(c.dono)).send({ isActive: false });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('o painel do dono (GET /stores/dashboard) continua listando o pausado', async () => {
    const c = await cenario();
    await prisma.product.update({ where: { id: c.prod.id }, data: { isActive: false } as any });
    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(c.dono));
    expect(res.status).toBe(200);
    const mine = (res.body.products as any[]).find((p) => p._id === c.prod.id);
    expect(mine).toBeDefined();
    expect(mine.isActive).toBe(false);
  });

  it('assertProductsActive: passa com ativos e recusa 409 PRODUCT_PAUSED com o nome do pausado', async () => {
    const c = await cenario();
    await expect(assertProductsActive([c.prod.id, c.prod.id])).resolves.toBeUndefined();
    await expect(assertProductsActive([])).resolves.toBeUndefined();

    await prisma.product.update({ where: { id: c.prod.id }, data: { isActive: false } as any });
    const err = await assertProductsActive([c.prod.id]).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('PRODUCT_PAUSED');
    expect(err.message).toContain('Coxinha P21');
  });
});
