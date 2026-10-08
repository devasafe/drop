/**
 * Task 2.1 — MotoboyTransfer registrada no PIN de entrega (modo direto).
 * Só REGISTRA a transferência (pending); o envio Pix é da 2.3.
 */
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { decryptSensitiveData } from '../utils/encryption';
import { emitToRoom } from '../utils/socketEmitter';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { maskPixKey } from '../services/asaasLoja/motoboyTransfer';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@saas21.test';
const emit = emitToRoom as jest.Mock;
let restore: () => Promise<void>;
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  emit.mockClear();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'direto', motoboyShareDirect: 100, directTransferMaxAmount: 150 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup(opts: { provider?: 'asaas' | 'asaas_loja'; fee?: number; pix?: boolean } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja 21', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  if (opts.pix !== false) {
    await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  }
  const fee = opts.fee ?? 10;
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, totalValue: 20 + fee, subtotal: 20, deliveryFee: fee,
      status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', paymentProvider: opts.provider ?? 'asaas_loja',
    } as any,
  });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, status: 'picked', motoboyId: motoboy.userId, fee, distance: 4, pin: '12345', pinRetirada: '54321' },
  });
  return { order, delivery, motoboy };
}
const finalizar = (d: any, m: any) => request(app).post(`/api/deliveries/${d.id}/finalizar`).set('Authorization', bearer(m)).send({ pin: '12345' });

describe('maskPixKey', () => {
  it('formatos', () => {
    expect(maskPixKey('12345678912')).toBe('***.***.***-12');
    expect(maskPixKey('joao@gmail.com')).toBe('j***@g***.com');
    expect(maskPixKey('21987651234', 'PHONE')).toBe('(**) *****-1234');
    expect(maskPixKey('+5521987651234')).toBe('(**) *****-1234');
    const m = maskPixKey('123e4567-e89b-12d3-a456-426614174000');
    expect(m).not.toContain('e89b');
    expect(m.length).toBeLessThan(36);
  });
});

describe('transferência no PIN de entrega', () => {
  it('pedido direto → 1 transfer pending, valor, chave cifrada, sem Payout', async () => {
    await updatePlatformConfig({ motoboyShareDirect: 80 } as any, 'test');
    const { order, delivery, motoboy } = await setup();
    const res = await finalizar(delivery, motoboy);
    expect(res.status).toBe(200);
    expect((await prisma.delivery.findUnique({ where: { id: delivery.id } }))!.status).toBe('delivered');
    const ts = await prisma.motoboyTransfer.findMany({ where: { deliveryId: delivery.id } });
    expect(ts).toHaveLength(1);
    expect(ts[0].status).toBe('pending');
    expect(Number(ts[0].amount)).toBe(8);
    expect(ts[0].reason).toBe('delivery');
    expect(ts[0].storeId).toBe(order.storeId);
    expect(ts[0].motoboyId).toBe(motoboy.userId);
    expect(ts[0].pixKeyEncrypted).not.toContain('12345678909');
    expect(decryptSensitiveData(ts[0].pixKeyEncrypted)).toBe('12345678909');
    expect(ts[0].pixKeyType).toBe('CPF');
    expect(await prisma.payout.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('acima do teto → failed_final AMOUNT_OVER_LIMIT, alerta admin, entrega conclui', async () => {
    const { delivery, motoboy } = await setup({ fee: 200 });
    const res = await finalizar(delivery, motoboy);
    expect(res.status).toBe(200);
    const t = (await prisma.motoboyTransfer.findUnique({ where: { deliveryId: delivery.id } }))!;
    expect(t.status).toBe('failed_final');
    expect(t.lastError).toBe('AMOUNT_OVER_LIMIT');
    expect(emit.mock.calls.some((c) => c[0] === 'admin')).toBe(true);
    expect(JSON.stringify(emit.mock.calls)).not.toContain('12345678909');
  });

  it('finalizar concorrente → uma 200, outra 4xx, 1 linha', async () => {
    const { delivery, motoboy } = await setup();
    const [a, b] = await Promise.all([finalizar(delivery, motoboy), finalizar(delivery, motoboy)]);
    const codes = [a.status, b.status].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);
    expect(codes[1]).toBeLessThan(500);
    expect(await prisma.motoboyTransfer.count({ where: { deliveryId: delivery.id } })).toBe(1);
  });

  it('motoboy sem chave Pix → failed MOTOBOY_PIX_KEY_MISSING, notifica motoboy e admin', async () => {
    const { delivery, motoboy } = await setup({ pix: false });
    const res = await finalizar(delivery, motoboy);
    expect(res.status).toBe(200);
    const t = (await prisma.motoboyTransfer.findUnique({ where: { deliveryId: delivery.id } }))!;
    expect(t.status).toBe('failed');
    expect(t.lastError).toBe('MOTOBOY_PIX_KEY_MISSING');
    expect(t.pixKeyEncrypted).toBe('');
    expect(t.pixKeyType).toBe('');
    const rooms = emit.mock.calls.map((c) => c[0]);
    expect(rooms).toContain(`user:${motoboy.userId}`);
    expect(rooms).toContain('admin');
  });

  it('pedido de custódia → nenhum MotoboyTransfer', async () => {
    const { delivery, motoboy } = await setup({ provider: 'asaas' });
    const res = await finalizar(delivery, motoboy);
    expect(res.status).toBe(200);
    expect(await prisma.motoboyTransfer.count({ where: { deliveryId: delivery.id } })).toBe(0);
  });
});
