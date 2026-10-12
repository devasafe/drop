/** D1 · P4.6 — repor estoque em lote pelo painel (mesma regra da integração). */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1p46.test';
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function setup() {
  const dono = await createTestUser('lojista', DOMAIN);
  const outro = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P46', isOpen: true } });
  const otherStore = await prisma.store.create({ data: { ownerId: outro.userId, name: 'Loja P46b', isOpen: true } });
  const p1 = await prisma.product.create({ data: { storeId: store.id, name: 'A', price: 10, quantity: 0 } });
  const p2 = await prisma.product.create({ data: { storeId: store.id, name: 'B', price: 10, quantity: 2 } });
  const alheio = await prisma.product.create({ data: { storeId: otherStore.id, name: 'C', price: 10, quantity: 7 } });
  return { dono, outro, store, otherStore, p1, p2, alheio };
}
const patch = (who: any, body: any) => request(app).patch('/api/products/stock').set('Authorization', bearer(who)).send(body);
const qty = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.quantity;

describe('PATCH /api/products/stock', () => {
  it('atualiza vários produtos da loja e devolve quantos mudaram', async () => {
    const s = await setup();
    const r = await patch(s.dono, { storeId: s.store.id, items: [{ productId: s.p1.id, stock: 12 }, { productId: s.p2.id, stock: 0 }] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { updated: 2 } });
    expect(await qty(s.p1.id)).toBe(12);
    expect(await qty(s.p2.id)).toBe(0);
  });

  it('produto de outra loja no lote é ignorado (não muda nem conta)', async () => {
    const s = await setup();
    const r = await patch(s.dono, { storeId: s.store.id, items: [{ productId: s.p1.id, stock: 3 }, { productId: s.alheio.id, stock: 99 }] });
    expect(r.status).toBe(200);
    expect(r.body.data.updated).toBe(1);
    expect(await qty(s.alheio.id)).toBe(7);
  });

  it('storeId de outra loja → 403 e nada muda', async () => {
    const s = await setup();
    const r = await patch(s.dono, { storeId: s.otherStore.id, items: [{ productId: s.alheio.id, stock: 0 }] });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(await qty(s.alheio.id)).toBe(7);
  });

  it('validação: vazio, mais de 200, negativo ou fracionado → 400', async () => {
    const s = await setup();
    const many = Array.from({ length: 201 }, () => ({ productId: s.p1.id, stock: 1 }));
    for (const items of [[], many, [{ productId: s.p1.id, stock: -1 }], [{ productId: s.p1.id, stock: 1.5 }], [{ productId: '', stock: 1 }]]) {
      expect((await patch(s.dono, { storeId: s.store.id, items })).status).toBe(400);
    }
    expect(await qty(s.p1.id)).toBe(0);
  });

  it('exatamente 200 itens passa', async () => {
    const s = await setup();
    const items = Array.from({ length: 200 }, (_, i) => ({ productId: s.p1.id, stock: i }));
    const r = await patch(s.dono, { storeId: s.store.id, items });
    expect(r.status).toBe(200);
    expect(await qty(s.p1.id)).toBe(199); // repetido: vale o último
  });

  it('cliente → 403; anônimo → 401', async () => {
    const s = await setup();
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await patch(cliente, { storeId: s.store.id, items: [{ productId: s.p1.id, stock: 1 }] })).status).toBe(403);
    expect((await request(app).patch('/api/products/stock').send({})).status).toBe(401);
  });
});
