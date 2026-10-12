/** D1 · P3.1 — Order ganha resposta da loja, cupom usado e "pronto para retirada". */
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t1.test';

afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(async () => { await prisma.$disconnect(); });

async function pedidoBase(extra: Record<string, unknown> = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.1', isOpen: true } });
  return prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, ...extra } as any,
  });
}

it('grava e lê storeReply, storeRepliedAt, couponId e readyAt', async () => {
  const now = new Date();
  const o = await pedidoBase({ storeReply: 'Obrigado pela compra!', storeRepliedAt: now, couponId: 'cupom_x', readyAt: now });
  const back: any = await prisma.order.findUnique({ where: { id: o.id } });
  expect(back.storeReply).toBe('Obrigado pela compra!');
  expect(back.storeRepliedAt.toISOString()).toBe(now.toISOString());
  expect(back.couponId).toBe('cupom_x');
  expect(back.readyAt.toISOString()).toBe(now.toISOString());
});

it('pedido antigo nasce com os quatro campos nulos', async () => {
  const o: any = await pedidoBase();
  expect(o.storeReply).toBeNull();
  expect(o.storeRepliedAt).toBeNull();
  expect(o.couponId).toBeNull();
  expect(o.readyAt).toBeNull();
});

it('storeReply tem teto de 500 caracteres no banco', async () => {
  await expect(pedidoBase({ storeReply: 'a'.repeat(501) })).rejects.toThrow();
  const ok: any = await pedidoBase({ storeReply: 'a'.repeat(500) });
  expect(ok.storeReply).toHaveLength(500);
});
