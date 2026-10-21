/**
 * D3b-2b · P2.2 — cancelar a mensalidade (spec 9, ruling 7) e `cancelled` deixando de bloquear na
 * hora (ruling 8). Um teste por lugar que trata `cancelled` (Review Focus 1): política, vitrine e
 * pedido novo (gate), tela do lojista, lista do admin, job b (assinatura criada em corrida com o
 * cancelamento), fatura paga depois do cancelamento (applySaasPayment) e volta ao modo direto
 * (reopenSaasTrials). Asaas mockado.
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
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import logger from '../config/logger';
import { runSaasBillingCycle } from '../jobs/saasBilling.job';
import { applySaasPayment } from '../services/saasBilling/payments';
import { reopenSaasTrials } from '../services/saasBilling/modeSwitch';
import { isStoreBillingBlocked } from '../services/saasBilling/gate';
import { coverageBounds, coverageEnd, isBillingBlocked, isCancelledAndExpired, isStoreBlocked, sellsUntil } from '../services/saasBilling/policy';
import { billingVisibleWhere } from '../services/saasBilling/gate';

const DOMAIN = '@d3b2bp22.test';
const REASON = 'Loja pediu para sair do DROP';
const DAY = 86_400_000;
const SP_OFFSET = 3 * 3_600_000;
let restore: () => Promise<void>;
let ceo: TestUser;
let dono: TestUser;

const rand = () => Math.random().toString(36).slice(2, 10);
const calls = (fn: unknown) => (fn as jest.Mock).mock.calls;
/** Data do Asaas (00:00Z) daqui a `n` dias. */
const utcDay = (n: number) => new Date(Math.floor((Date.now() + n * DAY) / DAY) * DAY);
/** "vende até": fim do dia pago (00:00Z) = dia seguinte 03:00Z; o último instante é 1 ms antes. */
const sellsUntilOfPaid = (paidUntil: Date) => new Date(paidUntil.getTime() + DAY + SP_OFFSET - 1).toISOString();
const ddmm = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));

function randomCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[0] = (n[0] + 1) % 10;
  const dv = (base: number[]) => {
    const s = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  (asaasClient.post as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/customers') return { id: `cus_p22_${rand()}` };
    if (path === '/subscriptions') return { id: `sub_p22_${rand()}` };
    return {};
  });
  (asaasClient.get as jest.Mock).mockResolvedValue({ data: [], hasMore: false });
  (asaasClient.put as jest.Mock).mockResolvedValue({});
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'd3b2b-p22');
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const loja = (extra: Record<string, unknown> = {}) =>
  prisma.store.create({
    data: { ownerId: dono.userId, name: `Loja p22 ${rand()}`, isOpen: true, isVerified: true, latitude: '-22.90', longitude: '-43.20', ...extra } as any,
  });
/** Loja com mensalidade paga até daqui a 10 dias (teste acabou há 20). */
const comMensalidade = async (data: Record<string, unknown> = {}) => {
  const store = await loja();
  const billing = await prisma.storeSaasBilling.create({
    data: { storeId: store.id, status: 'active', trialEndsAt: new Date(Date.now() - 20 * DAY), paidUntil: utcDay(10), ...data } as any,
  });
  return { store, billing };
};
const cancel = (by: TestUser, id: string, body: Record<string, unknown> = { reason: REASON }) =>
  request(app).post(`/api/admin/stores/${id}/saas/cancel`).set('Authorization', bearer(by)).send(body);
const billingOf = (storeId: string) => prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId } });
const actionsOf = (storeId: string) =>
  prisma.adminAccountAction.findMany({ where: { storeId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

describe('POST /admin/stores/:id/saas/cancel', () => {
  it('com assinatura: apaga no Asaas, grava cancelled + quem e quando, limpa a assinatura, registra saas_cancel e avisa o dono', async () => {
    const subId = `sub_p22_${rand()}`;
    const { store } = await comMensalidade({ asaasSubscriptionId: subId, subscriptionValue: 49.9 });
    const before = Date.now();
    const res = await cancel(ceo, store.id, { reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(calls(asaasClient.delete)).toEqual([[`/subscriptions/${subId}`]]);

    const row = await billingOf(store.id);
    expect(row).toMatchObject({ status: 'cancelled', cancelledBy: ceo.userId, asaasSubscriptionId: null, subscriptionValue: null });
    expect(row.cancelledAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(res.body).toEqual({
      saas: { status: 'cancelled', trialEndsAt: row.trialEndsAt.toISOString(), paidUntil: row.paidUntil!.toISOString(), cancelledAt: row.cancelledAt!.toISOString() },
    });

    const sells = sellsUntilOfPaid(row.paidUntil!);
    const acts = await actionsOf(store.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ type: 'saas_cancel', reason: REASON, actorId: ceo.userId, actorRole: 'ceo', userId: null });
    expect(acts[0].meta).toEqual({ previousStatus: 'active', asaasSubscriptionId: subId, sellsUntil: sells });

    const aviso = await prisma.notification.findFirst({ where: { userId: dono.userId, title: 'Mensalidade cancelada' } });
    expect(aviso).toMatchObject({
      message: `O DROP cancelou a mensalidade da sua loja. Ela segue vendendo até ${ddmm(sells)}. Motivo: ${REASON}`,
      link: '/seller/assinatura',
      entityId: store.id,
    });
  });

  it('sem assinatura (ainda em teste): só cancela no DROP', async () => {
    const { store } = await comMensalidade({ status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), paidUntil: null });
    const res = await cancel(ceo, store.id);
    expect(res.status).toBe(200);
    expect(calls(asaasClient.delete)).toHaveLength(0);
    expect((await billingOf(store.id)).status).toBe('cancelled');
    expect((await actionsOf(store.id))[0].meta).toMatchObject({ previousStatus: 'trialing', asaasSubscriptionId: null });
  });

  it('Asaas: 404 conta como apagada; outro erro → 502 SAAS_CANCEL_FAILED e nada muda', async () => {
    const sumiu = `sub_p22_${rand()}`;
    const trava = `sub_p22_${rand()}`;
    const a = await comMensalidade({ asaasSubscriptionId: sumiu });
    const b = await comMensalidade({ asaasSubscriptionId: trava });
    (asaasClient.delete as jest.Mock).mockImplementation(async (path: string) => {
      if (path === `/subscriptions/${sumiu}`) throw new AsaasApiError(404, [{ code: 'not_found', description: 'não existe' }]);
      if (path === `/subscriptions/${trava}`) throw new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]);
      return { deleted: true };
    });

    expect((await cancel(ceo, a.store.id)).status).toBe(200);
    expect((await billingOf(a.store.id)).status).toBe('cancelled');

    const res = await cancel(ceo, b.store.id);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: expect.any(String), code: 'SAAS_CANCEL_FAILED' });
    expect(await billingOf(b.store.id)).toMatchObject({ status: 'active', asaasSubscriptionId: trava, cancelledAt: null, cancelledBy: null });
    expect(await actionsOf(b.store.id)).toHaveLength(0);
  });

  it('já cancelada → 409 ALREADY_CANCELLED; sem linha → 409 NO_SAAS_BILLING; loja inexistente → 404; motivo curto → 400', async () => {
    const { store: cancelada } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: ceo.userId });
    const r1 = await cancel(ceo, cancelada.id);
    expect(r1.status).toBe(409);
    expect(r1.body.code).toBe('ALREADY_CANCELLED');

    const semLinha = await loja();
    const r2 = await cancel(ceo, semLinha.id);
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('NO_SAAS_BILLING');

    const r3 = await cancel(ceo, 'loja-que-nao-existe');
    expect(r3.status).toBe(404);
    expect(r3.body.code).toBe('STORE_NOT_FOUND');

    const { store: ativa } = await comMensalidade({ asaasSubscriptionId: `sub_p22_${rand()}` });
    for (const body of [{}, { reason: 'oi' }, { reason: '     ' }]) {
      const r = await cancel(ceo, ativa.id, body);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('REASON_REQUIRED');
    }
    expect((await billingOf(ativa.id)).status).toBe('active');
    expect(calls(asaasClient.delete)).toHaveLength(0);
    expect(await actionsOf(cancelada.id)).toHaveLength(0);
  });

  it('permissão: sem plan:manage → 403; papel de equipe com plan:manage → 200', async () => {
    const { store } = await comMensalidade();
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restoreRole = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      expect((await cancel(gerente, store.id)).status).toBe(403);
      expect((await billingOf(store.id)).status).toBe('active');
      await grantRolePermissions('gerente_geral', ['store:view_all', 'plan:manage']);
      expect((await cancel(gerente, store.id)).status).toBe(200);
      expect((await actionsOf(store.id))[0]).toMatchObject({ type: 'saas_cancel', actorId: gerente.userId, actorRole: 'gerente_geral' });
    } finally {
      await restoreRole();
    }
  });

  it('dois cancelamentos ao mesmo tempo: um 200, outro 409 ALREADY_CANCELLED, uma linha só', async () => {
    const { store } = await comMensalidade({ asaasSubscriptionId: `sub_p22_${rand()}` });
    const [a, b] = await Promise.all([cancel(ceo, store.id), cancel(ceo, store.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('ALREADY_CANCELLED');
    expect(await actionsOf(store.id)).toHaveLength(1);
  });
});

describe('cancelada dentro do período continua vendendo (Review Focus 1, um teste por lugar)', () => {
  it('política: isBillingBlocked e isStoreBlocked só bloqueiam a cancelada depois do fim, sem tolerância', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const cfg = { saasMonthlyFee: 49.9, saasGraceDays: 5 };
    const dentro = { status: 'cancelled', trialEndsAt: new Date('2026-09-01T12:00:00.000Z'), paidUntil: new Date('2026-10-25T00:00:00.000Z'), asaasSubscriptionId: null, customFee: null };
    const fora = { ...dentro, paidUntil: new Date('2026-10-10T00:00:00.000Z') };
    // pago até 19/10: acabou 20/10 03:00Z; às 12:00Z já bloqueia (a tolerância de 5 dias não vale para cancelada).
    const ontem = { ...dentro, paidUntil: new Date('2026-10-19T00:00:00.000Z') };
    expect(isBillingBlocked(dentro, now, 5)).toBe(false);
    expect(isStoreBlocked(dentro, now, cfg)).toBe(false);
    expect(isBillingBlocked(fora, now, 5)).toBe(true);
    expect(isStoreBlocked(fora, now, cfg)).toBe(true);
    expect(isBillingBlocked(ontem, now, 5)).toBe(true);
    // teste ainda correndo, sem período pago: vale o fim do teste.
    expect(isStoreBlocked({ ...dentro, paidUntil: null, trialEndsAt: new Date('2026-10-22T12:00:00.000Z') }, now, cfg)).toBe(false);
  });

  it('vitrine e pedido novo: a cancelada no período aparece (GET /stores/:id 200) e não está bloqueada; a vencida some', async () => {
    const { store: dentro } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), paidUntil: utcDay(10) });
    const { store: fora } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), paidUntil: utcDay(-10) });
    expect((await request(app).get(`/api/stores/${dentro.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/stores/${fora.id}`)).status).toBe(404);
    expect(await isStoreBillingBlocked(dentro.id)).toBe(false);
    expect(await isStoreBillingBlocked(fora.id)).toBe(true);
  });

  it('tela do lojista: blocked false, cancelledAt e sellsUntil; loja ativa sem os dois', async () => {
    const cancelledAt = new Date();
    const paidUntil = utcDay(10);
    const { store } = await comMensalidade({ status: 'cancelled', cancelledAt, paidUntil });
    const res = await request(app).get(`/api/stores/${store.id}/saas-billing`).set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'cancelled', blocked: false, cancelledAt: cancelledAt.toISOString(), sellsUntil: sellsUntilOfPaid(paidUntil), blockAt: null,
    });

    const { store: ativa } = await comMensalidade();
    const r2 = await request(app).get(`/api/stores/${ativa.id}/saas-billing`).set('Authorization', bearer(dono));
    expect(r2.body.data).toMatchObject({ status: 'active', cancelledAt: null, sellsUntil: null });
  });

  it('lista do admin (GET /admin/stores/saas-billing): a cancelada no período não aparece bloqueada', async () => {
    const { store } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date() });
    const res = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(res.body.data.find((s: any) => s.storeId === store.id)).toMatchObject({ status: 'cancelled', blocked: false });
  });

  it('job (b): assinatura criada enquanto o admin cancelava não fica presa à loja cancelada e é apagada no Asaas', async () => {
    const owner = await createTestUser('lojista', DOMAIN);
    await prisma.user.update({ where: { id: owner.userId }, data: { cpf: randomCpf() } });
    const store = await prisma.store.create({ data: { ownerId: owner.userId, name: `Loja p22 ${rand()}`, isOpen: true } });
    const billing = await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date(Date.now() + 10 * DAY) } });
    const subId = `sub_p22_corrida_${rand()}`;
    (asaasClient.post as jest.Mock).mockImplementation(async (path: string, body: any) => {
      if (path === '/customers') return { id: `cus_p22_${rand()}` };
      if (path === '/subscriptions' && body?.externalReference === `saas-sub:${billing.id}`) {
        // o admin cancela no meio da criação da assinatura
        await prisma.storeSaasBilling.update({ where: { id: billing.id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ceo.userId } });
        return { id: subId };
      }
      if (path === '/subscriptions') return { id: `sub_p22_${rand()}` };
      return {};
    });

    await runSaasBillingCycle(new Date());
    const row = await billingOf(store.id);
    expect(row.status).toBe('cancelled');
    expect(row.asaasSubscriptionId).toBeNull();
    expect(calls(asaasClient.delete)).toContainEqual([`/subscriptions/${subId}`]);
  });

  it('fatura paga depois do cancelamento estende o período e a loja segue cancelled; OVERDUE não mexe (trava)', async () => {
    const paidUntil = new Date('2026-11-15T00:00:00.000Z');
    const { billing } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), paidUntil });
    await applySaasPayment(billing.id, { id: `pay_p22_${rand()}`, status: 'RECEIVED', dueDate: '2026-11-15', value: 49.9, paymentDate: '2026-11-14' });
    let row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    expect(row.status).toBe('cancelled');
    expect(row.paidUntil!.toISOString()).toBe('2026-12-15T00:00:00.000Z');

    await applySaasPayment(billing.id, { id: `pay_p22_${rand()}`, status: 'OVERDUE', dueDate: '2026-12-15', value: 49.9 });
    row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    expect(row.status).toBe('cancelled');
  });

  it('volta ao modo direto (reopenSaasTrials): não estende o teste de quem cancelou', async () => {
    const curto = new Date(Date.now() + DAY);
    const { billing: cancelada } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), trialEndsAt: curto, paidUntil: null });
    const { billing: emTeste } = await comMensalidade({ status: 'trialing', trialEndsAt: curto, paidUntil: null });
    const now = new Date();
    await reopenSaasTrials(now, 14);
    expect((await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: cancelada.id } })).trialEndsAt.getTime()).toBe(curto.getTime());
    const t = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: emTeste.id } });
    expect(t.trialEndsAt.getTime()).toBe(now.getTime() + 14 * DAY);
    expect((await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: cancelada.id } })).status).toBe('cancelled');
  });
});

describe('coverageEnd, sellsUntil e isCancelledAndExpired (puros)', () => {
  const at = (iso: string) => new Date(iso);

  it('teste: fim do dia em Brasília; pago: o dia UTC inteiro; vale o maior dos dois', () => {
    // 01/11 00:00Z = 31/10 21:00 em Brasília → acaba 01/11 03:00Z
    expect(coverageEnd({ trialEndsAt: at('2026-11-01T00:00:00.000Z'), paidUntil: null }).toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(coverageEnd({ trialEndsAt: at('2026-10-01T12:00:00.000Z'), paidUntil: at('2026-11-15T00:00:00.000Z') }).toISOString()).toBe('2026-11-16T03:00:00.000Z');
    // paidUntil nas 3 h antes do trialEndsAt: o dia pago (01/11) vai mais longe que o do teste (31/10 em Brasília).
    expect(coverageEnd({ trialEndsAt: at('2026-11-01T01:00:00.000Z'), paidUntil: at('2026-11-01T00:00:00.000Z') }).toISOString()).toBe('2026-11-02T03:00:00.000Z');
    expect(sellsUntil({ trialEndsAt: at('2026-11-01T00:00:00.000Z'), paidUntil: null }).toISOString()).toBe('2026-11-01T02:59:59.999Z');
  });

  it('isCancelledAndExpired: a fronteira é now >= coverageEnd; não cancelada nunca', () => {
    const b = { status: 'cancelled', trialEndsAt: at('2026-11-01T00:00:00.000Z'), paidUntil: null };
    expect(isCancelledAndExpired(b, at('2026-11-01T02:59:59.999Z'))).toBe(false);
    expect(isCancelledAndExpired(b, at('2026-11-01T03:00:00.000Z'))).toBe(true);
    expect(isCancelledAndExpired({ ...b, status: 'active' }, at('2027-01-01T00:00:00.000Z'))).toBe(false);
    expect(isCancelledAndExpired(null, at('2027-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('a vitrine (billingVisibleWhere + coverageBounds) concorda com isCancelledAndExpired nas fronteiras', async () => {
    const casos = [
      { trialEndsAt: at('2026-11-01T00:00:00.000Z'), paidUntil: null },
      { trialEndsAt: at('2026-11-01T03:00:00.000Z'), paidUntil: null },
      { trialEndsAt: at('2026-11-01T02:59:59.999Z'), paidUntil: null },
      { trialEndsAt: at('2026-10-01T12:00:00.000Z'), paidUntil: at('2026-10-31T00:00:00.000Z') },
      { trialEndsAt: at('2026-10-01T12:00:00.000Z'), paidUntil: at('2026-11-01T00:00:00.000Z') },
      { trialEndsAt: at('2026-11-01T01:00:00.000Z'), paidUntil: at('2026-11-01T00:00:00.000Z') },
    ];
    const lojas: Array<{ id: string; b: { status: string; trialEndsAt: Date; paidUntil: Date | null } }> = [];
    for (const c of casos) {
      const store = await loja();
      await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'cancelled', cancelledAt: at('2026-10-01T00:00:00.000Z'), ...c } });
      lojas.push({ id: store.id, b: { status: 'cancelled', ...c } });
    }
    const agoras = ['2026-11-01T02:59:59.999Z', '2026-11-01T03:00:00.000Z', '2026-11-02T02:59:59.999Z', '2026-11-02T03:00:00.000Z'];
    for (const iso of agoras) {
      const now = at(iso);
      for (const l of lojas) {
        const visivel = (await prisma.store.count({ where: { id: l.id, AND: [billingVisibleWhere(now)] } })) === 1;
        expect({ iso, caso: l.b, visivel }).toEqual({ iso, caso: l.b, visivel: !isCancelledAndExpired(l.b, now) });
      }
    }
    // coverageBounds: as duas fronteiras do primeiro instante
    expect(coverageBounds(at('2026-11-01T03:00:00.000Z'))).toEqual({ paidFrom: at('2026-11-01T00:00:00.000Z'), trialFrom: at('2026-11-01T03:00:00.000Z') });
  });
});

describe('correção 1 (revisão da 2.2)', () => {
  it('tela do lojista: cancelada não recebe pendingReason owner_document', async () => {
    const { store } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), asaasSubscriptionId: null });
    const res = await request(app).get(`/api/stores/${store.id}/saas-billing`).set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.data.pendingReason).toBeNull();
  });

  it('estender e cancelar ao mesmo tempo: sem 500, um vence e o outro responde 409', async () => {
    const { store } = await comMensalidade({ status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), paidUntil: null, asaasSubscriptionId: `sub_p22_${rand()}` });
    const [ext, can] = await Promise.all([
      request(app).post(`/api/admin/stores/${store.id}/saas/extend-trial`).set('Authorization', bearer(ceo)).send({ days: 7, reason: REASON }),
      cancel(ceo, store.id),
    ]);
    const statuses = [ext.status, can.status];
    expect(statuses).not.toContain(500);
    expect(statuses).not.toContain(502);
    if (can.status === 200) {
      expect(ext.status === 200 || (ext.status === 409 && ext.body.code === 'NOT_TRIALING')).toBe(true);
    } else {
      expect(ext.status).toBe(200);
      expect(can.status).toBe(409);
    }
    expect((await billingOf(store.id)).status === 'cancelled' || can.status === 409).toBe(true);
  });

  it('job (b): se apagar a assinatura criada em corrida falha, registra a assinatura órfã', async () => {
    const owner = await createTestUser('lojista', DOMAIN);
    await prisma.user.update({ where: { id: owner.userId }, data: { cpf: randomCpf() } });
    const store = await prisma.store.create({ data: { ownerId: owner.userId, name: `Loja p22 ${rand()}`, isOpen: true } });
    const billing = await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date(Date.now() + 10 * DAY) } });
    const subId = `sub_p22_orfa_${rand()}`;
    (asaasClient.post as jest.Mock).mockImplementation(async (path: string, body: any) => {
      if (path === '/customers') return { id: `cus_p22_${rand()}` };
      if (path === '/subscriptions' && body?.externalReference === `saas-sub:${billing.id}`) {
        await prisma.storeSaasBilling.update({ where: { id: billing.id }, data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ceo.userId } });
        return { id: subId };
      }
      return {};
    });
    (asaasClient.delete as jest.Mock).mockRejectedValue(new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]));
    const spy = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as any);
    try {
      await runSaasBillingCycle(new Date());
      const orfa = spy.mock.calls.find((c) => String(c[0]).includes('órfã'));
      expect(orfa).toBeDefined();
      expect(String(orfa![0])).toContain('apague manualmente');
      expect((orfa as any[])[2]).toMatchObject({ billingId: billing.id, storeId: store.id, subscriptionId: subId });
      expect(spy.mock.calls.some((c) => String(c[0]).includes('falha ao criar assinatura'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('aviso: cobertura já acabada não diz "segue vendendo"; dentro do período diz', async () => {
    const { store: vencida } = await comMensalidade({ paidUntil: utcDay(-10) });
    expect((await cancel(ceo, vencida.id)).status).toBe(200);
    const aviso = await prisma.notification.findFirst({ where: { userId: dono.userId, entityId: vencida.id, title: 'Mensalidade cancelada' } });
    expect(aviso!.message).toBe(`O DROP cancelou a mensalidade da sua loja. A loja já está fora do período pago e fica pausada. Motivo: ${REASON}`);
    expect(aviso!.message).not.toContain('segue vendendo');
  });

  it('cancelar marca como DELETED as faturas abertas e deixa as pagas', async () => {
    const { store, billing } = await comMensalidade({ asaasSubscriptionId: `sub_p22_${rand()}` });
    const mk = (status: string) => prisma.saasBillingPayment.create({
      data: { billingId: billing.id, asaasPaymentId: `pay_p22_${rand()}`, value: 49.9, dueDate: utcDay(5), status },
    });
    const [pend, over, rec] = [await mk('PENDING'), await mk('OVERDUE'), await mk('RECEIVED')];
    expect((await cancel(ceo, store.id)).status).toBe(200);
    const st = async (id: string) => (await prisma.saasBillingPayment.findUniqueOrThrow({ where: { id } })).status;
    expect(await st(pend.id)).toBe('DELETED');
    expect(await st(over.id)).toBe('DELETED');
    expect(await st(rec.id)).toBe('RECEIVED');
  });
});
