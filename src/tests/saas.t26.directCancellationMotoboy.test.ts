/**
 * Task 2.6 — compensação do motoboy nos cancelamentos do pedido direto (asaas_loja).
 * A parte do motoboy vem de calculateCancellationFee (motoboyShare) e vira uma
 * MotoboyTransfer (reason 'cancellation_compensation', valor = motoboyShare) criada na
 * MESMA transação do registro do cancelamento. Só registra a linha; o envio é da 2.3.
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
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData, decryptSensitiveData } from '../utils/encryption';
import { emitAdminNotification } from '../utils/socketEmitter';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import * as motoboyTransferModule from '../services/asaasLoja/motoboyTransfer';
import { createCancellationCompensation } from '../services/asaasLoja/directCancellation';

const DOMAIN = '@saas26.test';
const STORE_KEY = '$aact_hmlg_LOJA_26XX';
const postAs = asaasClient.postAs as jest.Mock;
const adminNotify = emitAdminNotification as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;

let restore: () => Promise<void>;
let testStart = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });

beforeEach(async () => {
  testStart = new Date();
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    settlementMode: 'direto', customerAbsentWaitMin: 0, directTransferMaxAmount: 150,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
});

afterEach(async () => {
  jest.restoreAllMocks();
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  // O caso de custódia cria o AppCashbox (singleton) se não existia: não deixa vazar.
  await prisma.appCashbox.deleteMany({ where: { createdAt: { gte: testStart }, entries: { none: {} } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function scenario(sc: {
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado';
  delivery?: 'pending' | 'assigned' | 'picked';
  withMotoboy?: boolean;
  acceptedAt?: boolean;
  provider?: 'asaas_loja' | 'asaas';
  pix?: boolean;
}) {
  const cliente = await createTestUser('cliente', DOMAIN);
  const lojista = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  if (sc.pix !== false) {
    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  }
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja 26', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: '26XX', environment: 'sandbox', status: 'valid' },
  });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
      subtotal: 40, totalValue: 52, deliveryFee: 12, status: sc.status, paymentMethod: 'pix',
      paymentStatus: 'paid', asaasChargeStatus: 'received',
      asaasPaymentId: `pay_26_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: sc.provider ?? 'asaas_loja',
      acceptedAt: sc.acceptedAt ? new Date() : null,
      walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 },
    } as any,
  });
  let delivery: any = null;
  if (sc.delivery) {
    const withMotoboy = sc.withMotoboy ?? sc.delivery !== 'pending';
    delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, status: sc.delivery, fee: 12, distance: 4, pin: '12345', pinRetirada: '54321',
        motoboyId: withMotoboy ? motoboy.userId : null,
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });
  }
  return { cliente, lojista, motoboy, store, product, order, delivery };
}

const transfersOf = (orderId: string) => prisma.motoboyTransfer.findMany({ where: { orderId } });
const lastCancellation = (orderId: string) => prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
const cancelByCustomer = (s: any) => request(app).post(`/api/orders/${s.order.id}/cancel`).set('Authorization', bearer(s.cliente)).send({});

describe('compensação do motoboy no cancelamento do pedido direto', () => {
  it('cliente cancela com motoboy a caminho -> MotoboyTransfer da entrega cheia (motoboyShare) ao motoboy', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(40);

    const rows = await transfersOf(s.order.id);
    expect(rows).toHaveLength(1);
    const t = rows[0];
    expect(t.reason).toBe('cancellation_compensation');
    expect(Number(t.amount)).toBe(12);
    expect(t.status).toBe('pending');
    expect(t.lastError).toBeNull();
    expect(t.deliveryId).toBe(s.delivery.id);
    expect(t.motoboyId).toBe(s.motoboy.userId);
    expect(t.storeId).toBe(s.store.id);
    expect(decryptSensitiveData(t.pixKeyEncrypted)).toBe('12345678909');
    expect(await lastCancellation(s.order.id)).not.toBeNull();
    // Envio desligado por padrão: só registra, nada vai ao Asaas além do estorno.
    expect(postAs.mock.calls.every((c) => String(c[1]).includes('/refund'))).toBe(true);
  });

  it('cliente cancela antes do envio (motoboy aceito, sem retirada) -> nenhuma transferência', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'assigned', acceptedAt: true });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(52);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });

  it('cancelamento repetido -> no máximo uma transferência', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const [a, b] = await Promise.all([cancelByCustomer(s), cancelByCustomer(s)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const again = await cancelByCustomer(s);
    expect(again.status).not.toBe(200); // pedido já cancelado: barrado antes da trava
    expect(await transfersOf(s.order.id)).toHaveLength(1);
  });

  it('cliente ausente (P1) -> entrega cheia ao motoboy', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const res = await request(app).post(`/api/deliveries/${s.delivery.id}/cliente-ausente`).set('Authorization', bearer(s.motoboy)).send({});
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(40);
    const rows = await transfersOf(s.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('cancellation_compensation');
    expect(Number(rows[0].amount)).toBe(12);
    expect(rows[0].motoboyId).toBe(s.motoboy.userId);
    expect(rows[0].deliveryId).toBe(s.delivery.id);

    const again = await request(app).post(`/api/deliveries/${s.delivery.id}/cliente-ausente`).set('Authorization', bearer(s.motoboy)).send({});
    expect(again.status).not.toBe(200);
    expect(await transfersOf(s.order.id)).toHaveLength(1);
  });

  it('loja cancela com motoboy aceito (aceite na janela da trava) -> a parte do motoboy da fórmula', async () => {
    const s = await scenario({ status: 'aguardando_motoboy', delivery: 'assigned', acceptedAt: true });
    // O guard MOTOBOY_ACCEPTED_CANNOT_CANCEL leu a entrega ainda sem motoboy; o aceite
    // acontece entre a leitura e a trava do pedido.
    const real = prisma.delivery.findUnique.bind(prisma.delivery);
    jest.spyOn(prisma.delivery, 'findUnique')
      .mockImplementationOnce((async () => ({ id: s.delivery.id, status: 'pending', motoboyId: null })) as any)
      .mockImplementation(real as any);
    const res = await request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(52);
    const rows = await transfersOf(s.order.id);
    expect(rows).toHaveLength(1);
    // calculateCancellationFee(store): 12 × 10% = 1,20; motoboy 50% = 0,60.
    expect(Number(rows[0].amount)).toBe(0.6);
    expect(rows[0].reason).toBe('cancellation_compensation');
    expect(rows[0].motoboyId).toBe(s.motoboy.userId);
    // Modo direto: a multa da loja não é cobrada pela custódia.
    expect(await prisma.walletEntry.count({ where: { reference: `CANCEL_STORE_${s.order.id}` } })).toBe(0);
  });

  it('loja rejeita sem motoboy -> nenhuma transferência', async () => {
    const s = await scenario({ status: 'pago', acceptedAt: true });
    const res = await request(app).post(`/api/orders/${s.order.id}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'x' });
    expect(res.status).toBe(200);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });

  it('sem motoboy atribuído (enviado, entrega sem motoboy) -> nenhuma transferência', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', withMotoboy: false, acceptedAt: true });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(52);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });

  it('motoboy desiste após retirar -> nada ao motoboy e nenhuma multa; reembolso integral ao cliente', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const rej = await request(app).post(`/api/deliveries/${s.delivery.id}/reject`).set('Authorization', bearer(s.motoboy)).send({});
    expect(rej.status).toBe(202);
    expect(rej.body.feeStatus).toBe('none');
    expect(await prisma.walletEntry.count({ where: { reference: `CANCEL_MTB_${s.delivery.id}` } })).toBe(0);
    expect(await prisma.appCashboxEntry.count({ where: { orderId: s.order.id } })).toBe(0);
    expect(await transfersOf(s.order.id)).toHaveLength(0);

    const dec = await request(app).post(`/api/orders/${s.order.id}/pos-devolucao`).set('Authorization', bearer(s.cliente)).send({ escolha: 'reembolso' });
    expect(dec.status).toBe(200);
    expect(dec.body.refundAmount).toBe(52);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
    expect(await prisma.walletEntry.count({ where: { wallet: { owner: s.motoboy.userId } } })).toBe(0);
  });

  it('pedido de custódia -> nenhuma MotoboyTransfer (segue o Payout da custódia)', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true, provider: 'asaas' });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    expect(await transfersOf(s.order.id)).toHaveLength(0);
    expect(await prisma.payout.count({ where: { orderId: s.order.id, recipientType: 'motoboy' } })).toBe(1);
  });

  it('motoboy sem chave Pix -> transferência nasce failed (MOTOBOY_PIX_KEY_MISSING) e o admin é avisado', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true, pix: false });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    const rows = await transfersOf(s.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].lastError).toBe('MOTOBOY_PIX_KEY_MISSING');
    expect(adminNotify).toHaveBeenCalled();
  });

  it('acima do teto -> nasce failed_final (AMOUNT_OVER_LIMIT)', async () => {
    await updatePlatformConfig({ directTransferMaxAmount: 10 } as any, 'test');
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(200);
    const rows = await transfersOf(s.order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed_final');
    expect(rows[0].lastError).toBe('AMOUNT_OVER_LIMIT');
  });

  it('falha ao criar a transferência desfaz o registro do cancelamento (mesma transação)', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    jest.spyOn(motoboyTransferModule, 'createTransferForDelivery').mockRejectedValue(new Error('boom'));
    const res = await cancelByCustomer(s);
    expect(res.status).toBe(500);
    expect(await lastCancellation(s.order.id)).toBeNull();
    expect(await transfersOf(s.order.id)).toHaveLength(0);
    // Sem cancelamento gravado, o estorno não é pedido (R1).
    expect(postAs).not.toHaveBeenCalled();
  });
});

describe('createCancellationCompensation', () => {
  it('idempotente por entrega: duas chamadas -> uma linha', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const params = { order: s.order, deliveryId: s.delivery.id, motoboyId: s.motoboy.userId, motoboyShare: 12 };
    const a = await prisma.$transaction((tx) => createCancellationCompensation(tx, params));
    const b = await prisma.$transaction((tx) => createCancellationCompensation(tx, params));
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(await transfersOf(s.order.id)).toHaveLength(1);
  });

  it('não cria para pedido de custódia, sem motoboy, sem entrega ou com motoboyShare 0', async () => {
    const s = await scenario({ status: 'enviado', delivery: 'picked', acceptedAt: true });
    const base = { order: s.order, deliveryId: s.delivery.id, motoboyId: s.motoboy.userId, motoboyShare: 12 };
    const run = (p: any) => prisma.$transaction((tx) => createCancellationCompensation(tx, p));
    expect(await run({ ...base, order: { ...s.order, paymentProvider: 'asaas' } })).toBeNull();
    expect(await run({ ...base, motoboyId: null })).toBeNull();
    expect(await run({ ...base, deliveryId: null })).toBeNull();
    expect(await run({ ...base, motoboyShare: 0 })).toBeNull();
    expect(await run({ ...base, motoboyShare: 0.004 })).toBeNull();
    expect(await transfersOf(s.order.id)).toHaveLength(0);
  });
});
