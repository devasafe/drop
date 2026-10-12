// src/tests/d1.p4.9.saasBillingView.test.ts
/** D1 · P4.9 — tela de assinatura: faturas pagas, data do bloqueio e valores da mensalidade. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { billingBlockAt, isBillingBlocked } from '../services/saasBilling/policy';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p49.test';
const DAY = 24 * 60 * 60 * 1000;
const CFG = { saasMonthlyFee: 49.9, saasGraceDays: 5 };

describe('billingBlockAt (puro)', () => {
  const trial = { status: 'trialing', trialEndsAt: new Date('2026-10-10T15:00:00Z'), paidUntil: null, asaasSubscriptionId: 'sub_1', customFee: null };

  it('fim do dia (Brasília) da cobertura + tolerância', () => {
    expect(billingBlockAt(trial, CFG)!.toISOString()).toBe('2026-10-16T03:00:00.000Z');
  });
  it('é exatamente a fronteira de isBillingBlocked', () => {
    const at = billingBlockAt(trial, CFG)!;
    expect(isBillingBlocked(trial, at, CFG.saasGraceDays)).toBe(false);
    expect(isBillingBlocked(trial, new Date(at.getTime() + 1), CFG.saasGraceDays)).toBe(true);
  });
  it('paidUntil maior que o teste manda', () => {
    const b = { ...trial, status: 'active', paidUntil: new Date('2026-11-10T00:00:00Z') };
    expect(billingBlockAt(b, CFG)!.toISOString()).toBe('2026-11-16T03:00:00.000Z');
  });
  it('nunca será pausada → null', () => {
    expect(billingBlockAt(null, CFG)).toBeNull();
    expect(billingBlockAt({ ...trial, asaasSubscriptionId: null }, CFG)).toBeNull();
    expect(billingBlockAt({ ...trial, customFee: 0 }, CFG)).toBeNull();
    expect(billingBlockAt(trial, { ...CFG, saasMonthlyFee: 0 })).toBeNull();
    expect(billingBlockAt({ ...trial, status: 'cancelled' }, CFG)).toBeNull();
  });
});

describe('GET /api/stores/:id/saas-billing e /api/settings/saas', () => {
  let restore: () => Promise<void>;
  let owner: TestUser;
  let storeId: string;
  beforeAll(async () => { restore = await snapshotPlatformConfig(); });
  afterAll(async () => { await restore(); await prisma.$disconnect(); });
  beforeEach(async () => {
    await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
    owner = await createTestUser('lojista', DOMAIN);
    storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja P49', isOpen: true } })).id;
  });
  afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

  const get = () => request(app).get(`/api/stores/${storeId}/saas-billing`).set('Authorization', bearer(owner));

  it('payments: só as pagas, mais recentes primeiro, com os campos do contrato', async () => {
    const b = await prisma.storeSaasBilling.create({
      data: { storeId, status: 'active', trialEndsAt: new Date(Date.now() - 20 * DAY), paidUntil: new Date(Date.now() + 10 * DAY), asaasSubscriptionId: `sub_p49_${Date.now()}` },
    });
    const mk = (status: string, due: string, paidAt: Date | null) => prisma.saasBillingPayment.create({
      data: { billingId: b.id, asaasPaymentId: `pay_p49_${Math.random().toString(36).slice(2)}`, value: 49.9, dueDate: new Date(due), status, invoiceUrl: `https://asaas/i/${due}`, paidAt },
    });
    await mk('RECEIVED', '2026-08-15T00:00:00Z', new Date('2026-08-14T12:00:00Z'));
    await mk('CONFIRMED', '2026-09-15T00:00:00Z', new Date('2026-09-15T09:00:00Z'));
    await mk('PENDING', '2026-10-15T00:00:00Z', null);

    const r = await get();
    expect(r.status).toBe(200);
    const p = r.body.data.payments;
    expect(p).toHaveLength(2);
    expect(p.map((x: any) => x.dueDate)).toEqual(['2026-09-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z']);
    expect(Object.keys(p[0]).sort()).toEqual(['dueDate', 'id', 'invoiceUrl', 'paidAt', 'value']);
    expect(p[0]).toMatchObject({ value: 49.9, invoiceUrl: 'https://asaas/i/2026-09-15T00:00:00Z' });
    expect(typeof r.body.data.blockAt).toBe('string');
  });

  it('no máximo 12 faturas', async () => {
    const b = await prisma.storeSaasBilling.create({ data: { storeId, trialEndsAt: new Date(), asaasSubscriptionId: `sub_p49b_${Date.now()}` } });
    for (let i = 0; i < 14; i++) {
      await prisma.saasBillingPayment.create({
        data: { billingId: b.id, asaasPaymentId: `pay_p49b_${i}_${Math.random().toString(36).slice(2)}`, value: 10, dueDate: new Date(Date.UTC(2025, i, 15)), status: 'RECEIVED', paidAt: new Date(Date.UTC(2025, i, 15)) },
      });
    }
    const r = await get();
    expect(r.body.data.payments).toHaveLength(12);
  });

  it('sem assinatura: blockAt null e payments vazio', async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.body.data.blockAt).toBeNull();
    expect(r.body.data.payments).toEqual([]);
  });

  it('/settings/saas: logado recebe mensalidade e dias de teste; anônimo mantém o formato de hoje', async () => {
    const logged = await request(app).get('/api/settings/saas').set('Authorization', bearer(owner));
    expect(logged.status).toBe(200);
    expect(logged.body).toMatchObject({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14 });
    const anon = await request(app).get('/api/settings/saas');
    expect(anon.body).not.toHaveProperty('saasMonthlyFee');
    expect(anon.body).not.toHaveProperty('saasTrialDays');
  });
});
