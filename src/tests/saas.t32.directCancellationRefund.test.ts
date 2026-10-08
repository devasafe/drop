/**
 * Task 3.2 — cancelamentos do pedido direto (asaas_loja) disparam o estorno com a chave da loja.
 * Asaas mockado em services/asaas/client (sem rede).
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
  return { __esModule: true, ...actual, emitToRoom: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { requestDirectRefund } from '../services/asaasLoja/refund';
import { directCustomerRefund } from '../services/asaasLoja/directCancellation';
import { AsaasLojaProvider } from '../services/paymentProvider/asaasLojaProvider';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { cancelOrderWithFullRefund } from '../controllers/cancellationController';

const DOMAIN = '@saas32.test';
const STORE_KEY = '$aact_hmlg_LOJA_32XX';
const postAs = asaasClient.postAs as jest.Mock;
const post = asaasClient.post as jest.Mock;

let restore: () => Promise<void>;
beforeAll(async () => {
  restore = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restore();
});

beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  post.mockReset();
  await updatePlatformConfig({ settlementMode: 'direto', customerAbsentWaitMin: 0 } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function scenario(sc: {
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado';
  paymentStatus?: 'paid' | 'pending';
  delivery?: 'pending' | 'picked';
  acceptedAt?: boolean;
}) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 32', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '32XX', environment: 'sandbox', status: 'valid' },
  });
  const paymentStatus = sc.paymentStatus ?? 'paid';
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
      subtotal: 40, totalValue: 52, deliveryFee: 12, status: sc.status, paymentMethod: 'pix',
      paymentStatus, asaasChargeStatus: paymentStatus === 'paid' ? 'received' : 'pending',
      asaasPaymentId: `pay_32_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
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

const qty = async (id: string) => (await prisma.product.findUnique({ where: { id } }))!.quantity;
const statusOf = async (id: string) => (await prisma.order.findUnique({ where: { id } }))!.status;
const refundRow = (orderId: string) => prisma.directRefund.findUnique({ where: { orderId } });
const lastCancellation = (orderId: string) => prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });

async function custodyCounts(orderId: string, owners: string[]) {
  return {
    payout: await prisma.payout.count({ where: { orderId } }),
    cashbox: await prisma.appCashboxEntry.count({ where: { orderId } }),
    wallet: await prisma.wallet.count({ where: { owner: { in: owners } } }),
    walletEntry: await prisma.walletEntry.count({ where: { OR: [{ relatedId: orderId }, { reference: { contains: orderId } }] } }),
  };
}
const owners = (s: any) => [s.cliente.userId, s.store.id, s.motoboy.userId];

describe('directCustomerRefund', () => {
  const order = { totalValue: 52, deliveryFee: 12 };
  const fee = { refundToCustomer: 46.8 } as any;
  it('customer_absent: total - taxa de entrega (ignora o fee)', () => {
    expect(directCustomerRefund(order, fee, 'customer_absent')).toBe(40);
  });
  it('full: total do pedido', () => {
    expect(directCustomerRefund(order, fee, 'full')).toBe(52);
    expect(directCustomerRefund(order, null, 'full')).toBe(52);
  });
  it('customer/store: fee.refundToCustomer arredondado a 2 casas', () => {
    expect(directCustomerRefund(order, { refundToCustomer: 46.8049 } as any, 'customer')).toBe(46.8);
    expect(directCustomerRefund(order, fee, 'store')).toBe(46.8);
  });
  it('nunca negativo', () => {
    expect(directCustomerRefund({ totalValue: 5, deliveryFee: 12 }, fee, 'customer_absent')).toBe(0);
    expect(directCustomerRefund(order, { refundToCustomer: -3 } as any, 'customer')).toBe(0);
  });
});

describe('cancelamentos do pedido direto disparam o estorno', () => {
  beforeEach(() => {
    postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  });

  it('cliente cancela antes do aceite -> estorno de totalValue; resposta processed', async () => {
    const s = await scenario({ status: 'pago', delivery: 'pending' });
    const before = await custodyCounts(s.order.id, owners(s));
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][0]).toBe(STORE_KEY);
    expect(postAs.mock.calls[0][1]).toBe(`/payments/${s.order.asaasPaymentId}/refund`);
    expect(postAs.mock.calls[0][2].value).toBe(52);
    const row = await refundRow(s.order.id);
    expect(row!.status).toBe('done');
    expect(Number(row!.amount)).toBe(52);
    expect(row!.requestedBy).toBe(s.cliente.userId);
    const c = await lastCancellation(s.order.id);
    expect(row!.cancellationId).toBe(c!.id);
    expect(c!.refundStatus).toBe('processed');
    expect(await statusOf(s.order.id)).toBe('cancelado');
    expect(await qty(s.product.id)).toBe(12);
    expect(await custodyCounts(s.order.id, owners(s))).toEqual(before);
    expect((await prisma.order.findUnique({ where: { id: s.order.id } }))!.paymentStatus).toBe('refunded');
  });

  it('cliente cancela com motoboy a caminho (enviado) -> estorno de total - deliveryFee', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const before = await custodyCounts(s.order.id, owners(s));
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    expect(postAs.mock.calls[0][2].value).toBe(40);
    expect(Number((await refundRow(s.order.id))!.amount)).toBe(40);
    expect(await custodyCounts(s.order.id, owners(s))).toEqual(before);
  });

  it('cliente ausente -> estorno de total - deliveryFee (P1)', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const before = await custodyCounts(s.order.id, owners(s));
    const res = await request(app).post(`/api/deliveries/${s.delivery.id}/cliente-ausente`).set('Authorization', bearer(s.motoboy)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    expect(postAs.mock.calls[0][2].value).toBe(40);
    const row = await refundRow(s.order.id);
    expect(Number(row!.amount)).toBe(40);
    expect(row!.requestedBy).toBe(s.motoboy.userId);
    expect(await statusOf(s.order.id)).toBe('cancelado');
    expect(await custodyCounts(s.order.id, owners(s))).toEqual(before);
  });

  it('loja rejeita -> estorno de totalValue', async () => {
    const s = await scenario({ status: 'pago', acceptedAt: true });
    const before = await custodyCounts(s.order.id, owners(s));
    const res = await request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    expect(postAs.mock.calls[0][2].value).toBe(52);
    expect((await lastCancellation(s.order.id))!.refundStatus).toBe('processed');
    expect(await statusOf(s.order.id)).toBe('rejeitado');
    expect(await custodyCounts(s.order.id, owners(s))).toEqual(before);
  });

  it('timeout/recusa (cancelOrderWithFullRefund) -> estorno de totalValue', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'pending', acceptedAt: true });
    const before = await custodyCounts(s.order.id, owners(s));
    const order = toApiOrder(await prisma.order.findUnique({ where: { id: s.order.id }, include: orderInclude }));
    const r = await cancelOrderWithFullRefund(order, { reason: 'timeout', reasonCode: 'store_rejected', cancelledBy: 'store' });
    expect(r.ok).toBe(true);
    expect(r.refundStatus).toBe('processed');
    expect(postAs.mock.calls[0][2].value).toBe(52);
    const row = await refundRow(s.order.id);
    expect(row!.status).toBe('done');
    expect(row!.requestedBy).toBe('system');
    expect(await custodyCounts(s.order.id, owners(s))).toEqual(before);
  });

  it('Asaas recusa (400) -> cancelamento acontece mesmo assim; refundStatus pending; DirectRefund failed', async () => {
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'x', description: 'Saldo insuficiente' } as any]));
    const s = await scenario({ status: 'pago', delivery: 'pending' });
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('pending');
    expect(await statusOf(s.order.id)).toBe('cancelado');
    expect(await qty(s.product.id)).toBe(12);
    expect((await refundRow(s.order.id))!.status).toBe('failed');
    expect((await lastCancellation(s.order.id))!.refundStatus).toBe('pending');
  });

  it('erro inesperado no estorno (banco/rede) nao derruba o cancelamento', async () => {
    postAs.mockRejectedValue(new Error('socket hang up')); // 'uncertain'
    const s = await scenario({ status: 'pago', delivery: 'pending' });
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('pending');
    expect(await statusOf(s.order.id)).toBe('cancelado');
    expect((await refundRow(s.order.id))!.status).toBe('uncertain');
  });

  it('pedido direto NAO pago -> nenhum DirectRefund, refundStatus processed', async () => {
    const s = await scenario({ status: 'criado', paymentStatus: 'pending' });
    const res = await request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    expect(await refundRow(s.order.id)).toBeNull();
    expect(postAs).not.toHaveBeenCalled();
  });
});

describe('achados da revisao da 3.1', () => {
  it('AsaasLojaProvider.refund sem value nao cai no fallback totalValue: failed, sem linha, sem chamada', async () => {
    const s = await scenario({ status: 'cancelado' as any });
    const r = await new AsaasLojaProvider().refund(s.order.id, s.order.asaasPaymentId!);
    expect(r).toEqual({ status: 'failed', errorMessage: 'asaas_loja: valor do estorno obrigatório' });
    expect(await refundRow(s.order.id)).toBeNull();
    expect(postAs).not.toHaveBeenCalled();
  });

  it('requestDirectRefund com linha existente e amount diferente: logger.warn e devolve a existente', async () => {
    const s = await scenario({ status: 'cancelado' as any });
    const a = await requestDirectRefund({ orderId: s.order.id, cancellationId: null, amount: 40, requestedBy: 'system' });
    const warn = jest.spyOn(logger, 'warn').mockImplementation((() => undefined) as any);
    const b = await requestDirectRefund({ orderId: s.order.id, cancellationId: null, amount: 52, requestedBy: 'system' });
    expect(b.id).toBe(a.id);
    expect(Number(b.amount)).toBe(40);
    const call = warn.mock.calls.find((c) => String(c[0]).includes('estorno direto'));
    expect(call).toBeDefined();
    expect(JSON.stringify(call)).toContain(s.order.id);
    expect(JSON.stringify(call)).toContain('40');
    expect(JSON.stringify(call)).toContain('52');
    // mesmo valor: sem aviso
    warn.mockClear();
    await requestDirectRefund({ orderId: s.order.id, cancellationId: null, amount: 40, requestedBy: 'system' });
    expect(warn).not.toHaveBeenCalled();
  });
});
