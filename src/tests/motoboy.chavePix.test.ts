/**
 * Motoboy sem chave Pix no modo direto: aviso de verdade (sino + push) quando a transferência
 * nasce parada, valor parado em GET /motoboy/transfers e a trava no aceite/atribuição.
 */
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, sendPushToUser: jest.fn(async () => {}) };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { sendPushToUser } from '../services/pushService';
import { emitToRoom } from '../utils/socketEmitter';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@chavepix.test';
const push = sendPushToUser as jest.Mock;
const emit = emitToRoom as jest.Mock;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; await prisma.$disconnect(); });
beforeEach(async () => {
  push.mockClear();
  emit.mockClear();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'direto', motoboyShareDirect: 100, directTransferMaxAmount: 150 } as any, 'test');
});
afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const withPix = (m: TestUser) =>
  prisma.user.update({ where: { id: m.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });

async function setup(opts: { provider?: 'asaas' | 'asaas_loja'; status?: 'pending' | 'picked'; fee?: number; pix?: boolean; motoboy?: TestUser } = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja Chave Pix', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = opts.motoboy ?? (await createTestUser('motoboy', DOMAIN));
  if (opts.pix) await withPix(motoboy);
  const fee = opts.fee ?? 10;
  const status = opts.status ?? 'pending';
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 20 + fee, subtotal: 20, deliveryFee: fee,
      status: status === 'picked' ? 'enviado' : 'pago', paymentMethod: 'pix', paymentStatus: 'paid',
      paymentProvider: opts.provider ?? 'asaas_loja',
    } as any,
  });
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id, status, fee, distance: 4,
      ...(status === 'picked' ? { motoboyId: motoboy.userId, pin: '12345', pinRetirada: '54321' } : {}),
    } as any,
  });
  return { dono, store, order, delivery, motoboy };
}

const finalizar = (d: any, m: TestUser) => request(app).post(`/api/deliveries/${d.id}/finalizar`).set('Authorization', bearer(m)).send({ pin: '12345' });
const claim = (d: any, m: TestUser) => request(app).post(`/api/deliveries/${d.id}/claim`).set('Authorization', bearer(m)).send({});
const assign = (d: any, dono: TestUser, m: TestUser) =>
  request(app).put(`/api/deliveries/${d.id}/assign`).set('Authorization', bearer(dono)).send({ motoboyId: m.userId });

/** O aviso ao motoboy sai depois da resposta (best-effort): espera a linha aparecer. */
async function waitNotice(userId: string, title: string, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.notification.findFirst({ where: { userId, title } });
    if (row || Date.now() > end) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
}

const CLAIM_MSG = 'Cadastre sua chave Pix para pegar corridas: é por ela que você recebe.';
const ASSIGN_MSG = 'Este motoboy ainda não cadastrou a chave Pix e não pode receber por esta entrega.';

describe('aviso ao motoboy quando a transferência nasce sem chave Pix', () => {
  it('sem chave: grava a notificação do motoboy com o valor parado e o link do cadastro, manda o push e mantém o socket', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    // Uma transferência anterior dele já parada pelo mesmo motivo entra na soma.
    const antes = await setup({ status: 'picked', fee: 7.5, motoboy: m });
    expect((await finalizar(antes.delivery, m)).status).toBe(200);
    const c = await setup({ status: 'picked', fee: 12.25, motoboy: m });
    await prisma.notification.deleteMany({ where: { userId: m.userId } });
    push.mockClear();

    const res = await finalizar(c.delivery, m);
    expect(res.status).toBe(200);
    const row = await waitNotice(m.userId, 'Cadastre sua chave Pix');
    expect(row).toMatchObject({
      title: 'Cadastre sua chave Pix',
      message: 'Você tem R$ 19,75 de entregas para receber. Cadastre sua chave Pix para o dinheiro cair na sua conta.',
      link: '/dados-recebimento',
      read: false,
    });
    expect(push).toHaveBeenCalledWith(m.userId, expect.objectContaining({
      title: 'Cadastre sua chave Pix', url: '/dados-recebimento',
      body: 'Você tem R$ 19,75 de entregas para receber. Cadastre sua chave Pix para o dinheiro cair na sua conta.',
    }));
    expect(emit).toHaveBeenCalledWith(`user:${m.userId}`, 'motoboy:transfer_pix_key_missing', expect.objectContaining({ amount: 12.25 }));
  });

  it('com chave: nenhum aviso de chave Pix ao motoboy', async () => {
    const c = await setup({ status: 'picked', pix: true });
    const res = await finalizar(c.delivery, c.motoboy);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.notification.count({ where: { userId: c.motoboy.userId, title: 'Cadastre sua chave Pix' } })).toBe(0);
    expect(push).not.toHaveBeenCalledWith(c.motoboy.userId, expect.objectContaining({ title: 'Cadastre sua chave Pix' }));
  });
});

describe('GET /motoboy/transfers — valor parado esperando a chave Pix', () => {
  it('soma só as transferências do motoboy paradas por MOTOBOY_PIX_KEY_MISSING', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const a = await setup({ status: 'picked', fee: 10, motoboy: m });
    const b = await setup({ status: 'picked', fee: 5.5, motoboy: m });
    expect((await finalizar(a.delivery, m)).status).toBe(200);
    expect((await finalizar(b.delivery, m)).status).toBe(200);
    // Uma terceira, parada por outro motivo, não entra.
    const c = await setup({ status: 'picked', fee: 9, motoboy: m });
    expect((await finalizar(c.delivery, m)).status).toBe(200);
    await prisma.motoboyTransfer.updateMany({ where: { orderId: c.order.id }, data: { lastError: 'DAILY_LIMIT' } });

    const res = await request(app).get('/api/motoboy/transfers').set('Authorization', bearer(m));
    expect(res.status).toBe(200);
    expect(res.body.pixKeyMissing).toEqual({ count: 2, amount: 15.5 });
  });

  it('sem nada parado (ou já com a chave cadastrada): zero', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    const a = await setup({ status: 'picked', fee: 10, motoboy: m });
    expect((await finalizar(a.delivery, m)).status).toBe(200);
    // Cadastrou a chave: o Pix sai na próxima volta do job; a faixa já não aparece.
    await withPix(m);
    const res = await request(app).get('/api/motoboy/transfers').set('Authorization', bearer(m));
    expect(res.body.pixKeyMissing).toEqual({ count: 0, amount: 0 });
  });
});

describe('POST /deliveries/:id/claim — chave Pix obrigatória no modo direto', () => {
  it('pedido direto, motoboy sem chave: 409 MOTOBOY_PIX_KEY_REQUIRED e nada gravado', async () => {
    const c = await setup({ status: 'pending' });
    const res = await claim(c.delivery, c.motoboy);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: CLAIM_MSG, code: 'MOTOBOY_PIX_KEY_REQUIRED' });
    const d = await prisma.delivery.findUnique({ where: { id: c.delivery.id } });
    expect(d).toMatchObject({ status: 'pending', motoboyId: null, pin: null, pinRetirada: null });
  });

  it('pedido direto, motoboy com chave: aceita', async () => {
    const c = await setup({ status: 'pending', pix: true });
    const res = await claim(c.delivery, c.motoboy);
    expect(res.status).toBe(200);
    expect((await prisma.delivery.findUnique({ where: { id: c.delivery.id } }))).toMatchObject({ status: 'assigned', motoboyId: c.motoboy.userId });
  });

  it('pedido da custódia, motoboy sem chave: aceita como antes', async () => {
    const c = await setup({ status: 'pending', provider: 'asaas' });
    const res = await claim(c.delivery, c.motoboy);
    expect(res.status).toBe(200);
  });
});

describe('PUT /deliveries/:id/assign — chave Pix obrigatória no modo direto', () => {
  it('pedido direto, motoboy sem chave: 409 com a mensagem para a loja e nada gravado', async () => {
    const c = await setup({ status: 'pending' });
    const res = await assign(c.delivery, c.dono, c.motoboy);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: ASSIGN_MSG, code: 'MOTOBOY_PIX_KEY_REQUIRED' });
    expect(await prisma.delivery.findUnique({ where: { id: c.delivery.id } })).toMatchObject({ status: 'pending', motoboyId: null });
  });

  it('pedido direto, motoboy com chave: atribui', async () => {
    const c = await setup({ status: 'pending', pix: true });
    const res = await assign(c.delivery, c.dono, c.motoboy);
    expect(res.status).toBe(200);
  });

  it('pedido da custódia, motoboy sem chave: atribui como antes', async () => {
    const c = await setup({ status: 'pending', provider: 'asaas' });
    const res = await assign(c.delivery, c.dono, c.motoboy);
    expect(res.status).toBe(200);
  });
});
