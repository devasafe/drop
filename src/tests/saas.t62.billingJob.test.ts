jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  };
});
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runSaasBillingCycle } from '../jobs/saasBilling.job';
import { applySaasPayment } from '../services/saasBilling/payments';

const DOMAIN = '@saas62.test';
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T15:00:00.000Z');
let restore: () => Promise<void>;
let payments: Record<string, any[]> = {};

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
  return prisma.store.create({ data: { ownerId: owner.userId, name: `Loja t62 ${Math.random().toString(36).slice(2, 6)}`, isOpen: true } });
}

const rand = () => Math.random().toString(36).slice(2, 10);
const subCalls = (billingId: string) =>
  (asaasClient.post as jest.Mock).mock.calls.filter(([p, b]) => p === '/subscriptions' && b?.externalReference === `saas-sub:${billingId}`);

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  payments = {};
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
  (asaasClient.post as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/customers') return { id: `cus_t62_${rand()}` };
    if (path === '/subscriptions') return { id: `sub_t62_${rand()}` };
    return {};
  });
  (asaasClient.get as jest.Mock).mockImplementation(async (path: string) => {
    const m = /^\/subscriptions\/([^/]+)\/payments/.exec(path);
    return { data: (m && payments[decodeURIComponent(m[1])]) || [], hasMore: false };
  });
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
});
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

describe('t62 — job da mensalidade SaaS', () => {
  it('backfill: loja sem linha ganha trialing com trialEndsAt = now + trialDays; rodar 2x não duplica', async () => {
    const store = await makeStore({ verified: false });
    await runSaasBillingCycle(NOW);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId: store.id } });
    expect(row).toMatchObject({ status: 'trialing' });
    expect(row!.trialEndsAt.getTime()).toBe(NOW.getTime() + 14 * DAY);

    await runSaasBillingCycle(new Date(NOW.getTime() + DAY));
    const rows = await prisma.storeSaasBilling.findMany({ where: { storeId: store.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].trialEndsAt.getTime()).toBe(NOW.getTime() + 14 * DAY);
  });

  it('cria a assinatura uma vez só, vencendo no fim do teste com o fee efetivo e customer dedicado', async () => {
    const store = await makeStore();
    await runSaasBillingCycle(NOW);
    await runSaasBillingCycle(NOW);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId: store.id } });
    const calls = subCalls(row!.id);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      value: 49.9, nextDueDate: '2026-10-15', cycle: 'MONTHLY', billingType: 'UNDEFINED',
      customer: row!.asaasCustomerId,
    });
    expect(calls[0][1].description).toContain(store.name);
    expect(row!.asaasSubscriptionId).toMatch(/^sub_t62_/);
    const customers = (asaasClient.post as jest.Mock).mock.calls.filter(([p, b]) => p === '/customers' && b?.externalReference === `saas-store:${store.id}`);
    expect(customers).toHaveLength(1);
    expect(customers[0][1].cpfCnpj).toMatch(/^\d{11}$/);
  });

  it('dono sem documento aprovado → não cria assinatura; fee 0 → não cria', async () => {
    const semDoc = await makeStore({ verified: false });
    const isenta = await makeStore();
    await prisma.storeSaasBilling.create({ data: { storeId: isenta.id, trialEndsAt: new Date(NOW.getTime() + 14 * DAY), customFee: 0 } });
    await runSaasBillingCycle(NOW);
    for (const s of [semDoc, isenta]) {
      const row = await prisma.storeSaasBilling.findUnique({ where: { storeId: s.id } });
      expect(row!.asaasSubscriptionId).toBeNull();
      expect(subCalls(row!.id)).toHaveLength(0);
    }
  });

  it('reconciliação: RECEIVED → paidUntil = dueDate + 1 mês e active; reaplicar não avança; OVERDUE → past_due', async () => {
    const store = await makeStore();
    const subId = `sub_t62_${rand()}`;
    const billing = await prisma.storeSaasBilling.create({
      data: { storeId: store.id, trialEndsAt: new Date(NOW.getTime() - DAY), asaasSubscriptionId: subId, asaasCustomerId: 'cus_x' },
    });
    const pay = { id: `pay_t62_${rand()}`, status: 'RECEIVED', dueDate: '2026-10-15', value: 49.9, invoiceUrl: 'https://asaas/i/1', paymentDate: '2026-10-14' };
    payments[subId] = [pay];
    await runSaasBillingCycle(NOW);
    let row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('active');
    expect(row!.paidUntil!.toISOString()).toBe('2026-11-15T00:00:00.000Z');

    await runSaasBillingCycle(NOW);
    await applySaasPayment(billing.id, pay);
    row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.paidUntil!.toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(await prisma.saasBillingPayment.count({ where: { billingId: billing.id } })).toBe(1);

    const late = { id: `pay_t62_${rand()}`, status: 'OVERDUE', dueDate: '2026-11-15', value: 49.9, invoiceUrl: null };
    payments[subId] = [pay, late];
    await runSaasBillingCycle(new Date('2026-11-17T12:00:00.000Z'));
    row = await prisma.storeSaasBilling.findUnique({ where: { id: billing.id } });
    expect(row!.status).toBe('past_due');
    expect(row!.overdueSince!.toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });

  it('pausa: teste vencido além da tolerância → paused; dentro da tolerância → não; desbloqueada volta', async () => {
    const vencida = await makeStore({ verified: false });
    const tolerancia = await makeStore({ verified: false });
    const liberada = await makeStore({ verified: false });
    await prisma.storeSaasBilling.create({ data: { storeId: vencida.id, trialEndsAt: new Date(NOW.getTime() - 6 * DAY) } });
    await prisma.storeSaasBilling.create({ data: { storeId: tolerancia.id, trialEndsAt: new Date(NOW.getTime() - 4 * DAY) } });
    await prisma.storeSaasBilling.create({
      data: { storeId: liberada.id, trialEndsAt: new Date(NOW.getTime() - 20 * DAY), paidUntil: new Date(NOW.getTime() + 10 * DAY), status: 'paused', pausedAt: NOW },
    });
    await runSaasBillingCycle(NOW);
    const v = await prisma.storeSaasBilling.findUnique({ where: { storeId: vencida.id } });
    expect(v!.status).toBe('paused');
    expect(v!.pausedAt!.getTime()).toBe(NOW.getTime());
    const t = await prisma.storeSaasBilling.findUnique({ where: { storeId: tolerancia.id } });
    expect(t!.status).toBe('trialing');
    expect(t!.pausedAt).toBeNull();
    const l = await prisma.storeSaasBilling.findUnique({ where: { storeId: liberada.id } });
    expect(l!.status).toBe('active');
    expect(l!.pausedAt).toBeNull();
  });

  it('modo custódia → o ciclo não faz nada', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const store = await makeStore();
    await runSaasBillingCycle(NOW);
    expect(await prisma.storeSaasBilling.findUnique({ where: { storeId: store.id } })).toBeNull();
    expect(asaasClient.post).not.toHaveBeenCalled();
    expect(asaasClient.get).not.toHaveBeenCalled();
  });
});
