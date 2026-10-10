/**
 * H2 — GET /products?category=<id> filtrava por `category` (relação) com uma string →
 * Prisma lançava e a listagem respondia 500. `category` na query é o id da Category.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@hotfixh2.test';
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

describe('H2 — filtro de categoria em GET /products', () => {
  it('?category=<id> → 200 só com os produtos da categoria', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja h2', isOpen: true, isVerified: true, plan: 2 } as any });
    const pizzas = await prisma.category.create({ data: { storeId: store.id, name: 'Pizzas' } });
    const bebidas = await prisma.category.create({ data: { storeId: store.id, name: 'Bebidas' } });
    const p1 = await prisma.product.create({ data: { storeId: store.id, name: 'Calabresa', price: 40, quantity: 5, categoryId: pizzas.id } as any });
    const p2 = await prisma.product.create({ data: { storeId: store.id, name: 'Mussarela', price: 38, quantity: 5, categoryId: pizzas.id } as any });
    await prisma.product.create({ data: { storeId: store.id, name: 'Refri', price: 8, quantity: 5, categoryId: bebidas.id } as any });
    await prisma.product.create({ data: { storeId: store.id, name: 'Sem categoria', price: 8, quantity: 5 } as any });

    const res = await request(app).get(`/api/products?category=${pizzas.id}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.products.map((p: any) => p._id).sort()).toEqual([p1.id, p2.id].sort());
    expect(res.body.products.every((p: any) => p.categoryName === 'Pizzas')).toBe(true);
  });
});
