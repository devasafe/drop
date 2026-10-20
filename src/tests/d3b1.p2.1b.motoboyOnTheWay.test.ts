/**
 * D3b-1 · P2.1b — "motoboy em rota" é a entrega retirada (Delivery.status 'picked'), o estado real
 * da operação (o pedido fica em 'aguardando_motoboy'). O cliente paga a taxa (o valor da entrega)
 * e o motoboy recebe esse valor, na custódia e no SaaS. Com o motoboy indo à loja segue grátis.
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
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { bearer } from './helpers/authUser';
import { cenarioCancel, limparCancel } from './helpers/d3b1Cancel';
import { motoboyOnTheWay } from '../services/cancellation/shared';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p21b.test';
const postAs = asaasClient.postAs as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let since = new Date();

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  await prisma.$disconnect();
});
beforeEach(async () => {
  since = new Date();
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_loja', status: 'REFUNDED' });
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    directTransferMaxAmount: 150, directTransfersEnabled: false, customerAbsentWaitMin: 0,
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
});
afterEach(async () => { await limparCancel(DOMAIN, since); });

const cancelByCustomer = (orderId: string, token: any) =>
  request(app).post(`/api/orders/${orderId}/cancel`).set('Authorization', bearer(token)).send({});

describe('motoboyOnTheWay', () => {
  it('retirada com motoboy = em rota; indo à loja não; enviado (legado) com motoboy continua em rota', () => {
    expect(motoboyOnTheWay('aguardando_motoboy', { status: 'picked', motoboyId: 'm1' })).toBe(true);
    expect(motoboyOnTheWay('aguardando_motoboy', { status: 'assigned', motoboyId: 'm1' })).toBe(false);
    expect(motoboyOnTheWay('aguardando_motoboy', { status: 'picked', motoboyId: null })).toBe(false);
    expect(motoboyOnTheWay('enviado', { status: 'assigned', motoboyId: 'm1' })).toBe(true);
    expect(motoboyOnTheWay('enviado', null)).toBe(false);
  });
});

describe('cliente cancela com a entrega retirada (estado real)', () => {
  it('custódia: devolve total − entrega (40) e o motoboy recebe a entrega (12, Payout released)', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const prev = await request(app).get(`/api/orders/${s.orderId}/cancel-preview`).set('Authorization', bearer(s.cliente));
    expect(prev.body.data).toMatchObject({ cancellable: true, fee: 12, refund: 40, motoboyEnRoute: true });

    const res = await cancelByCustomer(s.orderId, s.cliente);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refundAmount: 40, isLateCancellation: true, lateCancellationFee: 12 });
    const p = await prisma.payout.findMany({ where: { orderId: s.orderId, recipientType: 'motoboy' } });
    expect(p.map((x) => [x.recipientId, Number(x.amount), x.status])).toEqual([[s.motoboy.userId, 12, 'released']]);
    expect(await prisma.cancellation.findFirst({ where: { orderId: s.orderId } })).toMatchObject({ reasonCode: 'late_cancellation', isLateCancellation: true });
  });

  it('SaaS: estorno de 40 pela loja e MotoboyTransfer de 12 ao motoboy', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const res = await cancelByCustomer(s.orderId, s.cliente);
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(40);
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(40);
    const t = await prisma.motoboyTransfer.findMany({ where: { orderId: s.orderId } });
    expect(t.map((x) => [x.reason, x.motoboyId, Number(x.amount)])).toEqual([['cancellation_compensation', s.motoboy.userId, 12]]);
  });

  it('motoboy ainda indo à loja (assigned): continua grátis, sem compensação', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    const res = await cancelByCustomer(s.orderId, s.cliente);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refundAmount: 52, isLateCancellation: false });
    expect(await prisma.payout.count({ where: { orderId: s.orderId, recipientType: 'motoboy' } })).toBe(0);
  });

  it('a loja continua sem poder cancelar com a entrega retirada', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const res = await request(app).post(`/api/orders/${s.orderId}/reject`).set('Authorization', bearer(s.lojista)).send({ reason: 'sem estoque' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MOTOBOY_ACCEPTED_CANNOT_CANCEL');
  });
});

describe('cliente ausente com o pedido real (aguardando_motoboy + entrega retirada)', () => {
  const absent = (deliveryId: string, token: any) =>
    request(app).post(`/api/deliveries/${deliveryId}/cliente-ausente`).set('Authorization', bearer(token)).send({ reason: 'Cliente não atende' });

  it('custódia: 200, taxa de 10% do pedido (5,20) retida e o motoboy recebe a entrega inteira (12)', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const res = await absent(s.deliveryId!, s.motoboy);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'cancelado', refundAmount: 46.8, motoboyCompensation: 12 });
    expect((await prisma.order.findUnique({ where: { id: s.orderId } }))?.status).toBe('cancelado');
    const p = await prisma.payout.findMany({ where: { orderId: s.orderId, recipientType: 'motoboy' } });
    expect(p.map((x) => [x.recipientId, Number(x.amount), x.status])).toEqual([[s.motoboy.userId, 12, 'released']]);
    expect(Number((await prisma.cancellation.findFirst({ where: { orderId: s.orderId } }))!.lateCancellationFee)).toBe(5.2);
  });

  it('SaaS: 200, estorno de total − entrega (40) pela loja e MotoboyTransfer da entrega inteira (12)', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const res = await absent(s.deliveryId!, s.motoboy);
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBe(40);
    expect(Number((await prisma.directRefund.findUnique({ where: { orderId: s.orderId } }))!.amount)).toBe(40);
    const t = await prisma.motoboyTransfer.findMany({ where: { orderId: s.orderId } });
    expect(t.map((x) => [x.reason, x.motoboyId, Number(x.amount)])).toEqual([['cancellation_compensation', s.motoboy.userId, 12]]);
  });

  it('a entrega ainda indo à loja (assigned) continua recusada (400)', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' });
    expect((await absent(s.deliveryId!, s.motoboy)).status).toBe(400);
    expect((await prisma.order.findUnique({ where: { id: s.orderId } }))?.status).toBe('aguardando_motoboy');
  });
});
