/**
 * D2 · P1.8 — o motoboy vê a compensação do cancelamento: no GET da corrida e no evento
 * delivery:cancelled da sala dele (spec 5.1, item 4). Só leitura do que já foi gravado.
 * Socket.io falso no notifier (captura as emissões por sala); Asaas mockado (sem rede).
 */
const mockRoomEmits: Array<{ room: string; event: string; data: any }> = [];
jest.mock('../services/notifier', () => {
  const actual = jest.requireActual('../services/notifier');
  const io = {
    emit: () => undefined,
    to: (room: string) => ({ emit: (event: string, data: any) => { mockRoomEmits.push({ room, event, data }); } }),
  };
  return { __esModule: true, ...actual, io, default: { ...actual.default, io } };
});
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

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { criarCorrida, limparCorridas } from './helpers/motoboyRide';
import { emitDeliveryCancelled } from '../utils/socketEmitter';
import { motoboyCancellationCompensation } from '../services/motoboyCompensation';

const DOMAIN = '@d2p1comp.test';
const postAs = asaasClient.postAs as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let since = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  since = new Date();
  mockRoomEmits.length = 0;
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    settlementMode: 'custodia', customerAbsentWaitMin: 0, directTransferMaxAmount: 150,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
});
afterEach(async () => { await limparCorridas(DOMAIN, since); });

const getAs = (deliveryId: string, token: string) => request(app).get(`/api/deliveries/${deliveryId}`).set('Authorization', token);

async function cancelar(deliveryId: string) {
  await prisma.delivery.update({ where: { id: deliveryId }, data: { status: 'cancelled', cancelledAt: new Date() } });
}

describe('GET /deliveries/:id → cancellationCompensation', () => {
  it('custódia: soma os repasses de compensação não cancelados do motoboy desta corrida', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await cancelar(c.deliveryId);
    await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: c.motoboy.userId, orderId: c.orderId, deliveryId: c.deliveryId, amount: 7.5, status: 'released' } as any });
    await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: c.motoboy.userId, orderId: c.orderId, deliveryId: c.deliveryId, amount: 3, status: 'cancelled' } as any });
    const res = await getAs(c.deliveryId, bearer(c.motoboy));
    expect(res.status).toBe(200);
    expect(res.body.cancellationCompensation).toBe(7.5);
  });

  it('direto: o valor da transferência de compensação; transferência de entrega não conta', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await cancelar(c.deliveryId);
    const transfer = await prisma.motoboyTransfer.create({
      data: { deliveryId: c.deliveryId, orderId: c.orderId, storeId: c.storeId, motoboyId: c.motoboy.userId, reason: 'cancellation_compensation', amount: 12, pixKeyEncrypted: 'x', pixKeyType: 'CPF' } as any,
    });
    expect((await getAs(c.deliveryId, bearer(c.motoboy))).body.cancellationCompensation).toBe(12);
    await prisma.motoboyTransfer.update({ where: { id: transfer.id }, data: { reason: 'delivery' } });
    expect((await getAs(c.deliveryId, bearer(c.motoboy))).body.cancellationCompensation).toBeNull();
  });

  it('sem compensação gravada: null', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await cancelar(c.deliveryId);
    expect((await getAs(c.deliveryId, bearer(c.motoboy))).body.cancellationCompensation).toBeNull();
  });

  it('corrida que não está cancelada: null, mesmo com repasse do motoboy', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: c.motoboy.userId, orderId: c.orderId, deliveryId: c.deliveryId, amount: 8, status: 'pending' } as any });
    expect((await getAs(c.deliveryId, bearer(c.motoboy))).body.cancellationCompensation).toBeNull();
  });

  it('quem vê não é o motoboy da corrida (cliente, loja): null', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await cancelar(c.deliveryId);
    await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: c.motoboy.userId, orderId: c.orderId, deliveryId: c.deliveryId, amount: 7.5, status: 'released' } as any });
    expect((await getAs(c.deliveryId, bearer(c.cliente))).body.cancellationCompensation).toBeNull();
    expect((await getAs(c.deliveryId, bearer(c.dono))).body.cancellationCompensation).toBeNull();
  });
});

describe('evento delivery:cancelled', () => {
  it('emitDeliveryCancelled sem valor: o motoboy recebe cancellationCompensation null', () => {
    emitDeliveryCancelled({ _id: 'd-x', motoboyId: 'm-x' }, { reason: 'Loja fechou' });
    const toMotoboy = mockRoomEmits.find((e) => e.room === 'user:m-x' && e.event === 'delivery:cancelled');
    expect(toMotoboy?.data).toEqual({ deliveryId: 'd-x', status: 'cancelled', reason: 'Loja fechou', cancellationCompensation: null });
  });

  it('ponta a ponta (direto, cliente ausente): a sala do motoboy recebe a compensação; a sala motoboys não', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const lojista = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const motoboy = await createTestUser('motoboy', DOMAIN);
    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja Comp D2', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_LOJA_D2XX'), apiKeyLast4: 'D2XX', environment: 'sandbox', status: 'valid' },
    });
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
        subtotal: 40, totalValue: 52, deliveryFee: 12, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid',
        asaasChargeStatus: 'received', asaasPaymentId: `pay_d2_${Math.random().toString(36).slice(2, 8)}`, paymentProvider: 'asaas_loja',
        acceptedAt: new Date(), walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 },
      } as any,
    });
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, status: 'picked', fee: 12, distance: 4, pin: '12345', pinRetirada: '54321', motoboyId: motoboy.userId, assignedAt: new Date(), pickedAt: new Date() },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app).post(`/api/deliveries/${delivery.id}/cliente-ausente`).set('Authorization', bearer(motoboy)).send({ reason: 'Cliente não atende' });
    expect(res.status).toBe(200);
    expect(res.body.motoboyCompensation).toBe(12);

    const toMotoboy = mockRoomEmits.find((e) => e.room === `user:${motoboy.userId}` && e.event === 'delivery:cancelled');
    expect(toMotoboy?.data).toEqual(expect.objectContaining({ deliveryId: delivery.id, status: 'cancelled', cancellationCompensation: 12 }));
    const broadcast = mockRoomEmits.find((e) => e.room === 'motoboys' && e.event === 'delivery:cancelled');
    expect(broadcast?.data).toBeDefined();
    expect(broadcast?.data).not.toHaveProperty('cancellationCompensation');

    expect((await getAs(delivery.id, bearer(motoboy))).body.cancellationCompensation).toBe(12);
    expect(await motoboyCancellationCompensation(delivery.id, motoboy.userId)).toBe(12);
  });
});
