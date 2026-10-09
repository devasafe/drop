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
  (asaasClient.put as jest.Mock).mockResolvedValue({});
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
