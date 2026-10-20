/**
 * D3b-1 · P2.4 — estatísticas de cancelamento contam pela culpa quando quem cancelou foi o
 * admin. Cancelamento do admin com culpa que não é da loja sai das métricas da loja; culpa do
 * DROP não conta para ninguém; o cancelamento do próprio cliente continua contando como hoje.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitAdminOrderChanged: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cenarioCancel, limparCancel } from './helpers/d3b1Cancel';
import { countCustomerCancellations30d } from '../services/cancellation/faultStats';
import { adminCancelOrder } from '../services/adminOps/adminCancel';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p24.test';
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

type Kind = 'entregue' | 'self_customer' | 'admin_store' | 'admin_customer' | 'admin_motoboy' | 'admin_platform';

/** Loja com um pedido de cada tipo; os cancelamentos são gravados direto (só a contagem importa). */
async function lojaComPedidos(kinds: Kind[]) {
  const lojista = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja P24', isOpen: true } as any });
  const ids: string[] = [];
  for (const k of kinds) {
    const order = await prisma.order.create({
      data: {
        customerId: cliente.userId, storeId: store.id, totalValue: 30, deliveryFee: 10,
        paymentMethod: 'pix', paymentStatus: 'paid', status: k === 'entregue' ? 'entregue' : 'cancelado',
      } as any,
    });
    ids.push(order.id);
    if (k === 'entregue') continue;
    const admin = k.startsWith('admin_');
    await prisma.cancellation.create({
      data: {
        orderId: order.id,
        cancelledBy: admin ? 'admin' : 'customer',
        faultParty: admin ? (k.replace('admin_', '') as any) : null,
        adminId: admin ? ceo.userId : null,
        reason: admin ? 'Cancelado pelo suporte do DROP' : 'Solicitado pelo cliente',
        reasonCode: admin ? 'other' : 'customer_request',
        refundAmount: 30,
        refundStatus: 'processed',
      },
    });
  }
  return { lojista, cliente, storeId: store.id, ids };
}

const ALL: Kind[] = ['entregue', 'self_customer', 'admin_store', 'admin_customer', 'admin_motoboy', 'admin_platform'];

describe('métricas da loja', () => {
  it('stats da loja: só o cancelamento do próprio cliente e o do admin com culpa da loja contam', async () => {
    const l = await lojaComPedidos(ALL);
    const r = await request(app).get('/api/orders/stats/cancellations').set('Authorization', bearer(l.lojista));
    expect(r.status).toBe(200);
    expect(r.body.totalCancellations).toBe(2);
    expect(r.body.byReason.map((x: any) => x._id).sort()).toEqual(['customer_request', 'other']);
  });

  it('taxa da loja (30 dias): 2 cancelados de 6 pedidos = 33,3%', async () => {
    const l = await lojaComPedidos(ALL);
    const r = await request(app).get('/api/analytics/store/overview').set('Authorization', bearer(l.lojista));
    expect(r.status).toBe(200);
    expect(r.body.current.cancellationRate).toBe(33.3);
  });
});

describe('cliente 30 dias', () => {
  it('conta o cancelamento do próprio cliente e o do admin com culpa do cliente, nada mais', async () => {
    const l = await lojaComPedidos(ALL);
    expect(await countCustomerCancellations30d(l.cliente.userId)).toBe(2);
  });

  it('a janela é a do cancelamento: pedido antigo cancelado agora conta; cancelamento de 40 dias atrás não', async () => {
    const l = await lojaComPedidos(['entregue']);
    const old = await prisma.order.create({
      data: {
        customerId: l.cliente.userId, storeId: l.storeId, totalValue: 30, deliveryFee: 10, paymentMethod: 'pix',
        paymentStatus: 'paid', status: 'cancelado', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      } as any,
    });
    await prisma.cancellation.create({
      data: { orderId: old.id, cancelledBy: 'customer', reason: 'Solicitado pelo cliente', reasonCode: 'customer_request', refundAmount: 30, refundStatus: 'processed' },
    });
    const gone = await prisma.order.create({
      data: { customerId: l.cliente.userId, storeId: l.storeId, totalValue: 30, deliveryFee: 10, paymentMethod: 'pix', paymentStatus: 'paid', status: 'cancelado' } as any,
    });
    await prisma.cancellation.create({
      data: {
        orderId: gone.id, cancelledBy: 'customer', reason: 'Solicitado pelo cliente', reasonCode: 'customer_request',
        refundAmount: 30, refundStatus: 'processed', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await countCustomerCancellations30d(l.cliente.userId)).toBe(1);
  });

  it('o detalhe do pedido do admin mostra a mesma contagem (P1.5 passa a usar o helper)', async () => {
    const l = await lojaComPedidos(ALL);
    const r = await request(app).get(`/api/admin/orders/${l.ids[0]}`).set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    expect(r.body.customer.cancellations30d).toBe(2);
  });
});

describe('motoboy', () => {
  it('culpa do motoboy não cria pontos, multa nem cancelamento contado contra ele', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' });
    const pointsBefore = await prisma.gamification.findUnique({ where: { userId: s.motoboy.userId } });
    await adminCancelOrder({ orderId: s.orderId, fault: 'motoboy', reason: 'Motoboy parou de responder', actor: { id: ceo.userId, role: 'ceo' } });
    expect(await prisma.gamification.findUnique({ where: { userId: s.motoboy.userId } })).toEqual(pointsBefore);
    expect(await prisma.walletEntry.count({ where: { wallet: { owner: s.motoboy.userId }, category: 'penalty' } })).toBe(0);
    expect(await prisma.cancellation.count({ where: { orderId: s.orderId, cancelledBy: 'motoboy' } })).toBe(0);
  });
});
