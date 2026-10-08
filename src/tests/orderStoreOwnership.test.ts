/**
 * Regressão (2026-10-07): o pedido aceitava produto de OUTRA loja.
 * O frontend monta o pedido com `cart[0].storeId` e manda o carrinho inteiro; o
 * createOrder buscava cada produto só pelo id. Resultado: o produto da loja B entrava
 * no pedido da loja A — baixava o estoque de B, mas dinheiro e notificação iam para A.
 * Agora todo produto precisa pertencer a `storeId`, e o estoque já baixado é devolvido.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@osown.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function storeWithProduct(name: string) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name, isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: `Item ${name}`, price: 50, quantity: 10 } } as any);
  return { store, product };
}

function payload(storeId: string, productIds: string[]) {
  return {
    storeId,
    products: productIds.map((productId) => ({ productId, quantity: 2 })),
    paymentMethod: 'pix',
    deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro',
  };
}

describe('createOrder — todos os produtos precisam ser da loja do pedido', () => {
  it('recusa produto de outra loja e não mexe no estoque dela', async () => {
    const buyer = await createTestUser('cliente', DOMAIN);
    const a = await storeWithProduct('A');
    const b = await storeWithProduct('B');

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearer(buyer))
      .send(payload(a.store.id, [b.product.id]));

    expect(res.status).toBe(400);
    const prodB = await prisma.product.findUnique({ where: { id: b.product.id } });
    expect(prodB?.quantity).toBe(10);
    expect(await prisma.order.count({ where: { storeId: a.store.id } })).toBe(0);
  });

  it('carrinho misto: devolve o estoque do item da própria loja já baixado', async () => {
    const buyer = await createTestUser('cliente', DOMAIN);
    const a = await storeWithProduct('A');
    const b = await storeWithProduct('B');

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearer(buyer))
      .send(payload(a.store.id, [a.product.id, b.product.id]));

    expect(res.status).toBe(400);
    const [prodA, prodB] = await Promise.all([
      prisma.product.findUnique({ where: { id: a.product.id } }),
      prisma.product.findUnique({ where: { id: b.product.id } }),
    ]);
    expect(prodA?.quantity).toBe(10);
    expect(prodB?.quantity).toBe(10);
  });
});
