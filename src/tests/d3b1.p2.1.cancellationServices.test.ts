/**
 * D3b-1 · P2.1 — as regras de cancelamento saem do controller para src/services/cancellation/
 * e recebem o ator. Sem `admin` nada muda (os testes antigos cobrem). Com `admin`, o
 * Cancellation grava cancelledBy 'admin' + faultParty + adminId + details, e a regra não manda
 * o aviso próprio do ator.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cenarioCancel, limparCancel } from './helpers/d3b1Cancel';
import * as controller from '../controllers/cancellationController';
import { cancelOrderWithFullRefund } from '../services/cancellation/fullRefund';
import { cancelOrderAsCustomerRule } from '../services/cancellation/customerRule';
import { cancelOrderAsStoreRule } from '../services/cancellation/storeRule';
import { customerCancelPreview } from '../services/cancellation/customerPreview';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p21.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let since = new Date();
let ceo: TestUser;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  await prisma.$disconnect();
});
beforeEach(async () => {
  since = new Date();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => { await limparCancel(DOMAIN, since); });

const load = async (id: string) => toApiOrder(await prisma.order.findUnique({ where: { id }, include: orderInclude }));
const lastCancellation = (orderId: string) => prisma.cancellation.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
const noticesOf = (userId: string) => prisma.notification.count({ where: { userId } });
const statusOf = async (orderId: string) => (await prisma.order.findUnique({ where: { id: orderId } }))?.status;

describe('extração das regras de cancelamento (P2.1)', () => {
  it('o controller reexporta a mesma cancelOrderWithFullRefund do serviço', () => {
    expect(controller.cancelOrderWithFullRefund).toBe(cancelOrderWithFullRefund);
  });

  it('regra do cliente com admin: grava admin + culpa + autor + details e não avisa a loja', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago', delivery: 'pending' });
    const r = await cancelOrderAsCustomerRule({
      order: await load(s.orderId), requestedBy: ceo.userId, reason: 'Cancelado pelo suporte do DROP', reasonCode: 'other',
      admin: { adminId: ceo.userId, fault: 'customer' }, details: 'cliente pediu pelo chat',
    });
    expect(r.status).toBe(200);
    expect(r.refundAmount).toBe(52);
    expect(r.refundStatus).toBe('processed');
    expect(r.cancellation?.id).toBeTruthy();
    expect(await lastCancellation(s.orderId)).toMatchObject({
      cancelledBy: 'admin', faultParty: 'customer', adminId: ceo.userId, details: 'cliente pediu pelo chat',
      reason: 'Cancelado pelo suporte do DROP', reasonCode: 'other',
    });
    expect(await statusOf(s.orderId)).toBe('cancelado');
    expect(await noticesOf(s.lojista.userId)).toBe(0);
  });

  it('regra do cliente sem admin: cancelledBy customer, sem culpa, e a loja recebe o aviso de sempre', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago', delivery: 'pending' });
    const r = await cancelOrderAsCustomerRule({ order: await load(s.orderId), requestedBy: s.cliente.userId });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, status: 'cancelado', refundAmount: 52, refundStatus: 'processed' });
    expect(await lastCancellation(s.orderId)).toMatchObject({ cancelledBy: 'customer', faultParty: null, adminId: null });
    expect(await noticesOf(s.lojista.userId)).toBe(1);
  });

  it('regra da loja com admin: aceita pedido em rota, termina em cancelado e compensa o motoboy pela loja', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'enviado', delivery: 'picked' });
    const r = await cancelOrderAsStoreRule({
      order: await load(s.orderId), requestedBy: ceo.userId, reason: 'Cancelado pelo suporte do DROP', reasonCode: 'other',
      admin: { adminId: ceo.userId, fault: 'store' },
    });
    expect(r.status).toBe(200);
    expect(r.refundAmount).toBe(52);
    expect(await statusOf(s.orderId)).toBe('cancelado');
    expect(await lastCancellation(s.orderId)).toMatchObject({ cancelledBy: 'admin', faultParty: 'store', adminId: ceo.userId });
    const comp = await prisma.payout.findMany({ where: { orderId: s.orderId, recipientType: 'motoboy' } });
    expect(comp.map((p) => Number(p.amount))).toEqual([0.6]);
    expect(comp[0].status).toBe('released');
  });

  it('regra da loja sem admin: pedido em rota continua recusado (400) e nada muda', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'enviado', delivery: 'picked' });
    const r = await cancelOrderAsStoreRule({ order: await load(s.orderId), requestedBy: s.lojista.userId });
    expect(r.status).toBe(400);
    expect(r.refusal).toBe('NOT_CANCELLABLE');
    expect(await statusOf(s.orderId)).toBe('enviado');
    expect(await prisma.cancellation.count({ where: { orderId: s.orderId } })).toBe(0);
  });

  it('cancelOrderWithFullRefund com admin grava a culpa e não manda o aviso da loja', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago', delivery: 'pending' });
    const r = await cancelOrderWithFullRefund(await load(s.orderId), {
      reason: 'Cancelado pelo suporte do DROP', reasonCode: 'other', cancelledBy: 'motoboy',
      admin: { adminId: ceo.userId, fault: 'motoboy' }, details: 'motoboy sumiu',
    });
    expect(r.ok).toBe(true);
    expect(r.refundAmount).toBe(52);
    expect(await lastCancellation(s.orderId)).toMatchObject({ cancelledBy: 'admin', faultParty: 'motoboy', adminId: ceo.userId, details: 'motoboy sumiu' });
    expect(await noticesOf(s.lojista.userId)).toBe(0);
  });

  it('customerCancelPreview devolve exatamente o `data` do GET /orders/:id/cancel-preview', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'enviado', delivery: 'picked' });
    const http = await request(app).get(`/api/orders/${s.orderId}/cancel-preview`).set('Authorization', bearer(s.cliente));
    expect(http.status).toBe(200);
    expect(await customerCancelPreview(await load(s.orderId))).toEqual(http.body.data);
    expect(http.body.data).toMatchObject({ cancellable: true, fee: 12, refund: 40, motoboyEnRoute: true });
  });
});
