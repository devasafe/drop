// src/tests/opreal.devolucaoPixTaxa.test.ts
/**
 * Caso B, fase 2c: no arrependimento, "Chamar um motoboy" cobra a corrida de volta do cliente por
 * Pix na conta Asaas da LOJA (a loja paga o motoboy depois, como na 2b). A corrida só nasce com o
 * Pix pago (webhook da loja ou "Já paguei", que consulta o Asaas). Antes de pagar, o cliente pode
 * trocar para "Levo na loja" e a cobrança é excluída.
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
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn(async () => ({ distanceKm: 4, durationSec: 900, polyline: 'abc', source: 'test' })) };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitDeliveryCreated: jest.fn() };
});

import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@devolucaopix.test';
const STORE_KEY = '$aact_hmlg_LOJA_DPIX';
const WEBHOOK_TOKEN = 'w'.repeat(48);
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const postAs = asaasClient.postAs as jest.Mock;
const getAs = asaasClient.getAs as jest.Mock;
const deleteAs = asaasClient.deleteAs as jest.Mock;
let restore: () => Promise<void>;
let payN = 0;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset(); getAs.mockReset(); deleteAs.mockReset();
  postAs.mockImplementation(async (_k: string, path: string) => {
    if (path === '/customers') return { id: 'cus_dpix' };
    if (path === '/payments') return { id: `pay_taxa_${++payN}`, status: 'PENDING' };
    return { id: 'ref_x', status: 'REFUNDED' };
  });
  getAs.mockImplementation(async (_k: string, path: string) => {
    if (path.endsWith('/pixQrCode')) return { encodedImage: 'iVBORbase64', payload: '00020126pix-copia-e-cola', expirationDate: '2099-01-01 23:59:59' };
    return { status: 'PENDING' };
  });
  deleteAs.mockResolvedValue({ deleted: true });
  await updatePlatformConfig({ settlementMode: 'direto', motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyShareDirect: 100 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.returnRequest.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function arrependimentoAprovado() {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: '52998224725' } as any });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro Center', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({
    data: {
      storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'DPIX', environment: 'sandbox', status: 'valid',
      paymentWebhookId: 'wh_dpix', paymentWebhookTokenHash: sha(WEBHOOK_TOKEN),
    } as any,
  });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, subtotal: 229.9, totalValue: 244, deliveryFee: 14.1, paymentMethod: 'pix', paymentStatus: 'paid',
      status: 'entregue', paymentProvider: 'asaas_loja', asaasChargeStatus: 'received', asaasPaymentId: `pay_ord_${Math.random().toString(36).slice(2, 8)}`,
      storeAddress: 'R. dos Pinheiros, 870', storeLatitude: -23.56, storeLongitude: -46.69,
      customerAddress: 'R. Aurora, 112', customerLatitude: -23.54, customerLongitude: -46.64,
    } as any,
  });
  const rr = await prisma.returnRequest.create({
    data: { orderId: order.id, customerId: cliente.userId, storeId: store.id, reason: 'arrependimento', amount: 229.9, includesDeliveryFee: false, status: 'aprovado' },
  });
  return { dono, cliente, store, order, rr };
}

const mode = (rrId: string, who: any, m: string) => request(app).post(`/api/return-requests/${rrId}/mode`).set('Authorization', bearer(who)).send({ mode: m });
const rideOf = (rrId: string) => prisma.delivery.findFirst({ where: { returnRequestId: rrId } as any });
const webhook = (storeId: string, paymentId: string, event = 'PAYMENT_RECEIVED') =>
  request(app).post(`/webhooks/asaas/loja/${storeId}`).set('asaas-access-token', WEBHOOK_TOKEN)
    .send({ id: `evt_${paymentId}_${event}_${Math.random()}`, event, payment: { id: paymentId, status: event === 'PAYMENT_CONFIRMED' ? 'CONFIRMED' : 'RECEIVED' } });

describe('arrependimento: chamar um motoboy cobra a corrida por Pix', () => {
  it('cria o Pix da taxa na conta da loja e espera o pagamento; nada de corrida ainda', async () => {
    const { cliente, rr } = await arrependimentoAprovado();
    const r = await mode(rr.id, cliente, 'motoboy');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'aguardando_pagamento', mode: 'motoboy', feeAmount: 9 });
    expect(r.body.feePix).toMatchObject({ qrCodePayload: '00020126pix-copia-e-cola', qrCodeImage: 'iVBORbase64' });

    const charge = postAs.mock.calls.find((c) => c[1] === '/payments');
    expect(charge[0]).toBe(STORE_KEY);
    expect(charge[2]).toMatchObject({ billingType: 'PIX', value: 9, externalReference: `return:${rr.id}` });
    expect(await rideOf(rr.id)).toBeNull();
  });

  it('o webhook da loja confirma o Pix: a corrida entra no pool com a taxa paga, uma vez só', async () => {
    const { cliente, store, rr } = await arrependimentoAprovado();
    await mode(rr.id, cliente, 'motoboy');
    const paymentId = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }) as any).feeAsaasPaymentId;

    expect((await webhook(store.id, paymentId)).status).toBe(200);
    const after: any = await prisma.returnRequest.findUnique({ where: { id: rr.id } });
    expect(after.status).toBe('devolvendo');
    expect(after.feePaidAt).toBeInstanceOf(Date);
    expect(after.pin).toMatch(/^\d{5}$/);
    const ride: any = await rideOf(rr.id);
    expect(ride).toMatchObject({ kind: 'devolucao', status: 'pending' });
    expect(Number(ride.fee)).toBe(9);

    await webhook(store.id, paymentId, 'PAYMENT_CONFIRMED');
    expect(await prisma.delivery.count({ where: { returnRequestId: rr.id } as any })).toBe(1);
  });

  it('"Já paguei" consulta o Asaas: pago → corrida; ainda pendente → continua esperando', async () => {
    const { cliente, rr } = await arrependimentoAprovado();
    await mode(rr.id, cliente, 'motoboy');
    const check = () => request(app).post(`/api/return-requests/${rr.id}/fee/check`).set('Authorization', bearer(cliente)).send({});

    const pend = await check();
    expect(pend.status).toBe(200);
    expect(pend.body.status).toBe('aguardando_pagamento');
    expect(await rideOf(rr.id)).toBeNull();

    getAs.mockImplementation(async (_k: string, path: string) => (path.endsWith('/pixQrCode') ? {} : { status: 'RECEIVED' }));
    const paid = await check();
    expect(paid.body.status).toBe('devolvendo');
    expect(paid.body.ride).toMatchObject({ status: 'pending' });
    expect(await rideOf(rr.id)).not.toBeNull();
  });

  it('antes de pagar, trocar para "Levo na loja" exclui a cobrança e gera o código', async () => {
    const { cliente, store, rr } = await arrependimentoAprovado();
    await mode(rr.id, cliente, 'motoboy');
    const paymentId = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }) as any).feeAsaasPaymentId;
    const r = await mode(rr.id, cliente, 'loja');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'devolvendo', mode: 'loja' });
    expect(r.body.pin).toMatch(/^\d{5}$/);
    expect(deleteAs).toHaveBeenCalledWith(STORE_KEY, `/payments/${paymentId}`);

    // Um webhook atrasado da cobrança excluída não cria corrida.
    await webhook(store.id, paymentId);
    expect(await rideOf(rr.id)).toBeNull();
  });

  it('loja sem conta Asaas pronta: 409 explicado e nada muda', async () => {
    const { cliente, store, rr } = await arrependimentoAprovado();
    await prisma.storeAsaasAccount.update({ where: { storeId: store.id }, data: { status: 'invalid' } as any });
    const r = await mode(rr.id, cliente, 'motoboy');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('STORE_PAYMENTS_NOT_READY');
    expect((await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.status).toBe('aprovado');
  });

  it('webhook de outra loja não confirma a taxa', async () => {
    const { cliente, rr } = await arrependimentoAprovado();
    const outra = await arrependimentoAprovado();
    await mode(rr.id, cliente, 'motoboy');
    const paymentId = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }) as any).feeAsaasPaymentId;
    await webhook(outra.store.id, paymentId);
    expect((await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.status).toBe('aguardando_pagamento');
  });

  it('o reembolso não inclui a taxa da corrida: continua o valor dos produtos', async () => {
    const { cliente, store, rr } = await arrependimentoAprovado();
    await mode(rr.id, cliente, 'motoboy');
    const paymentId = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }) as any).feeAsaasPaymentId;
    await webhook(store.id, paymentId);
    expect(Number((await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.amount)).toBe(229.9);
  });
});
