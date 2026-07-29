import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { ownerIdForStore, productIdForItem } from './helpers/storeOwner';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, wipeAppCashbox, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet, findWallet, createAppCashbox, findAppCashbox, findPayout } from './helpers/financePg';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

// PlatformConfig é um singleton compartilhado no Postgres de dev. Fixamos as taxas
// relevantes em valores conhecidos e restauramos ao final (padrão da Task 3), para não
// depender de valores que outra suíte possa ter deixado e não vazar os nossos.
let restorePlatformConfig: () => Promise<void>;

beforeAll(async () => {
  restorePlatformConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const data = { cancelFeeCustomerPercent: 10, lateCancellationMotoboyShare: 50, updatedBy: 'cancelFlows.test' };
  if (existing) {
    await prisma.platformConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.platformConfig.create({ data });
  }
});

afterAll(async () => {
  await restorePlatformConfig();
});

afterEach(async () => {
  await cleanupUsersByEmailDomain('@cancel.test');
  await wipeAppCashbox();
});

async function createUser(role: string) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await prisma.user.create({
    data: {
      name: `${role} test`,
      email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@cancel.test`,
      passwordHash,
      role: role as Role,
      roles: roles as Role[],
      activeRole: role as Role,
    },
  });
  const token = jwt.sign({ id: user.id, role, activeRole: role, roles }, JWT_SECRET, { expiresIn: '7d' });
  return { user, token, id: user.id };
}

// ============================================================
// Task 5: cliente cancela usando calculateCancellationFee
// - refund DESCONTADO (parcial): cliente recebe orderTotal - totalFee
// - parte do motoboy vira Payout de compensação released (motoboyShare)
// - AppCashbox lança a taxa cheia (lastro) → líquido da plataforma = appShare
// ============================================================
describe('cliente cancela pós-pickup — divide a taxa com o motoboy', () => {
  it('refund descontado + Payout de compensação do MTB + AppCashbox reflete appShare', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    // Carteira do cliente com saldo — o refund (parcial) cai aqui no fluxo legado.
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
    // Carteira do motoboy (mirror; a fonte da verdade é o Payout).
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0 });
    // Caixa do app zerado.
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Cancel' } });

    // Pedido pago, em trânsito ('enviado'), com motoboy atribuído (pós-pickup).
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200,
      deliveryFee: 0,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 0, status: 'picked' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Mudei de ideia' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');

    // Config: 10% de 200 = R$20 de taxa; 50% (R$10) motoboy, 50% (R$10) app.
    // fee.refundToCustomer = 200 - 20 = 180.

    // PROVA 1: refund DESCONTADO — o cliente recebe orderTotal - totalFee (não 100%).
    expect(res.body.refundAmount).toBeCloseTo(180, 2);
    expect(res.body.refundStatus).toBe('processed');

    // PROVA 1 (fluxo legado): a carteira do cliente foi creditada só com o refund parcial.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(1180, 2); // 1000 + 180 (nunca 1000 + 200)

    // PROVA 2: compensação do motoboy = motoboyShare, como Payout 'released' (sacável).
    const compPayout = await findPayout({ recipientType: 'motoboy', recipientId: motoboy.id, status: 'released' });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(10, 2);

    // PROVA 3: AppCashbox recebe a taxa INTEIRA (R$20) como lastro do payout, e o líquido
    // da plataforma (income - payout do motoboy) é appShare (R$10).
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(20, 2);
    expect(feeEntry!.amount - compPayout!.amount).toBeCloseTo(10, 2); // = appShare (líquido)

    // Reconciliação por Payout: a compensação aparece como saldo disponível do motoboy.
    const walletRes = await request(app)
      .get(`/api/wallets/motoboy/${motoboy.id}`)
      .set('Authorization', `Bearer ${motoboy.token}`);
    expect(walletRes.status).toBe(200);
    expect(walletRes.body.availableBalance).toBeCloseTo(10, 2);
  });
});
