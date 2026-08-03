import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import app from '../app';
import { ownerIdForStore } from './helpers/storeOwner';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

afterEach(async () => {
  await cleanupUsersByEmailDomain('@rev.test');
});

async function buyer() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}@rev.test`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
    },
  });
  const token = jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

async function deliveredOrder(customerId: string, storeId: string, productIds: string[]) {
  return prisma.order.create({
    data: {
      customerId, storeId, status: 'entregue',
      totalValue: 80, deliveryFee: 0, paymentMethod: 'pix' as any,
      items: { create: productIds.map((productId) => ({ productId, quantity: 1, price: 40 })) },
    },
  });
}

describe('GET /orders/:id/my-product-reviews', () => {
  it('devolve só os produtos que o próprio cliente já avaliou neste pedido', async () => {
    const { user, token } = await buyer();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@rev.test'), name: 'Loja Rev', isOpen: true } });
    const p1 = await prisma.product.create({ data: { storeId: store.id, name: 'P1', price: 50, quantity: 5 } });
    const p2 = await prisma.product.create({ data: { storeId: store.id, name: 'P2', price: 30, quantity: 5 } });
    const order = await deliveredOrder(user.id, store.id, [p1.id, p2.id]);

    // Avalia só o p1 — o p2 segue sem avaliação.
    await prisma.productReview.create({ data: { productId: p1.id, userId: user.id, orderId: order.id, rating: 5, comment: 'bom' } });

    const res = await request(app)
      .get(`/api/orders/${order.id}/my-product-reviews`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.reviewedProductIds).toEqual([p1.id]);
  });

  it('não vaza avaliações de outro cliente', async () => {
    const a = await buyer();
    const b = await buyer();
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@rev.test'), name: 'Loja Rev2', isOpen: true } });
    const p1 = await prisma.product.create({ data: { storeId: store.id, name: 'P1', price: 50, quantity: 5 } });
    const order = await deliveredOrder(a.user.id, store.id, [p1.id]);
    await prisma.productReview.create({ data: { productId: p1.id, userId: a.user.id, orderId: order.id, rating: 4 } });

    // b consulta o mesmo pedido: filtra pelo userId dele, então não vê a review de a.
    const res = await request(app)
      .get(`/api/orders/${order.id}/my-product-reviews`)
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.status).toBe(200);
    expect(res.body.reviewedProductIds).toEqual([]);
  });
});
