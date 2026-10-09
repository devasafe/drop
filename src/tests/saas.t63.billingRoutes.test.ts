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
import { updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@saas63.test';
const DAY = 24 * 60 * 60 * 1000;
let restore: () => Promise<void>;
let ceo: TestUser, gerente: TestUser, owner: TestUser, outro: TestUser, storeId: string;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  await prisma.rolePermissions.upsert({
    where: { role: 'gerente_geral' },
    create: { role: 'gerente_geral', permissions: ['settings:manage'], notificationTargets: [], updatedBy: 'test' },
    update: { permissions: ['settings:manage'] },
  });
});
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  (asaasClient.put as jest.Mock).mockResolvedValue({});
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  gerente = await createTestUser('gerente_geral', DOMAIN);
  owner = await createTestUser('lojista', DOMAIN);
  outro = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja t63', isOpen: true } })).id;
});
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

const putFee = (u: TestUser, customFee: number | null) =>
  request(app).put(`/api/admin/stores/${storeId}/saas-billing`).set('Authorization', bearer(u)).send({ customFee });
const withSub = (subId = `sub_t63_${Math.random().toString(36).slice(2, 10)}`) =>
  prisma.storeSaasBilling.create({ data: { storeId, trialEndsAt: new Date(Date.now() + 14 * DAY), asaasSubscriptionId: subId } });

describe('t63 — rotas da mensalidade SaaS', () => {
  it('CEO grava o valor especial e atualiza a assinatura no Asaas', async () => {
    const b = await withSub();
    const r = await putFee(ceo, 30);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ customFee: 30, fee: 30 });
    expect(asaasClient.put).toHaveBeenCalledWith(`/subscriptions/${b.asaasSubscriptionId}`, { value: 30, updatePendingPayments: true });
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    expect(Number(row!.customFee)).toBe(30);
  });

  it('CEO cria a linha se faltar (sem assinatura não chama o Asaas)', async () => {
    const r = await putFee(ceo, 10);
    expect(r.status).toBe(200);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    expect(row).toMatchObject({ status: 'trialing' });
    expect(Number(row!.customFee)).toBe(10);
    expect(asaasClient.put).not.toHaveBeenCalled();
  });

  it('isentar (0) com assinatura ativa remove a assinatura no Asaas', async () => {
    const b = await withSub();
    const r = await putFee(ceo, 0);
    expect(r.status).toBe(200);
    expect(asaasClient.delete).toHaveBeenCalledWith(`/subscriptions/${b.asaasSubscriptionId}`);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    expect(Number(row!.customFee)).toBe(0);
    expect(row!.asaasSubscriptionId).toBeNull();
  });

  it('não-CEO (gerente com settings:manage, lojista) → 403 e nada muda', async () => {
    await withSub();
    for (const u of [gerente, owner]) {
      expect((await putFee(u, 30)).status).toBe(403);
    }
    expect(asaasClient.put).not.toHaveBeenCalled();
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    expect(row!.customFee).toBeNull();
  });

  it('Asaas falha → 502 e customFee inalterado', async () => {
    await withSub();
    (asaasClient.put as jest.Mock).mockRejectedValue(new AsaasApiError(400, [{ code: 'x', description: 'falhou' }]));
    const r = await putFee(ceo, 30);
    expect(r.status).toBe(502);
    const row = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    expect(row!.customFee).toBeNull();
  });

  it('valor inválido → 400', async () => {
    for (const v of [-1, 100001, 'abc']) {
      expect((await putFee(ceo, v as any)).status).toBe(400);
    }
  });

  it('GET admin lista as lojas com o fee efetivo', async () => {
    await putFee(ceo, 12.5);
    const r = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    const item = r.body.data.find((x: any) => x.storeId === storeId);
    expect(item).toMatchObject({ storeName: 'Loja t63', status: 'trialing', customFee: 12.5, fee: 12.5 });
    expect((await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(owner))).status).toBe(403);
  });

  it('GET do lojista: dono vê (linha criada sob demanda); outro lojista 403', async () => {
    const r = await request(app).get(`/api/stores/${storeId}/saas-billing`).set('Authorization', bearer(owner));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'trialing', fee: 49.9, nextPayment: null, blocked: false, paidUntil: null });
    expect(new Date(r.body.data.trialEndsAt).getTime()).toBeGreaterThan(Date.now() + 13 * DAY);

    const b = await prisma.storeSaasBilling.findUnique({ where: { storeId } });
    await prisma.saasBillingPayment.create({
      data: { billingId: b!.id, asaasPaymentId: `pay_t63_${Math.random().toString(36).slice(2, 10)}`, value: 49.9, dueDate: new Date('2026-10-15T00:00:00Z'), status: 'PENDING', invoiceUrl: 'https://asaas/i/9' },
    });
    const r2 = await request(app).get(`/api/stores/${storeId}/saas-billing`).set('Authorization', bearer(owner));
    expect(r2.body.data.nextPayment).toMatchObject({ value: 49.9, status: 'PENDING', invoiceUrl: 'https://asaas/i/9' });

    expect((await request(app).get(`/api/stores/${storeId}/saas-billing`).set('Authorization', bearer(outro))).status).toBe(403);
  });

  it('GET do lojista no modo custódia → 404 FEATURE_DISABLED', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const r = await request(app).get(`/api/stores/${storeId}/saas-billing`).set('Authorization', bearer(owner));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('FEATURE_DISABLED');
  });
});
