/**
 * D3b-1 · P1.3 — GET /admin/ops/summary (KPIs de hoje, pedidos por hora e "Saúde agora", spec 3.1).
 * O dia usa um `now` fixo em 2031 (12:30 em São Paulo), para ter só os dados da suíte. Contagens
 * do estado de agora (motoboys, pedidos em andamento) são conferidas por diferença.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures, grantRolePermissions, OpsOrderInput } from './helpers/d3b1Ops';
import { getOpsSummary } from '../services/adminOps/summary';
import { toCents } from '../services/moneyOverview.service';

const DOMAIN = '@d3b1p13.test';
const MARK = 'd3b1p13';
const NOW = new Date('2031-05-14T15:30:00.000Z'); // 14/05 12:30 em São Paulo
const at = (iso: string) => new Date(iso);

let ceo: TestUser;
let cliente: TestUser;
let motoboyOcupado: TestUser;
let motoboyLivre: TestUser;
let motoboyOffline: TestUser;
let storeId: string;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  motoboyOcupado = await createTestUser('motoboy', DOMAIN);
  motoboyLivre = await createTestUser('motoboy', DOMAIN);
  motoboyOffline = await createTestUser('motoboy', DOMAIN);
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Resumo' });
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const order = (data: Partial<OpsOrderInput>) => createOpsOrder({ customerId: cliente.userId, storeId, ...data });
const get = (u?: TestUser) => {
  const r = request(app).get('/api/admin/ops/summary');
  return u ? r.set('Authorization', bearer(u)) : r;
};

describe('getOpsSummary', () => {
  it('KPIs de hoje, comparação com a semana passada, pedidos por hora e saúde das últimas 2 h', async () => {
    const before = await getOpsSummary(NOW);

    // Hoje (14/05 em SP)
    await order({ totalValue: 20, status: 'entregue', paidAt: at('2031-05-14T12:00:00.000Z'), acceptedAt: at('2031-05-14T12:30:00.000Z') }); // 09h; aceite fora da janela
    await order({
      totalValue: 100, status: 'entregue', paidAt: at('2031-05-14T13:00:00.000Z'), // 10h
      delivery: {
        status: 'delivered', motoboyId: motoboyLivre.userId,
        createdAt: at('2031-05-14T14:00:00.000Z'), assignedAt: at('2031-05-14T14:04:00.000Z'),
        pickedAt: at('2031-05-14T14:10:00.000Z'), deliveredAt: at('2031-05-14T14:40:00.000Z'),
      },
    });
    const cancelado = await order({ totalValue: 40, status: 'cancelado', paidAt: at('2031-05-14T14:00:00.000Z') }); // 11h
    await prisma.cancellation.create({
      data: {
        orderId: cancelado.orderId, cancelledBy: 'customer', reason: 'Demorou', reasonCode: 'customer_request',
        isLateCancellation: true, createdAt: at('2031-05-14T14:20:00.000Z'),
      },
    });
    await order({
      totalValue: 50, status: 'pago', paidAt: at('2031-05-14T15:10:00.000Z'), acceptedAt: at('2031-05-14T15:16:00.000Z'), // 12h, em andamento
      delivery: {
        status: 'assigned', motoboyId: motoboyOcupado.userId,
        createdAt: at('2031-05-14T15:17:00.000Z'), assignedAt: at('2031-05-14T15:21:00.000Z'),
      },
    });
    // Fora: depois de agora, dia anterior em SP e não pago
    await order({ totalValue: 999, status: 'entregue', paidAt: at('2031-05-14T15:40:00.000Z') });
    await order({ totalValue: 998, status: 'entregue', paidAt: at('2031-05-14T02:59:59.999Z') });
    await order({ totalValue: 997, status: 'criado', paymentStatus: 'pending', paidAt: null });

    // Semana passada (07/05): entra só o pago antes da mesma hora e não cancelado
    await order({ totalValue: 80, status: 'entregue', paidAt: at('2031-05-07T13:00:00.000Z') });
    await order({ totalValue: 30, status: 'cancelado', paidAt: at('2031-05-07T14:00:00.000Z') });
    await order({ totalValue: 70, status: 'entregue', paidAt: at('2031-05-07T16:00:00.000Z') });

    // Motoboys: dois online (um em entrega), um offline
    await prisma.user.update({ where: { id: motoboyOcupado.userId }, data: { isOnline: true } });
    await prisma.user.update({ where: { id: motoboyLivre.userId }, data: { isOnline: true } });
    await prisma.user.update({ where: { id: motoboyOffline.userId }, data: { isOnline: false } });

    const after = await getOpsSummary(NOW);
    expect(toCents(after.today.gmv) - toCents(before.today.gmv)).toBe(17000);
    expect(toCents(after.today.gmvLastWeekSameTime) - toCents(before.today.gmvLastWeekSameTime)).toBe(8000);
    expect(after.today.orders - before.today.orders).toBe(4);
    expect(after.today.cancelLate - before.today.cancelLate).toBe(1);
    expect(after.today.ordersActive - before.today.ordersActive).toBe(1);
    expect(after.today.motoboysOnline - before.today.motoboysOnline).toBe(2);
    expect(after.today.motoboysDelivering - before.today.motoboysDelivering).toBe(1);
    expect(after.today.motoboysFree - before.today.motoboysFree).toBe(1);

    // 2031: o dia só tem os dados da suíte
    expect(before.today.orders).toBe(0);
    expect(after.today.cancelPct).toBe(25);

    expect(after.perHour.map((p) => p.hour)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const hourDelta = after.perHour.map((p, i) => p.count - before.perHour[i].count);
    expect(hourDelta).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);

    expect(after.health).toEqual({ storeAcceptAvgMin: 6, findMotoboyAvgMin: 4, deliveryAvgMin: 30 });
  });

  it('sem casos na janela a saúde vem null; perto da meia-noite o dia tem 24 horas', async () => {
    const quiet = await getOpsSummary(new Date('2031-08-01T15:00:00.000Z'));
    expect(quiet.health).toEqual({ storeAcceptAvgMin: null, findMotoboyAvgMin: null, deliveryAvgMin: null });
    expect(quiet.perHour).toHaveLength(13);
    expect(quiet.today.cancelPct).toBe(0);

    const lateNight = await getOpsSummary(new Date('2031-08-02T02:30:00.000Z')); // 01/08 23:30 em SP
    expect(lateNight.perHour).toHaveLength(24);
    expect(lateNight.perHour[23].hour).toBe(23);
  });
});

describe('GET /api/admin/ops/summary', () => {
  it('CEO recebe o resumo no formato combinado', async () => {
    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['health', 'perHour', 'today']);
    expect(Object.keys(r.body.today).sort()).toEqual([
      'cancelLate', 'cancelPct', 'gmv', 'gmvLastWeekSameTime', 'motoboysDelivering', 'motoboysFree',
      'motoboysOnline', 'orders', 'ordersActive',
    ]);
    expect(Object.keys(r.body.health).sort()).toEqual(['deliveryAvgMin', 'findMotoboyAvgMin', 'storeAcceptAvgMin']);
  });

  it('sem login → 401; sem operation:view → 403; com operation:view concedida a um gerente → 200', async () => {
    expect((await get()).status).toBe(401);
    const semPermissao = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(semPermissao)).status).toBe(403);
    const marketing = await createTestUser('marketing', DOMAIN);
    const restore = await grantRolePermissions('marketing', ['operation:view']);
    try {
      expect((await get(marketing)).status).toBe(200);
    } finally {
      await restore();
    }
  });
});
