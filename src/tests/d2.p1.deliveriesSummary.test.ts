/* eslint-env jest */
/** D2 · P1.9 — resumo do dia e da semana do motoboy, no servidor e no fuso de São Paulo (spec 5.1, item 5). */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { saoPauloDayAndWeekStart, motoboySummary } from '../services/motoboySummary';

const DOMAIN = '@d2p1resumo.test';
let motoboy: TestUser;
let outro: TestUser;
const rid = () => `d2r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

beforeEach(async () => {
  motoboy = await createTestUser('motoboy', DOMAIN);
  outro = await createTestUser('motoboy', DOMAIN);
});
afterEach(async () => {
  await prisma.motoboyTransfer.deleteMany({ where: { motoboyId: { in: [motoboy.userId, outro.userId] } } });
  await cleanupUsersByEmailDomain(DOMAIN); // apaga as entregas (motoboyId) e os payouts (recipientId) da suíte
});

async function corrida(m: TestUser, status: 'delivered' | 'cancelled', deliveredAt: Date | null) {
  return prisma.delivery.create({ data: { orderId: rid(), motoboyId: m.userId, status, fee: 10, distance: 3, deliveredAt } as any });
}
const payout = (m: TestUser, deliveryId: string, amount: number, status = 'released') =>
  prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: m.userId, orderId: rid(), deliveryId, amount, status } as any });
const transfer = (m: TestUser, deliveryId: string, amount: number, reason = 'delivery') =>
  prisma.motoboyTransfer.create({
    data: { deliveryId, orderId: rid(), storeId: rid(), motoboyId: m.userId, reason, amount, pixKeyEncrypted: 'x', pixKeyType: 'CPF' } as any,
  });

describe('saoPauloDayAndWeekStart', () => {
  it('quarta 12:00 UTC (09:00 em SP): dia começa 03:00 UTC e a semana na segunda', () => {
    const r = saoPauloDayAndWeekStart(new Date('2026-10-14T12:00:00.000Z'));
    expect(r.dayStart.toISOString()).toBe('2026-10-14T03:00:00.000Z');
    expect(r.weekStart.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
  it('02:30 UTC de quinta ainda é quarta 23:30 em SP', () => {
    expect(saoPauloDayAndWeekStart(new Date('2026-10-15T02:30:00.000Z')).dayStart.toISOString()).toBe('2026-10-14T03:00:00.000Z');
  });
  it('domingo ainda é da semana que começou na segunda anterior', () => {
    expect(saoPauloDayAndWeekStart(new Date('2026-10-18T15:00:00.000Z')).weekStart.toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
  it('segunda 00:30 em SP abre semana nova', () => {
    const r = saoPauloDayAndWeekStart(new Date('2026-10-19T03:30:00.000Z'));
    expect(r.dayStart.toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(r.weekStart.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });
});

describe('motoboySummary (agora = quarta 2026-10-14 12:00 em SP)', () => {
  const NOW = new Date('2026-10-14T15:00:00.000Z');

  it('soma o que foi gravado para o motoboy nas corridas entregues de hoje e da semana', async () => {
    const d1 = await corrida(motoboy, 'delivered', new Date('2026-10-14T13:00:00.000Z')); // hoje
    await payout(motoboy, d1.id, 8);
    const d2 = await corrida(motoboy, 'delivered', new Date('2026-10-13T20:00:00.000Z')); // terça: só semana
    await transfer(motoboy, d2.id, 9.6);
    const d3 = await corrida(motoboy, 'delivered', new Date('2026-10-12T02:30:00.000Z')); // domingo 23:30 em SP: semana passada
    await payout(motoboy, d3.id, 7);
    const d4 = await corrida(motoboy, 'delivered', new Date('2026-10-14T14:00:00.000Z')); // hoje, repasse cancelado
    await payout(motoboy, d4.id, 8, 'cancelled');
    const d5 = await corrida(motoboy, 'cancelled', null); // cancelada com compensação: não é corrida entregue
    await payout(motoboy, d5.id, 5);
    const d6 = await corrida(outro, 'delivered', new Date('2026-10-14T13:30:00.000Z')); // de outro motoboy
    await payout(outro, d6.id, 8);
    const d7 = await corrida(motoboy, 'delivered', new Date('2026-10-14T12:00:00.000Z')); // hoje, repasse fracionado num saque
    await payout(motoboy, d7.id, 3, 'requested');
    await payout(motoboy, d7.id, 2, 'released');

    const r = await motoboySummary(motoboy.userId, NOW);
    expect(r.today).toEqual({ count: 3, earnings: 13 });
    expect(r.week).toEqual({ count: 4, earnings: 22.6 });
  });

  it('sem corridas: zeros', async () => {
    expect(await motoboySummary(motoboy.userId, NOW)).toEqual({ today: { count: 0, earnings: 0 }, week: { count: 0, earnings: 0 } });
  });
});

describe('motoboySummary: virada do dia em São Paulo', () => {
  it('23:30 em SP: corrida das 23:10 é de hoje; da véspera 23:50 só da semana', async () => {
    const NOW = new Date('2026-10-15T02:30:00.000Z'); // quarta 23:30 em SP
    const a = await corrida(motoboy, 'delivered', new Date('2026-10-15T02:10:00.000Z')); // quarta 23:10
    await payout(motoboy, a.id, 4);
    const b = await corrida(motoboy, 'delivered', new Date('2026-10-14T02:50:00.000Z')); // terça 23:50
    await payout(motoboy, b.id, 6);
    const r = await motoboySummary(motoboy.userId, NOW);
    expect(r.today).toEqual({ count: 1, earnings: 4 });
    expect(r.week).toEqual({ count: 2, earnings: 10 });
  });
  it('00:30 em SP de quinta: a corrida das 23:10 de quarta já não é de hoje', async () => {
    const NOW = new Date('2026-10-15T03:30:00.000Z'); // quinta 00:30 em SP
    const a = await corrida(motoboy, 'delivered', new Date('2026-10-15T02:10:00.000Z'));
    await payout(motoboy, a.id, 4);
    const r = await motoboySummary(motoboy.userId, NOW);
    expect(r.today).toEqual({ count: 0, earnings: 0 });
    expect(r.week).toEqual({ count: 1, earnings: 4 });
  });
  it('domingo 23:30 -> segunda 00:30 em SP: a corrida de domingo sai da semana', async () => {
    const d = await corrida(motoboy, 'delivered', new Date('2026-10-19T02:30:00.000Z')); // domingo 23:30
    await payout(motoboy, d.id, 7);
    const dom = await motoboySummary(motoboy.userId, new Date('2026-10-19T02:45:00.000Z'));
    expect(dom.week).toEqual({ count: 1, earnings: 7 });
    expect(dom.today).toEqual({ count: 1, earnings: 7 });
    const seg = await motoboySummary(motoboy.userId, new Date('2026-10-19T03:30:00.000Z')); // segunda 00:30
    expect(seg.week).toEqual({ count: 0, earnings: 0 });
    expect(seg.today).toEqual({ count: 0, earnings: 0 });
  });
});

describe('GET /api/deliveries/summary', () => {
  it('motoboy: devolve o resumo de agora', async () => {
    const d = await corrida(motoboy, 'delivered', new Date());
    await payout(motoboy, d.id, 8);
    const res = await request(app).get('/api/deliveries/summary').set('Authorization', bearer(motoboy));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ today: { earnings: 8, count: 1 }, week: { earnings: 8, count: 1 } });
  });

  it('não é motoboy: 403', async () => {
    const loja = await createTestUser('lojista', DOMAIN);
    const res = await request(app).get('/api/deliveries/summary').set('Authorization', bearer(loja));
    expect(res.status).toBe(403);
  });
});
