/**
 * H7 — o prazo de aceite da loja conta a partir do PAGAMENTO, não da criação.
 *
 * Um PIX pode ser pago até 30 min depois de criado. Contando de `createdAt`, um pedido pago
 * no minuto 25 era reembolsado na varredura seguinte, antes da loja ver. A confirmação do
 * pagamento grava `Order.paidAt` e o job mede o prazo dele; pedidos antigos sem `paidAt`
 * caem no `createdAt`.
 */
import bcrypt from 'bcryptjs';

import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig, wipeAppCashbox } from './helpers/pgCleanup';
import { createWallet, createAppCashbox } from './helpers/financePg';
import { runStoreAcceptTimeout } from '../jobs/storeAcceptTimeout.job';
import { confirmOrderPaidByPayment, finalizeWalletPaidOrder } from '../services/asaas/orderPayment';
import { confirmDirectOrderPaid } from '../services/asaasLoja/orderPaymentDirect';

const DOMAIN = '@hotfixh7.test';
const minAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restoreConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  if (existing) {
    await prisma.platformConfig.update({ where: { id: existing.id }, data: { storeAcceptTimeoutMin: 10 } });
  } else {
    await prisma.platformConfig.create({ data: { storeAcceptTimeoutMin: 10, updatedBy: 'hotfix.h7.test' } });
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

async function setup() {
  const cli = await prisma.user.create({
    data: {
      name: 'Cliente h7',
      email: `cliente-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
    },
  });
  await createWallet({ owner: cli.id, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
  await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja h7' } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto h7', price: 150, quantity: 5 } });
  return { cli, store, product };
}

async function paidOrder(data: { createdAt: Date; paidAt: Date | null }) {
  env.PAYMENT_GATEWAY = undefined as any; // fluxo legado: estorno na carteira, sem rede
  const { cli, store, product } = await setup();
  return prisma.order.create({
    data: {
      customerId: cli.id, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 150 }] },
      totalValue: 150, deliveryFee: 0, paymentMethod: 'pix',
      status: 'criado', paymentStatus: 'paid',
      createdAt: data.createdAt, paidAt: data.paidAt,
    } as any,
  });
}

async function statusOf(id: string) {
  return (await prisma.order.findUnique({ where: { id } }))!.status;
}

describe('H7: prazo de aceite conta de paidAt (fallback createdAt)', () => {
  it('PIX criado há 25 min e pago há 2 min → NÃO cancela', async () => {
    const order = await paidOrder({ createdAt: minAgo(25), paidAt: minAgo(2) });
    await runStoreAcceptTimeout();
    expect(await statusOf(order.id)).toBe('criado');
    expect(await prisma.cancellation.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('PIX criado há 25 min e pago há 11 min → cancela', async () => {
    const order = await paidOrder({ createdAt: minAgo(25), paidAt: minAgo(11) });
    await runStoreAcceptTimeout();
    expect(await statusOf(order.id)).toBe('cancelado');
  });

  it('legado: paidAt nulo e criado há 11 min → cancela pelo createdAt', async () => {
    const order = await paidOrder({ createdAt: minAgo(11), paidAt: null });
    await runStoreAcceptTimeout();
    expect(await statusOf(order.id)).toBe('cancelado');
  });
});

describe('H7: a confirmação do pagamento grava paidAt', () => {
  async function pendingOrder(extra: Record<string, any>) {
    const { cli, store, product } = await setup();
    const order = await prisma.order.create({
      data: {
        customerId: cli.id, storeId: store.id,
        items: { create: [{ productId: product.id, quantity: 1, price: 150 }] },
        totalValue: 150, deliveryFee: 0, paymentMethod: 'pix',
        status: 'criado', paymentStatus: 'pending', createdAt: minAgo(25),
        ...extra,
      } as any,
    });
    return { order, store };
  }

  it('custódia (webhook/conciliação/cartão aprovado): confirmOrderPaidByPayment', async () => {
    const pay = `pay_h7_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { order } = await pendingOrder({ asaasPaymentId: pay, asaasChargeStatus: 'pending' });
    const before = Date.now();
    await confirmOrderPaidByPayment(pay, 'RECEIVED');
    const after = (await prisma.order.findUnique({ where: { id: order.id } })) as any;
    expect(after.paymentStatus).toBe('paid');
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(after.paidAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('pago 100% com saldo: finalizeWalletPaidOrder', async () => {
    const { order } = await pendingOrder({});
    await finalizeWalletPaidOrder(order.id);
    const after = (await prisma.order.findUnique({ where: { id: order.id } })) as any;
    expect(after.paymentStatus).toBe('paid');
    expect(after.paidAt).toBeInstanceOf(Date);
  });

  it('modo direto (conta da loja): confirmDirectOrderPaid', async () => {
    const pay = `pay_h7d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { order, store } = await pendingOrder({ asaasPaymentId: pay, paymentProvider: 'asaas_loja', asaasChargeStatus: 'pending' });
    await expect(confirmDirectOrderPaid(store.id, pay, 'RECEIVED')).resolves.toBe(true);
    const after = (await prisma.order.findUnique({ where: { id: order.id } })) as any;
    expect(after.paymentStatus).toBe('paid');
    expect(after.paidAt).toBeInstanceOf(Date);
  });
});
