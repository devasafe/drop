/**
 * H6 — pedido pago sem aceite da loja volta a ser reembolsado no prazo.
 *
 * No fluxo real o pagamento só muda `paymentStatus` ('paid'); o `status` continua 'criado'
 * até a loja aceitar (aí vira 'pago' e `acceptedAt` é gravado). O job de timeout de aceite
 * mirava `status:'pago'` + `acceptedAt:null` — combinação que o fluxo real não produz —
 * e o pedido pago que a loja ignorava nunca era reembolsado.
 */
import bcrypt from 'bcryptjs';

import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig, wipeAppCashbox } from './helpers/pgCleanup';
import { createWallet, findWallet, createAppCashbox } from './helpers/financePg';
import { runStoreAcceptTimeout } from '../jobs/storeAcceptTimeout.job';

const DOMAIN = '@hotfixh6.test';
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000);

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restoreConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  if (existing) {
    await prisma.platformConfig.update({ where: { id: existing.id }, data: { storeAcceptTimeoutMin: 10 } });
  } else {
    await prisma.platformConfig.create({ data: { storeAcceptTimeoutMin: 10, updatedBy: 'hotfix.h6.test' } });
  }
  await wipeAppCashbox();
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
  await wipeAppCashbox();
});

async function customer() {
  return prisma.user.create({
    data: {
      name: 'Cliente h6',
      email: `cliente-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
    },
  });
}

async function scenario(order: { status: any; paymentStatus: any; acceptedAt?: Date | null; createdAt?: Date }) {
  // Fluxo legado (carteira virtual): o estorno é observável no saldo do cliente.
  env.PAYMENT_GATEWAY = undefined as any;
  const cli = await customer();
  await createWallet({ owner: cli.id, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
  await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja h6' } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto h6', price: 150, quantity: 5 } });
  const created = await prisma.order.create({
    data: {
      customerId: cli.id,
      storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 150 }] },
      totalValue: 150,
      deliveryFee: 0,
      paymentMethod: 'pix',
      createdAt: order.createdAt ?? HOUR_AGO(),
      status: order.status,
      paymentStatus: order.paymentStatus,
      acceptedAt: order.acceptedAt ?? null,
    },
  });
  return { cli, product, order: created };
}

describe('H6: job de timeout de aceite pega o pedido pago do fluxo real (status criado)', () => {
  it('criado + paymentStatus paid + sem aceite + vencido → cancelado e reembolsado UMA vez, mesmo rodando o job duas vezes', async () => {
    const { cli, product, order } = await scenario({ status: 'criado', paymentStatus: 'paid' });

    await runStoreAcceptTimeout();
    await runStoreAcceptTimeout();

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('cancelado');

    const wallet = await findWallet({ owner: cli.id, ownerType: 'user' });
    expect(wallet!.balance).toBeCloseTo(450, 2); // 300 + 150, uma única vez

    const cancellations = await prisma.cancellation.findMany({ where: { orderId: order.id } });
    expect(cancellations).toHaveLength(1);
    expect(Number(cancellations[0].refundAmount)).toBeCloseTo(150, 2);

    const prod = await prisma.product.findUnique({ where: { id: product.id } });
    expect(prod!.quantity).toBe(6); // estoque devolvido uma vez
  });

  it('criado NÃO pago (do expirePixOrders) não é tocado', async () => {
    const { cli, product, order } = await scenario({ status: 'criado', paymentStatus: 'pending' });

    await runStoreAcceptTimeout();

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('criado');
    expect(after!.paymentStatus).toBe('pending');
    const wallet = await findWallet({ owner: cli.id, ownerType: 'user' });
    expect(wallet!.balance).toBeCloseTo(300, 2);
    expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(5);
  });

  it('pedido aceito pela loja (pago + acceptedAt) não é tocado', async () => {
    const { cli, order } = await scenario({ status: 'pago', paymentStatus: 'paid', acceptedAt: HOUR_AGO() });

    await runStoreAcceptTimeout();

    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.status).toBe('pago');
    const wallet = await findWallet({ owner: cli.id, ownerType: 'user' });
    expect(wallet!.balance).toBeCloseTo(300, 2);
    expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('pedido pago já cancelado não é reprocessado', async () => {
    const { cli, order } = await scenario({ status: 'cancelado', paymentStatus: 'paid' });

    await runStoreAcceptTimeout();

    const wallet = await findWallet({ owner: cli.id, ownerType: 'user' });
    expect(wallet!.balance).toBeCloseTo(300, 2);
    expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
  });
});
