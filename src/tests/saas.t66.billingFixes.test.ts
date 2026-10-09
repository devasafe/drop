/**
 * Correções da revisão final da mensalidade SaaS (F1..F7). Um `describe` por correção.
 * Asaas mockado em services/asaas/client (sem rede).
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
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runSaasBillingCycle } from '../jobs/saasBilling.job';
import { isStoreBillingBlocked } from '../services/saasBilling/gate';
import { isStoreBlocked } from '../services/saasBilling/policy';
import env from '../config/env';

const DOMAIN = '@saas66.test';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T15:00:00.000Z');
let restore: () => Promise<void>;
let payments: Record<string, any[]> = {};

const rand = () => Math.random().toString(36).slice(2, 10);

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

async function makeStore(opts: { verified?: boolean } = {}) {
  const owner = await createTestUser('lojista', DOMAIN, { verified: opts.verified !== false });
  await prisma.user.update({ where: { id: owner.userId }, data: { cpf: randomCpf() } });
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: `Loja t66 ${rand()}`, isOpen: true } });
  return { store, owner };
}

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  payments = {};
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
  (asaasClient.post as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/customers') return { id: `cus_t66_${rand()}` };
    if (path === '/subscriptions') return { id: `sub_t66_${rand()}` };
    return {};
  });
  (asaasClient.get as jest.Mock).mockImplementation(async (path: string) => {
    const m = /^\/subscriptions\/([^/]+)\/payments/.exec(path);
    return { data: (m && payments[decodeURIComponent(m[1])]) || [], hasMore: false };
  });
  (asaasClient.put as jest.Mock).mockReset().mockResolvedValue({});
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
});
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

describe('F1 — loja com mensalidade 0 nunca é pausada', () => {
  const cfg = (fee: number) => ({ saasMonthlyFee: fee, saasGraceDays: 5 });
  const vencida = { status: 'trialing', trialEndsAt: new Date(NOW.getTime() - 30 * DAY), paidUntil: null };

  it('política: fee efetivo 0 (padrão 0 ou isenta) não bloqueia; fee > 0 bloqueia; cancelada sempre bloqueia', () => {
    expect(isStoreBlocked(vencida, NOW, cfg(0))).toBe(false);
    expect(isStoreBlocked({ ...vencida, customFee: 0 }, NOW, cfg(49.9))).toBe(false);
    expect(isStoreBlocked({ ...vencida, status: 'paused' }, NOW, cfg(0))).toBe(false);
    expect(isStoreBlocked(vencida, NOW, cfg(49.9))).toBe(true);
    expect(isStoreBlocked({ ...vencida, customFee: 10 }, NOW, cfg(0))).toBe(true);
    expect(isStoreBlocked({ ...vencida, status: 'cancelled' }, NOW, cfg(0))).toBe(true);
    expect(isStoreBlocked(null, NOW, cfg(49.9))).toBe(false);
  });

  it('job: padrão 0 → loja com teste vencido não é pausada; paused com fee 0 é despausada', async () => {
    await updatePlatformConfig({ saasMonthlyFee: 0 } as any, 'test');
    const { store: a } = await makeStore({ verified: false });
    const { store: b } = await makeStore({ verified: false });
    await prisma.storeSaasBilling.create({ data: { storeId: a.id, trialEndsAt: new Date(NOW.getTime() - 30 * DAY) } });
    await prisma.storeSaasBilling.create({ data: { storeId: b.id, trialEndsAt: new Date(NOW.getTime() - 30 * DAY), status: 'paused', pausedAt: NOW } });
    await runSaasBillingCycle(NOW);
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: a.id } }))!.status).toBe('trialing');
    const rb = await prisma.storeSaasBilling.findUnique({ where: { storeId: b.id } });
    expect(rb!.status).toBe('trialing');
    expect(rb!.pausedAt).toBeNull();
  });

  it('job: isenta (customFee 0) com padrão > 0 não é pausada', async () => {
    const { store } = await makeStore({ verified: false });
    await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date(NOW.getTime() - 30 * DAY), customFee: 0 } });
    await runSaasBillingCycle(NOW);
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: store.id } }))!.status).toBe('trialing');
  });

  it('gate e visões: fee 0 → não bloqueada', async () => {
    await updatePlatformConfig({ saasMonthlyFee: 0 } as any, 'test');
    const { store, owner } = await makeStore();
    await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date(Date.now() - 30 * DAY), status: 'past_due' } });
    expect(await isStoreBillingBlocked(store.id)).toBe(false);

    const mine = await request(app).get(`/api/stores/${store.id}/saas-billing`).set('Authorization', bearer(owner));
    expect(mine.status).toBe(200);
    expect(mine.body.data.blocked).toBe(false);

    const ceo = await createTestUser('ceo', DOMAIN);
    const list = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(list.body.data.find((x: any) => x.storeId === store.id).blocked).toBe(false);

    // Controle: com fee > 0 a mesma loja fica bloqueada.
    await updatePlatformConfig({ saasMonthlyFee: 49.9 } as any, 'test');
    expect(await isStoreBillingBlocked(store.id)).toBe(true);
  });
});

describe('F2 — troca de modo cancela/reabre as assinaturas', () => {
  const ORIGINAL = { pay: env.PAYMENT_GATEWAY, out: env.PAYOUT_GATEWAY };
  beforeEach(() => {
    (env as any).PAYMENT_GATEWAY = 'asaas';
    (env as any).PAYOUT_GATEWAY = 'asaas';
  });
  afterEach(() => {
    (env as any).PAYMENT_GATEWAY = ORIGINAL.pay;
    (env as any).PAYOUT_GATEWAY = ORIGINAL.out;
  });
  const putSwitch = (u: any, body: object) => request(app).put('/api/admin/switches').set('Authorization', bearer(u)).send(body);

  it('direto → custódia: apaga as assinaturas no Asaas e limpa o id; falha vira aviso e o job tenta de novo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const { store: ok } = await makeStore();
    const { store: falha } = await makeStore();
    const subOk = `sub_t66_${rand()}`;
    const subFalha = `sub_t66_${rand()}`;
    await prisma.storeSaasBilling.create({ data: { storeId: ok.id, trialEndsAt: NOW, asaasSubscriptionId: subOk } });
    await prisma.storeSaasBilling.create({ data: { storeId: falha.id, trialEndsAt: NOW, asaasSubscriptionId: subFalha } });
    (asaasClient.delete as jest.Mock).mockImplementation(async (path: string) => {
      if (path === `/subscriptions/${subFalha}`) throw new Error('Asaas fora do ar');
      return { deleted: true };
    });

    const res = await putSwitch(ceo, { settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP' });
    expect(res.status).toBe(200);
    expect(res.body.settlementMode).toBe('custodia');
    expect(asaasClient.delete).toHaveBeenCalledWith(`/subscriptions/${subOk}`);
    expect(asaasClient.delete).toHaveBeenCalledWith(`/subscriptions/${subFalha}`);
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: ok.id } }))!.asaasSubscriptionId).toBeNull();
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: falha.id } }))!.asaasSubscriptionId).toBe(subFalha);
    expect(res.body.saasBillingWarnings).toEqual(expect.arrayContaining([{ storeId: falha.id, error: 'Asaas fora do ar' }]));
    expect(res.body.saasBillingWarnings.find((w: any) => w.storeId === ok.id)).toBeUndefined();

    // Job no modo custódia: tenta de novo e, agora com o Asaas de volta, limpa.
    (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
    await runSaasBillingCycle(NOW);
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: falha.id } }))!.asaasSubscriptionId).toBeNull();
    expect(asaasClient.post).not.toHaveBeenCalled();
  });

  it('custódia → direto: reabre o teste, volta a trialing e limpa overdue/pausa; paidUntil e cancelled ficam', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia', saasTrialDays: 14 } as any, 'test');
    const ceo = await createTestUser('ceo', DOMAIN);
    const { store: pausada } = await makeStore();
    const { store: longa } = await makeStore();
    const { store: cancelada } = await makeStore();
    const paidUntil = new Date(Date.now() - 40 * DAY);
    const longe = new Date(Date.now() + 100 * DAY);
    await prisma.storeSaasBilling.create({
      data: { storeId: pausada.id, trialEndsAt: new Date(Date.now() - 90 * DAY), paidUntil, status: 'paused', pausedAt: new Date(), overdueSince: new Date(Date.now() - 45 * DAY) },
    });
    await prisma.storeSaasBilling.create({ data: { storeId: longa.id, trialEndsAt: longe, status: 'active' } });
    await prisma.storeSaasBilling.create({ data: { storeId: cancelada.id, trialEndsAt: new Date(Date.now() - 90 * DAY), status: 'cancelled' } });

    const before = Date.now();
    const res = await putSwitch(ceo, { settlementMode: 'direto', confirmSettlement: 'TROCAR PARA SAAS' });
    expect(res.status).toBe(200);
    expect(res.body.settlementMode).toBe('direto');

    const p = await prisma.storeSaasBilling.findUnique({ where: { storeId: pausada.id } });
    expect(p!.status).toBe('trialing');
    expect(p!.pausedAt).toBeNull();
    expect(p!.overdueSince).toBeNull();
    expect(p!.paidUntil!.getTime()).toBe(paidUntil.getTime());
    expect(p!.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + 14 * DAY);
    expect(p!.trialEndsAt.getTime()).toBeLessThanOrEqual(Date.now() + 14 * DAY);
    expect(await isStoreBillingBlocked(pausada.id)).toBe(false);

    const l = await prisma.storeSaasBilling.findUnique({ where: { storeId: longa.id } });
    expect(l!.trialEndsAt.getTime()).toBe(longe.getTime());
    expect((await prisma.storeSaasBilling.findUnique({ where: { storeId: cancelada.id } }))!.status).toBe('cancelled');
  });
});

describe('F3 — valor padrão novo chega às assinaturas existentes', () => {
  const puts = (subId: string) => (asaasClient.put as jest.Mock).mock.calls.filter(([p]) => p === `/subscriptions/${subId}`);
  const withSub = async (data: Record<string, unknown> = {}) => {
    const { store } = await makeStore();
    const subId = `sub_t66_${rand()}`;
    const billing = await prisma.storeSaasBilling.create({
      data: { storeId: store.id, trialEndsAt: new Date(NOW.getTime() + 10 * DAY), asaasSubscriptionId: subId, asaasCustomerId: 'cus_x', ...data } as any,
    });
    return { store, subId, billing };
  };

  it('ao criar a assinatura grava subscriptionValue', async () => {
    const { store } = await makeStore();
    await runSaasBillingCycle(NOW);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId: store.id } });
    expect(row!.asaasSubscriptionId).toMatch(/^sub_t66_/);
    expect(Number((row as any).subscriptionValue)).toBe(49.9);
    expect(puts(row!.asaasSubscriptionId!)).toHaveLength(0);
  });

  it('padrão mudou → job atualiza o valor no Asaas uma vez e grava', async () => {
    const { subId, billing } = await withSub({ subscriptionValue: 49.9 });
    await updatePlatformConfig({ saasMonthlyFee: 59.9 } as any, 'test');
    await runSaasBillingCycle(NOW);
    await runSaasBillingCycle(NOW);
    expect(puts(subId)).toHaveLength(1);
    expect(puts(subId)[0][1]).toEqual({ value: 59.9, updatePendingPayments: true });
    expect(Number((await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any).subscriptionValue)).toBe(59.9);
  });

  it('valor gravado desconhecido (linha antiga, null) → sincroniza com o fee atual', async () => {
    const { subId, billing } = await withSub();
    await runSaasBillingCycle(NOW);
    expect(puts(subId)).toHaveLength(1);
    expect(puts(subId)[0][1].value).toBe(49.9);
    expect(Number((await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any).subscriptionValue)).toBe(49.9);
  });

  it('padrão foi a 0 → apaga a assinatura e limpa id/valor', async () => {
    const { subId, billing } = await withSub({ subscriptionValue: 49.9 });
    await updatePlatformConfig({ saasMonthlyFee: 0 } as any, 'test');
    await runSaasBillingCycle(NOW);
    expect(asaasClient.delete).toHaveBeenCalledWith(`/subscriptions/${subId}`);
    const row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any;
    expect(row.asaasSubscriptionId).toBeNull();
    expect(row.subscriptionValue).toBeNull();
  });

  it('Asaas falha → nada gravado; o próximo ciclo tenta de novo', async () => {
    const { subId, billing } = await withSub({ subscriptionValue: 49.9 });
    await updatePlatformConfig({ saasMonthlyFee: 59.9 } as any, 'test');
    (asaasClient.put as jest.Mock).mockRejectedValueOnce(new Error('fora do ar'));
    await runSaasBillingCycle(NOW);
    expect(Number((await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any).subscriptionValue)).toBe(49.9);
    await runSaasBillingCycle(NOW);
    expect(puts(subId)).toHaveLength(2);
    expect(Number((await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any).subscriptionValue)).toBe(59.9);
  });

  it('valor especial do CEO grava subscriptionValue (e o job não reenvia)', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const { store, subId, billing } = await withSub({ subscriptionValue: 49.9 });
    const r = await request(app).put(`/api/admin/stores/${store.id}/saas-billing`).set('Authorization', bearer(ceo)).send({ customFee: 30 });
    expect(r.status).toBe(200);
    expect(Number((await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } }) as any).subscriptionValue)).toBe(30);
    await runSaasBillingCycle(NOW);
    expect(puts(subId)).toHaveLength(1);
  });
});
