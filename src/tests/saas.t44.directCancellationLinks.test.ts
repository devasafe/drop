/**
 * Revisão final M4 — cancelamentos do pedido direto:
 *  - M4a: o vínculo order.cancellationId já é gravado na transação; o update pós-commit
 *    redundante não pode mais derrubar a requisição antes do estorno (settleDirectRefund).
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas44.test';
const STORE_KEY = '$aact_hmlg_LOJA_44XX';
const postAs = asaasClient.postAs as jest.Mock;

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });

beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  await updatePlatformConfig({ settlementMode: 'direto', customerAbsentWaitMin: 0 } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function scenario(sc: { status: string; delivery?: 'pending' | 'picked'; acceptedAt?: boolean }) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 44', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '44XX', environment: 'sandbox', status: 'valid' },
  });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
      subtotal: 40, totalValue: 52, deliveryFee: 12, status: sc.status, paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_44_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
      acceptedAt: sc.acceptedAt ? new Date() : null,
      walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 },
    } as any,
  });
  let delivery: any = null;
  if (sc.delivery) {
    delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, status: sc.delivery, fee: 12, distance: 4, pin: '12345', pinRetirada: '54321',
        motoboyId: sc.delivery === 'picked' ? motoboy.userId : null,
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  }
  return { cliente, lojista, motoboy, store, product, order, delivery };
}

/** Faz o update pós-commit que grava SÓ o vínculo cancellationId falhar (o resto passa). */
function failCancellationIdOnlyUpdate() {
  const real = prisma.order.update.bind(prisma.order);
  return jest.spyOn(prisma.order, 'update').mockImplementation(((args: any) => {
    const keys = Object.keys(args?.data ?? {});
    if (keys.length === 1 && keys[0] === 'cancellationId') return Promise.reject(new Error('falha forçada pós-commit'));
    return real(args);
  }) as any);
}

const refundRow = (orderId: string) => prisma.directRefund.findUnique({ where: { orderId } });
const orderRow = (id: string) => prisma.order.findUnique({ where: { id } });

describe('M4a — vínculo cancellationId só na transação (pedido direto)', () => {
  it('cliente cancela: falha no update pós-commit não impede o estorno', async () => {
    const s = await scenario({ status: 'pago', delivery: 'pending' });
    failCancellationIdOnlyUpdate();
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect((await refundRow(s.order.id))!.status).toBe('done');
    const o = await orderRow(s.order.id);
    expect(o!.cancellationId).toBeTruthy();
    expect(o!.status).toBe('cancelado');
  });

  it('cliente ausente: idem', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    failCancellationIdOnlyUpdate();
    const res = await request(app).post(`/api/deliveries/${s.delivery.id}/cliente-ausente`).set('Authorization', bearer(s.motoboy)).send({});
    expect(res.status).toBe(200);
    expect((await refundRow(s.order.id))!.status).toBe('done');
    expect((await orderRow(s.order.id))!.cancellationId).toBeTruthy();
  });

  it('loja rejeita: idem', async () => {
    const s = await scenario({ status: 'pago', acceptedAt: true });
    failCancellationIdOnlyUpdate();
    const res = await request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
    expect(res.status).toBe(200);
    expect((await refundRow(s.order.id))!.status).toBe('done');
    const o = await orderRow(s.order.id);
    expect(o!.cancellationId).toBeTruthy();
    expect(o!.status).toBe('rejeitado');
  });
});
