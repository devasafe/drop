// src/tests/opreal.devolucaoReembolso.test.ts
/**
 * Motoboy desistiu com o pacote na mão e o cliente escolheu reembolso. Regra: o dinheiro só volta
 * quando a loja confirma o pacote com o PIN de devolução. A escolha fica gravada
 * (pendingReturnAction='cancel') e a loja vê "pediu o dinheiro de volta". No modo SaaS, a
 * confirmação estorna pela chave da loja (antes só escalava para o admin).
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
import { emitToRoom } from '../utils/socketEmitter';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig, wipeAppCashbox } from './helpers/pgCleanup';
import { createWallet, findWallet, createAppCashbox } from './helpers/financePg';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@devreembolso.test';
const STORE_KEY = '$aact_hmlg_LOJA_DEVR';
const postAs = asaasClient.postAs as jest.Mock;
const emit = emitToRoom as jest.Mock;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); await wipeAppCashbox(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(() => { jest.clearAllMocks(); postAs.mockReset(); emit.mockReset(); });
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
  await wipeAppCashbox();
});

async function cenario(direct: boolean) {
  await updatePlatformConfig({ settlementMode: direct ? 'direto' : 'custodia' } as any, 'test');
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await createWallet({ owner: cliente.userId, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
  await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro Center', isOpen: true } as any });
  if (direct) {
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'DEVR', environment: 'sandbox', status: 'valid' },
    });
  }
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, subtotal: 180, totalValue: 200, deliveryFee: 20, paymentMethod: 'pix',
      paymentStatus: 'paid', status: 'enviado', acceptedAt: new Date(),
      ...(direct ? { paymentProvider: 'asaas_loja', asaasChargeStatus: 'received', asaasPaymentId: `pay_devr_${Math.random().toString(36).slice(2, 8)}` } : {}),
    } as any,
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: motoboy.userId, fee: 20, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '777777' } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { dono, cliente, store, order, delivery };
}

const escolherReembolso = (orderId: string, who: any) =>
  request(app).post(`/api/orders/${orderId}/pos-devolucao`).set('Authorization', bearer(who)).send({ escolha: 'reembolso' });
const confirmar = (deliveryId: string, who: any) =>
  request(app).post(`/api/deliveries/${deliveryId}/confirm-return`).set('Authorization', bearer(who)).send({ pinDevolucao: '777777' });

describe('cliente escolhe reembolso com o pacote voltando', () => {
  it('nada de dinheiro na hora: grava a escolha, a devolução segue e a loja é avisada', async () => {
    const { cliente, store, order, delivery } = await cenario(false);
    const r = await escolherReembolso(order.id, cliente);
    expect(r.status).toBe(200);
    expect(r.body.escolha).toBe('reembolso');

    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o!.status).toBe('enviado');
    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d!.pendingReturnAction).toBe('cancel');
    expect(d!.statusDevolucao).toBe('aguardando_confirmacao');
    expect(d!.pinDevolucao).toBe('777777');
    const w = await findWallet({ owner: cliente.userId, ownerType: 'user' });
    expect(w!.balance).toBeCloseTo(500, 2);

    const toStore = emit.mock.calls.filter((c) => c[0] === `store:${store.id}` && c[1] === 'order:updated');
    expect(toStore).toHaveLength(1);
    expect(toStore[0][2]).toMatchObject({ orderId: order.id, pendingReturnAction: 'cancel' });
  });

  it('custódia: a loja digita o PIN e o valor inteiro volta uma vez', async () => {
    const { dono, cliente, order, delivery } = await cenario(false);
    await escolherReembolso(order.id, cliente);
    const c = await confirmar(delivery.id, dono);
    expect(c.status).toBe(200);

    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o!.status).toBe('cancelado');
    const w = await findWallet({ owner: cliente.userId, ownerType: 'user' });
    expect(w!.balance).toBeCloseTo(700, 2);
    expect(w!.history.filter((h: any) => h.category === 'refund')).toHaveLength(1);
  });

  it('modo SaaS: a loja digita o PIN e o estorno integral sai pela chave da loja', async () => {
    postAs.mockResolvedValue({ id: 'ref_devr', status: 'REFUNDED' });
    const { dono, cliente, order, delivery } = await cenario(true);
    await escolherReembolso(order.id, cliente);
    expect(postAs).not.toHaveBeenCalled();

    const c = await confirmar(delivery.id, dono);
    expect(c.status).toBe(200);
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][0]).toBe(STORE_KEY);
    expect(postAs.mock.calls[0][1]).toBe(`/payments/${(await prisma.order.findUnique({ where: { id: order.id } }))!.asaasPaymentId}/refund`);
    expect(postAs.mock.calls[0][2].value).toBe(200);

    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o!.status).toBe('cancelado');
    const d = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(d!.statusDevolucao).toBe('confirmado');
    expect(d!.pinDevolucao).toBeNull();
  });

  it('modo SaaS sem escolha do cliente: confirmar o pacote também estorna (o padrão é cancelar)', async () => {
    postAs.mockResolvedValue({ id: 'ref_devr2', status: 'REFUNDED' });
    const { dono, order, delivery } = await cenario(true);
    const c = await confirmar(delivery.id, dono);
    expect(c.status).toBe(200);
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][2].value).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('cancelado');
  });
});
