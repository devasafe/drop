// src/tests/opreal.reembolsoPrazo.test.ts
/**
 * Caso B, fase 2: o prazo do arrependimento com valor integral (padrão 7 dias) e o tempo de
 * resposta da loja (padrão 48 h) ficam em Regras e taxas.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { returnRefund } from '../services/returnRequest';

const DOMAIN = '@reembolsoprazo.test';
const DAY = 24 * 60 * 60 * 1000;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

describe('Regras e taxas', () => {
  it.each([
    ['returnFullRefundDays', 1, 0],
    ['returnFullRefundDays', 90, 91],
    ['returnStoreResponseHours', 1, 0],
    ['returnStoreResponseHours', 240, 241],
  ])('%s: %p aceita, %p → 400', async (field, ok, bad) => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const put = (body: Record<string, unknown>) => request(app).put('/api/settings/platform-config').set('Authorization', bearer(ceo)).send(body);
    expect((await put({ [field]: ok })).status).toBe(200);
    const r = await put({ [field]: bad });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'INVALID_FIELD', field });
  });

  it('dias inteiros: fração é recusada', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const r = await request(app).put('/api/settings/platform-config').set('Authorization', bearer(ceo)).send({ returnFullRefundDays: 7.5 });
    expect(r.body).toMatchObject({ code: 'INVALID_FIELD', field: 'returnFullRefundDays' });
  });

  it('o padrão é 7 dias e 48 h', async () => {
    const cfg = await prisma.platformConfig.create({ data: { updatedBy: 'test-default' } as any });
    expect(cfg.returnFullRefundDays).toBe(7);
    expect(cfg.returnStoreResponseHours).toBe(48);
    await prisma.platformConfig.delete({ where: { id: cfg.id } });
  });
});

describe('o valor usa o prazo da configuração', () => {
  it('prazo de 3 dias: arrependimento com 5 dias volta sem a entrega; com 2 dias volta tudo', () => {
    const order = { totalValue: 244, deliveryFee: 14.1 };
    expect(returnRefund(order, new Date(Date.now() - 5 * DAY), 'arrependimento', new Date(), 3)).toEqual({ amount: 229.9, includesDeliveryFee: false });
    expect(returnRefund(order, new Date(Date.now() - 2 * DAY), 'arrependimento', new Date(), 3)).toEqual({ amount: 244, includesDeliveryFee: true });
  });

  it('a prévia do cliente lê o prazo de Regras e taxas', async () => {
    await updatePlatformConfig({ settlementMode: 'direto', returnFullRefundDays: 10 } as any, 'test');
    const dono = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Prazo', isOpen: true } as any });
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, totalValue: 244, deliveryFee: 14.1, paymentMethod: 'pix', paymentStatus: 'paid',
        status: 'entregue', paymentProvider: 'asaas_loja', asaasPaymentId: 'pay_prazo',
      } as any,
    });
    const d = await prisma.delivery.create({ data: { orderId: order.id, fee: 14.1, status: 'delivered', deliveredAt: new Date(Date.now() - 8 * DAY) } as any });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: d.id } as any });

    const r = await request(app).get(`/api/orders/${order.id}/return-request/preview`).set('Authorization', bearer(cliente));
    expect(r.body.amounts.arrependimento).toBe(244);
    expect(r.body.fullRefundDays).toBe(10);
  });
});
