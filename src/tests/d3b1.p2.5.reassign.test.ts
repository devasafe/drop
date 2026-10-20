/**
 * D3b-1 · P2.5 — reatribuir motoboy (spec 4.3): só antes da retirada, sem punição, e o motoboy
 * que saiu não recebe a mesma corrida de novo (lista, claim e assign). Corrida contra a
 * retirada: só um vence.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return {
    __esModule: true, ...actual,
    emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitAdminOrderChanged: jest.fn(),
    emitDeliveryCreated: jest.fn(), emitDeliveryStatusChanged: jest.fn(),
  };
});

import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { emitAdminOrderChanged, emitDeliveryCreated, emitToRoom } from '../utils/socketEmitter';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createWallet } from './helpers/financePg';
import { criarCorrida, limparCorridas, RIDE_PIN_RETIRADA, Ride } from './helpers/motoboyRide';
import { adminCancelOrder } from '../services/adminOps/adminCancel';
import { adminReassignDelivery } from '../services/adminOps/reassign';
import { runPoolTimeout } from '../jobs/poolTimeout.job';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p25.test';
const OLD = new Date('2020-01-02T00:00:00.000Z');
const TOUCHED: Role = 'gerente_lojistas';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let snapshot: { role: Role; permissions: string[]; notificationTargets: Role[]; updatedBy: string }[] = [];
let restore: () => Promise<void>;
let since = new Date();
let ceo: TestUser;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  snapshot = await prisma.rolePermissions.findMany({
    where: { role: TOUCHED },
    select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
  });
});
beforeEach(async () => {
  since = new Date();
  jest.clearAllMocks();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await limparCorridas(DOMAIN, since);
});
afterAll(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
  for (const row of snapshot) await prisma.rolePermissions.create({ data: row });
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
  await prisma.$disconnect();
});

const REASON = 'Motoboy parado há 25 minutos sem ir à loja';
const reassign = (orderId: string, u: TestUser = ceo, reason: string = REASON) =>
  request(app).post(`/api/admin/orders/${orderId}/reassign`).set('Authorization', bearer(u)).send({ reason });
const pickup = (r: Ride) =>
  request(app).post(`/api/deliveries/${r.deliveryId}/validar-pin-retirada`).set('Authorization', bearer(r.dono)).send({ pinRetirada: RIDE_PIN_RETIRADA });
const deliveryOf = (id: string) => prisma.delivery.findUnique({ where: { id } });

/** Corrida assigned, criada "há muito tempo" (primeira do pool, raio aberto a todos). */
async function corridaAtribuida(): Promise<Ride> {
  const r = await criarCorrida(DOMAIN, { status: 'assigned' });
  await prisma.delivery.update({ where: { id: r.deliveryId }, data: { createdAt: OLD } });
  await prisma.user.update({ where: { id: r.motoboy.userId }, data: { isOnline: true } as any });
  return r;
}

async function outroMotoboy(): Promise<TestUser> {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: m.userId }, data: { isOnline: true } as any });
  return m;
}

describe('reatribuir antes da retirada', () => {
  it('assigned → pending, motoboy excluído, pedido aguardando motoboy, sem punição e com registro', async () => {
    const r = await corridaAtribuida();
    const antes = Date.now();
    const res = await reassign(r.orderId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const d = await deliveryOf(r.deliveryId);
    expect(d).toMatchObject({
      status: 'pending', motoboyId: null, assignedAt: null, pin: null, pinRetirada: null,
      excludedMotoboyIds: [r.motoboy.userId],
    });
    // Decisão do usuário (correções finais): reatribuir zera o relógio do pool (raio e pool timeout recomeçam).
    expect(d!.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect((await prisma.order.findUnique({ where: { id: r.orderId } }))?.status).toBe('aguardando_motoboy');

    const oa = await prisma.adminOrderAction.findMany({ where: { orderId: r.orderId } });
    expect(oa).toHaveLength(1);
    expect(oa[0]).toMatchObject({ action: 'reassign', actorId: ceo.userId, actorRole: 'ceo', reason: REASON, faultParty: null });
    expect(oa[0].details).toEqual({ deliveryId: r.deliveryId, previousMotoboyId: r.motoboy.userId });

    // Sem punição: nenhum cancelamento, multa ou ponto.
    expect(await prisma.cancellation.count({ where: { orderId: r.orderId } })).toBe(0);
    expect(await prisma.walletEntry.count({ where: { wallet: { owner: r.motoboy.userId } } })).toBe(0);
    expect(await prisma.gamification.findUnique({ where: { userId: r.motoboy.userId } })).toBeNull();

    // Avisos: motoboy que saiu, loja, pool e admin.
    const toMotoboy = await prisma.notification.findMany({ where: { userId: r.motoboy.userId } });
    expect(toMotoboy.map((n) => n.title)).toEqual(['Corrida passada para outro motoboy']);
    expect(toMotoboy[0].message).toContain(`#${r.orderId.slice(-6)}`);
    expect((await prisma.notification.findMany({ where: { userId: r.dono.userId } })).map((n) => n.title)).toEqual(['Buscando outro motoboy']);
    expect(emitToRoom).toHaveBeenCalledWith(`user:${r.motoboy.userId}`, 'delivery:you_were_reassigned', expect.objectContaining({ deliveryId: r.deliveryId }));
    expect(emitDeliveryCreated).toHaveBeenCalledWith(expect.objectContaining({ _id: r.deliveryId, orderId: r.orderId }));
    expect(emitAdminOrderChanged).toHaveBeenCalledWith(r.orderId, 'aguardando_motoboy');
  });

  it('entrega antiga reatribuída não dispara o pool timeout logo em seguida', async () => {
    const r = await corridaAtribuida();
    await prisma.delivery.update({ where: { id: r.deliveryId }, data: { createdAt: new Date(Date.now() - 40 * 60000) } });
    expect((await reassign(r.orderId)).status).toBe(200);
    await runPoolTimeout();
    expect((await prisma.order.findUnique({ where: { id: r.orderId } }))?.awaitingCustomerPoolDecision).toBe(false);
  });

  it('o excluído não vê a oferta e o claim dele dá 409; outro motoboy vê e pega', async () => {
    const r = await corridaAtribuida();
    const m2 = await outroMotoboy();
    expect((await reassign(r.orderId)).status).toBe(200);

    const listOf = async (u: TestUser) => {
      const l = await request(app).get('/api/deliveries/available?limit=100').set('Authorization', bearer(u));
      expect(l.status).toBe(200);
      return l.body.deliveries as any[];
    };
    const excludedList = await listOf(r.motoboy);
    expect(excludedList.map((d) => String(d._id ?? d.id))).not.toContain(r.deliveryId);
    const otherList = await listOf(m2);
    const offer = otherList.find((d) => String(d._id ?? d.id) === r.deliveryId);
    expect(offer).toBeDefined();
    expect(offer).not.toHaveProperty('excludedMotoboyIds');

    const claimExcluded = await request(app).post(`/api/deliveries/${r.deliveryId}/claim`).set('Authorization', bearer(r.motoboy));
    expect(claimExcluded.status).toBe(409);
    expect(claimExcluded.body.code).toBe('DELIVERY_NOT_AVAILABLE');

    const claimOther = await request(app).post(`/api/deliveries/${r.deliveryId}/claim`).set('Authorization', bearer(m2));
    expect(claimOther.status).toBe(200);
    expect(await deliveryOf(r.deliveryId)).toMatchObject({ status: 'assigned', motoboyId: m2.userId });
  });

  it('a loja não consegue atribuir de novo o motoboy excluído (409 DELIVERY_NOT_AVAILABLE)', async () => {
    const r = await corridaAtribuida();
    expect((await reassign(r.orderId)).status).toBe(200);
    const res = await request(app).put(`/api/deliveries/${r.deliveryId}/assign`).set('Authorization', bearer(r.dono)).send({ motoboyId: r.motoboy.userId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELIVERY_NOT_AVAILABLE');
    expect((await deliveryOf(r.deliveryId))?.status).toBe('pending');
  });
});

describe('recusas', () => {
  it('entrega já retirada → 409 DELIVERY_NOT_REASSIGNABLE e nada muda', async () => {
    const r = await criarCorrida(DOMAIN, { status: 'picked' });
    const res = await reassign(r.orderId);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'DELIVERY_NOT_REASSIGNABLE', currentStatus: 'picked' });
    expect(await deliveryOf(r.deliveryId)).toMatchObject({ status: 'picked', motoboyId: r.motoboy.userId, excludedMotoboyIds: [] });
    expect(await prisma.adminOrderAction.count({ where: { orderId: r.orderId } })).toBe(0);
  });

  it('entrega no pool (sem motoboy) → 409 DELIVERY_NOT_REASSIGNABLE', async () => {
    const r = await criarCorrida(DOMAIN, { status: 'pending' });
    const res = await reassign(r.orderId);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'DELIVERY_NOT_REASSIGNABLE', currentStatus: 'pending' });
  });

  it('com order:reassign concedido a um gerente → 200 e o registro guarda o papel dele', async () => {
    const r = await corridaAtribuida();
    const gerente = await createTestUser(TOUCHED, DOMAIN);
    await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
    expect((await reassign(r.orderId, gerente)).status).toBe(403);
    await prisma.rolePermissions.create({ data: { role: TOUCHED, permissions: ['order:reassign'], notificationTargets: [], updatedBy: 'test' } });
    expect((await reassign(r.orderId, gerente)).status).toBe(200);
    const [oa] = await prisma.adminOrderAction.findMany({ where: { orderId: r.orderId } });
    expect(oa).toMatchObject({ action: 'reassign', actorId: gerente.userId, actorRole: TOUCHED });
  });

  it('o badge de corridas do motoboy excluído não conta a corrida', async () => {
    const r = await corridaAtribuida();
    const m2 = await outroMotoboy();
    expect((await reassign(r.orderId)).status).toBe(200);
    const badge = async (u: TestUser) => (await request(app).get('/api/badges').set('Authorization', bearer(u))).body.deliveries as number;
    expect((await badge(m2)) - (await badge(r.motoboy))).toBe(1);
  });

  it('motivo curto 400, pedido inexistente 404, sem order:reassign 403', async () => {
    const r = await corridaAtribuida();
    const short = await reassign(r.orderId, ceo, 'oi');
    expect(short.status).toBe(400);
    expect(short.body.code).toBe('REASON_REQUIRED');
    const nf = await reassign('nao-existe');
    expect(nf.status).toBe(404);
    expect(nf.body.code).toBe('ORDER_NOT_FOUND');
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    expect((await reassign(r.orderId, gerente)).status).toBe(403);
    expect((await deliveryOf(r.deliveryId))?.status).toBe('assigned');
  });
});

describe('corrida reassign × retirada', () => {
  it('só um vence, e o estado final é o do vencedor (3 rodadas)', async () => {
    for (let i = 0; i < 3; i += 1) {
      const r = await criarCorrida(DOMAIN, { status: 'assigned' });
      const [ra, pk] = await Promise.all([reassign(r.orderId), pickup(r)]);
      const wins = [ra.status, pk.status].filter((s) => s === 200);
      expect(wins).toHaveLength(1);
      const d = await deliveryOf(r.deliveryId);
      if (ra.status === 200) {
        expect([400, 409]).toContain(pk.status);
        expect(d).toMatchObject({ status: 'pending', motoboyId: null, excludedMotoboyIds: [r.motoboy.userId] });
        expect(await prisma.adminOrderAction.count({ where: { orderId: r.orderId } })).toBe(1);
      } else {
        expect(ra.status).toBe(409);
        expect(['DELIVERY_CHANGED', 'DELIVERY_NOT_REASSIGNABLE']).toContain(ra.body.code);
        expect(ra.body.currentStatus).toBe('picked');
        expect(d).toMatchObject({ status: 'picked', motoboyId: r.motoboy.userId, excludedMotoboyIds: [] });
        expect(await prisma.adminOrderAction.count({ where: { orderId: r.orderId } })).toBe(0);
      }
    }
  });

  it('reassign entre a leitura e a trava da recusa (admin, culpa da loja): o motoboy que saiu não é compensado', async () => {
    const r = await criarCorrida(DOMAIN, { status: 'assigned' });
    await createWallet({ owner: r.storeId, ownerType: 'store', balance: 100, totalIncome: 100 });
    const original = prisma.delivery.findUnique.bind(prisma.delivery);
    let fired = false;
    // A regra da loja lê a entrega cedo (select id/status/motoboyId, sem statusDevolucao); o
    // reassign entra logo depois dessa leitura, antes da trava do pedido. Depende dessa ordem.
    const spy = jest.spyOn(prisma.delivery, 'findUnique').mockImplementation((async (args: any) => {
      const row = await original(args);
      const sel = args?.select;
      if (!fired && sel?.id && sel?.status && sel?.motoboyId && !sel?.statusDevolucao) {
        fired = true;
        await adminReassignDelivery({ orderId: r.orderId, reason: 'Motoboy parado na rua', actor: { id: ceo.userId, role: 'ceo' } });
      }
      return row;
    }) as any);
    try {
      const res = await adminCancelOrder({ orderId: r.orderId, fault: 'store', reason: 'Loja sem o produto', actor: { id: ceo.userId, role: 'ceo' } });
      expect(res.ok).toBe(true);
    } finally {
      spy.mockRestore();
    }
    expect(fired).toBe(true);
    expect(await prisma.payout.count({ where: { recipientType: 'motoboy', recipientId: r.motoboy.userId } })).toBe(0);
    expect(await prisma.cancellation.findFirst({ where: { orderId: r.orderId } })).toMatchObject({ cancelledBy: 'admin', faultParty: 'store' });
  });

  it('retirada com a entrega já reatribuída no meio da leitura → 409 DELIVERY_CHANGED, sem reviver o motoboy', async () => {
    const r = await criarCorrida(DOMAIN, { status: 'assigned' });
    // Simula a leitura antiga: a retirada leu 'assigned'; o reassign grava antes da escrita dela.
    // ATENÇÃO: depende de a PRIMEIRA leitura de prisma.delivery.findUnique da requisição ser a de
    // validarPinRetirada. Se o handler (ou um middleware) passar a ler a entrega antes, ajuste o spy.
    const original = prisma.delivery.findUnique.bind(prisma.delivery);
    const spy = jest.spyOn(prisma.delivery, 'findUnique').mockImplementationOnce((async (args: any) => {
      const row = await original(args);
      await prisma.delivery.update({
        where: { id: r.deliveryId },
        data: { status: 'pending', motoboyId: null, pin: null, pinRetirada: null, excludedMotoboyIds: { push: r.motoboy.userId } },
      });
      return row;
    }) as any);
    const res = await pickup(r);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELIVERY_CHANGED');
    expect(await deliveryOf(r.deliveryId)).toMatchObject({ status: 'pending', motoboyId: null, excludedMotoboyIds: [r.motoboy.userId] });
  });
});
