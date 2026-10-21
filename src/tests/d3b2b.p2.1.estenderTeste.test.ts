/**
 * D3b-2b · P2.1 — estender o teste da mensalidade (spec 9, ruling 6): motivo, 7/14/30 dias, só em
 * trialing, max(fim do teste, agora) + dias, Asaas ANTES (o próximo vencimento acompanha o fim novo
 * e a fatura já gerada com o vencimento velho é apagada), 502 sem mudança no DROP, histórico
 * trial_extend na mesma transação, dois admins ao mesmo tempo em sequência. Asaas mockado.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  };
});
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import { saoPauloToday } from '../services/asaasLoja/charge';

const DOMAIN = '@d3b2bp21.test';
const REASON = 'Loja nova pediu mais prazo';
const DAY = 86_400_000;
let ceo: TestUser;
let dono: TestUser;
let payments: Record<string, any[]>;

const rand = () => Math.random().toString(36).slice(2, 10);
const calls = (fn: unknown) => (fn as jest.Mock).mock.calls;

beforeEach(async () => {
  jest.clearAllMocks();
  payments = {};
  (asaasClient.put as jest.Mock).mockResolvedValue({});
  (asaasClient.get as jest.Mock).mockImplementation(async (path: string) => {
    const m = /^\/subscriptions\/([^/]+)\/payments/.exec(path);
    return { data: (m && payments[decodeURIComponent(m[1])]) || [], hasMore: false };
  });
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const loja = () => prisma.store.create({ data: { ownerId: dono.userId, name: `Loja p21 ${rand()}`, isOpen: true } });
/** Loja com mensalidade em teste; o fim do teste padrão é daqui a 5 dias. */
const cobranca = async (data: Record<string, unknown> = {}) => {
  const store = await loja();
  const billing = await prisma.storeSaasBilling.create({
    data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), ...data } as any,
  });
  return { store, billing };
};
const extend = (by: TestUser, id: string, body: Record<string, unknown> = { days: 14, reason: REASON }) =>
  request(app).post(`/api/admin/stores/${id}/saas/extend-trial`).set('Authorization', bearer(by)).send(body);
const billingOf = (storeId: string) => prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId } });
const actionsOf = (storeId: string) =>
  prisma.adminAccountAction.findMany({ where: { storeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('POST /admin/stores/:id/saas/extend-trial', () => {
  it('teste correndo e sem assinatura: soma os dias ao fim do teste, grava trial_extend e não chama o Asaas', async () => {
    const { store, billing } = await cobranca();
    const res = await extend(ceo, store.id, { days: 14, reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    const novo = new Date(billing.trialEndsAt.getTime() + 14 * DAY);
    expect(res.body).toEqual({ saas: { status: 'trialing', trialEndsAt: novo.toISOString(), paidUntil: null, cancelledAt: null } });
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(novo.getTime());

    const rows = await actionsOf(store.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'trial_extend', reason: REASON, actorId: ceo.userId, actorRole: 'ceo', userId: null });
    expect(rows[0].meta).toEqual({
      days: 14, from: billing.trialEndsAt.toISOString(), to: novo.toISOString(), nextDueDate: null, removedPayments: [],
    });
    expect(calls(asaasClient.put)).toHaveLength(0);
    expect(calls(asaasClient.delete)).toHaveLength(0);
  });

  it('teste já vencido: os dias contam a partir de agora', async () => {
    const { store } = await cobranca({ trialEndsAt: new Date(Date.now() - 3 * DAY) });
    const before = Date.now();
    const res = await extend(ceo, store.id, { days: 7, reason: REASON });
    const after = Date.now();
    expect(res.status).toBe(200);
    const fim = (await billingOf(store.id)).trialEndsAt.getTime();
    expect(fim).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(fim).toBeLessThanOrEqual(after + 7 * DAY);
  });

  it('com assinatura: PUT nextDueDate ANTES, e só a fatura aberta com vencimento velho é apagada (lá e aqui)', async () => {
    const subId = `sub_p21_${rand()}`;
    const { store, billing } = await cobranca({ asaasSubscriptionId: subId, asaasCustomerId: 'cus_p21' });
    const oldDue = saoPauloToday(billing.trialEndsAt);
    const velha = `pay_p21_${rand()}`;
    const paga = `pay_p21_${rand()}`;
    const futura = `pay_p21_${rand()}`;
    payments[subId] = [
      { id: velha, status: 'PENDING', dueDate: oldDue, value: 49.9 },
      { id: paga, status: 'RECEIVED', dueDate: '2026-01-10', value: 49.9 },
      { id: futura, status: 'PENDING', dueDate: '2099-01-10', value: 49.9 },
    ];
    await prisma.saasBillingPayment.create({
      data: { billingId: billing.id, asaasPaymentId: velha, value: 49.9, dueDate: new Date(`${oldDue}T00:00:00.000Z`), status: 'PENDING' },
    });

    const res = await extend(ceo, store.id, { days: 30, reason: REASON });
    expect(res.status).toBe(200);
    const fim = (await billingOf(store.id)).trialEndsAt;
    expect(fim.getTime()).toBe(billing.trialEndsAt.getTime() + 30 * DAY);
    const nextDueDate = saoPauloToday(fim);

    expect(calls(asaasClient.put)).toEqual([[`/subscriptions/${subId}`, { nextDueDate }]]);
    expect(calls(asaasClient.delete)).toEqual([[`/payments/${velha}`]]);
    const putAt = (asaasClient.put as jest.Mock).mock.invocationCallOrder[0];
    const deleteAt = (asaasClient.delete as jest.Mock).mock.invocationCallOrder[0];
    expect(putAt).toBeLessThan(deleteAt);

    expect((await prisma.saasBillingPayment.findUniqueOrThrow({ where: { asaasPaymentId: velha } })).status).toBe('DELETED');
    const [row] = await actionsOf(store.id);
    expect(row.meta).toMatchObject({ days: 30, nextDueDate, removedPayments: [velha] });
  });

  it('Asaas fora no PUT: 502 ASAAS_UPDATE_FAILED e nada muda no DROP', async () => {
    const subId = `sub_p21_${rand()}`;
    const { store, billing } = await cobranca({ asaasSubscriptionId: subId });
    (asaasClient.put as jest.Mock).mockRejectedValue(new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]));
    const res = await extend(ceo, store.id);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: expect.any(String), code: 'ASAAS_UPDATE_FAILED' });
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
    expect(await actionsOf(store.id)).toHaveLength(0);
    expect(calls(asaasClient.delete)).toHaveLength(0);
  });

  it('apagar a fatura velha: 404 conta como apagada; outro erro dá 502 e nada muda no DROP', async () => {
    const subA = `sub_p21_${rand()}`;
    const subB = `sub_p21_${rand()}`;
    const a = await cobranca({ asaasSubscriptionId: subA });
    const b = await cobranca({ asaasSubscriptionId: subB });
    const sumiu = `pay_p21_${rand()}`;
    const trava = `pay_p21_${rand()}`;
    payments[subA] = [{ id: sumiu, status: 'PENDING', dueDate: saoPauloToday(a.billing.trialEndsAt), value: 49.9 }];
    payments[subB] = [{ id: trava, status: 'PENDING', dueDate: saoPauloToday(b.billing.trialEndsAt), value: 49.9 }];
    (asaasClient.delete as jest.Mock).mockImplementation(async (path: string) => {
      if (path === `/payments/${sumiu}`) throw new AsaasApiError(404, [{ code: 'not_found', description: 'não existe' }]);
      if (path === `/payments/${trava}`) throw new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]);
      return { deleted: true };
    });

    const ok = await extend(ceo, a.store.id);
    expect(ok.status).toBe(200);
    expect((await billingOf(a.store.id)).trialEndsAt.getTime()).toBe(a.billing.trialEndsAt.getTime() + 14 * DAY);

    const falhou = await extend(ceo, b.store.id);
    expect(falhou.status).toBe(502);
    expect(falhou.body.code).toBe('ASAAS_UPDATE_FAILED');
    expect((await billingOf(b.store.id)).trialEndsAt.getTime()).toBe(b.billing.trialEndsAt.getTime());
    expect(await actionsOf(b.store.id)).toHaveLength(0);
  });

  it('fora de trialing → 409 NOT_TRIALING; sem linha de mensalidade → 409 NO_SAAS_BILLING; loja que não existe → 404', async () => {
    for (const status of ['active', 'past_due', 'paused', 'cancelled']) {
      const { store, billing } = await cobranca({ status });
      const res = await extend(ceo, store.id);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: expect.any(String), code: 'NOT_TRIALING' });
      expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
      expect(await actionsOf(store.id)).toHaveLength(0);
    }
    const semLinha = await loja();
    const res = await extend(ceo, semLinha.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_SAAS_BILLING');
    expect(await prisma.storeSaasBilling.count({ where: { storeId: semLinha.id } })).toBe(0);

    const nao = await extend(ceo, 'loja-que-nao-existe');
    expect(nao.status).toBe(404);
    expect(nao.body.code).toBe('STORE_NOT_FOUND');
  });

  it('validação: dias fora de 7/14/30 → 400 INVALID_DAYS; motivo curto ou ausente → 400 REASON_REQUIRED; nada muda', async () => {
    const { store, billing } = await cobranca();
    for (const days of [10, 0, -7, '14', null]) {
      const res = await extend(ceo, store.id, { days, reason: REASON });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_DAYS');
    }
    for (const body of [{ days: 7, reason: 'oi' }, { days: 7 }, { days: 7, reason: '      ' }]) {
      const res = await extend(ceo, store.id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REASON_REQUIRED');
    }
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
    expect(await actionsOf(store.id)).toHaveLength(0);
  });

  it('permissão: sem plan:manage → 403; papel de equipe com plan:manage delegado → 200', async () => {
    const { store } = await cobranca();
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      expect((await extend(gerente, store.id)).status).toBe(403);
      expect(await actionsOf(store.id)).toHaveLength(0);
      await grantRolePermissions('gerente_geral', ['store:view_all', 'plan:manage']);
      const res = await extend(gerente, store.id);
      expect(res.status).toBe(200);
      expect((await actionsOf(store.id))[0]).toMatchObject({ type: 'trial_extend', actorId: gerente.userId, actorRole: 'gerente_geral' });
    } finally {
      await restore();
    }
  });

  it('dois admins ao mesmo tempo: os dois valem em sequência e o último vencimento enviado ao Asaas é o do fim final', async () => {
    const subId = `sub_p21_${rand()}`;
    const { store, billing } = await cobranca({ asaasSubscriptionId: subId });
    const [a, b] = await Promise.all([
      extend(ceo, store.id, { days: 7, reason: REASON }),
      extend(ceo, store.id, { days: 30, reason: REASON }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const fim = (await billingOf(store.id)).trialEndsAt;
    expect(fim.getTime()).toBe(billing.trialEndsAt.getTime() + 37 * DAY);
    const puts = calls(asaasClient.put);
    expect(puts).toHaveLength(2);
    expect(puts[1]).toEqual([`/subscriptions/${subId}`, { nextDueDate: saoPauloToday(fim) }]);
    expect(await actionsOf(store.id)).toHaveLength(2);
  });
});
