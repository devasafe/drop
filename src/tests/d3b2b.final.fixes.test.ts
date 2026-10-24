/**
 * D3b-2b · onda final de correção (backend).
 *  A) ruling do controlador: a pausa do DROP é o único bloqueio da loja cancelada. A política e a
 *     vitrine não bloqueiam mais por `cancelled`; o passo 0 do job pausa no fim da cobertura e,
 *     quando o admin libera, a loja volta a vender (ponta a ponta).
 *  B) estender e cancelar a mensalidade só no modo direto (ficha + 409 SAAS_NOT_DIRECT).
 *  C) a reconciliação não ressuscita a fatura apagada (DELETED + PENDING/OVERDUE do Asaas).
 *  D1) histórico Asaas da ficha com select explícito.
 * Asaas mockado.
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
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runSaasBillingCycle } from '../jobs/saasBilling.job';
import { unpauseStoreByAdmin } from '../services/adminAccounts/storePause';
import { isStoreBillingBlocked } from '../services/saasBilling/gate';
import { isStoreHiddenFromPublic } from '../services/catalog/visibility';
import { isBillingBlocked, isStoreBlocked } from '../services/saasBilling/policy';
import { applySaasPayment } from '../services/saasBilling/payments';
import { paymentsReadyStoreData } from './helpers/storeConsent';

const DOMAIN = '@d3b2bfinal.test';
const REASON = 'Loja pediu para sair do DROP';
const DAY = 86_400_000;
let restore: () => Promise<void>;
let ceo: TestUser;
let dono: TestUser;

const rand = () => Math.random().toString(36).slice(2, 10);
const utcDay = (n: number) => new Date(Math.floor((Date.now() + n * DAY) / DAY) * DAY);

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  (asaasClient.post as jest.Mock).mockImplementation(async (path: string) => {
    if (path === '/customers') return { id: `cus_fin_${rand()}` };
    if (path === '/subscriptions') return { id: `sub_fin_${rand()}` };
    return {};
  });
  (asaasClient.get as jest.Mock).mockResolvedValue({ data: [], hasMore: false });
  (asaasClient.put as jest.Mock).mockResolvedValue({});
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'd3b2b-final');
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const loja = () =>
  prisma.store.create({
    data: { ownerId: dono.userId, name: `Loja fin ${rand()}`, isOpen: true, isVerified: true, latitude: '-22.90', longitude: '-43.20', ...paymentsReadyStoreData() } as any,
  });
const comMensalidade = async (data: Record<string, unknown> = {}) => {
  const store = await loja();
  const billing = await prisma.storeSaasBilling.create({
    data: { storeId: store.id, status: 'active', trialEndsAt: new Date(Date.now() - 20 * DAY), paidUntil: utcDay(10), ...data } as any,
  });
  return { store, billing };
};

describe('A · a pausa do DROP é o único bloqueio da loja cancelada', () => {
  it('política: cancelled não bloqueia nem depois do fim da cobertura', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    const cfg = { saasMonthlyFee: 49.9, saasGraceDays: 5 };
    const vencida = { status: 'cancelled', trialEndsAt: new Date('2026-09-01T12:00:00.000Z'), paidUntil: new Date('2026-10-10T00:00:00.000Z'), asaasSubscriptionId: null, customFee: null };
    expect(isBillingBlocked(vencida, now, 5)).toBe(false);
    expect(isStoreBlocked(vencida, now, cfg)).toBe(false);
  });

  it('ponta a ponta: cancelada vencida → o job pausa (some pela pausa) → o admin libera → volta à vitrine e ao checkout → o job seguinte não pausa de novo', async () => {
    const { store } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(Date.now() - 20 * DAY), cancelledBy: ceo.userId, paidUntil: utcDay(-3) });

    // 1) cancelada vencida, antes do job: a mensalidade sozinha não esconde nem bloqueia
    expect(await isStoreBillingBlocked(store.id)).toBe(false);
    expect((await request(app).get(`/api/stores/${store.id}`)).status).toBe(200);

    // 2) o job pausa pelo DROP e a loja some da vitrine pela pausa
    await runSaasBillingCycle(new Date());
    const pausada = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(pausada.adminPauseReason).toBe('Mensalidade cancelada');
    expect(await isStoreHiddenFromPublic(store.id)).toBe(true);
    expect((await request(app).get(`/api/stores/${store.id}`)).status).toBe(404);

    // 3) o admin libera
    await unpauseStoreByAdmin(store.id, { id: ceo.userId, role: 'ceo' }, 'Combinado com o lojista');

    // 4) volta à vitrine e o gate do checkout direto aceita
    expect(await isStoreHiddenFromPublic(store.id)).toBe(false);
    expect((await request(app).get(`/api/stores/${store.id}`)).status).toBe(200);
    expect(await isStoreBillingBlocked(store.id)).toBe(false);

    // 5) o job da hora seguinte não pausa de novo
    await runSaasBillingCycle(new Date(Date.now() + 3_600_000));
    expect((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).adminPausedAt).toBeNull();
    expect((await prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId: store.id } })).status).toBe('cancelled');
  });

  it('tela do lojista e lista do admin: a cancelada vencida não aparece bloqueada', async () => {
    const { store } = await comMensalidade({ status: 'cancelled', cancelledAt: new Date(), paidUntil: utcDay(-10) });
    const tela = await request(app).get(`/api/stores/${store.id}/saas-billing`).set('Authorization', bearer(dono));
    expect(tela.body.data).toMatchObject({ status: 'cancelled', blocked: false });
    const lista = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(lista.body.data.find((s: any) => s.storeId === store.id)).toMatchObject({ status: 'cancelled', blocked: false });
  });
});

describe('B · estender e cancelar só no modo direto', () => {
  const detail = (id: string) => request(app).get(`/api/admin/stores/${id}`).set('Authorization', bearer(ceo));

  it('custódia: a ficha não oferece as duas ações; no direto oferece', async () => {
    const { store } = await comMensalidade({ status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), paidUntil: null });
    let res = await detail(store.id);
    expect(res.body.can).toMatchObject({ extendTrial: true, cancelSaas: true });

    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'd3b2b-final');
    res = await detail(store.id);
    expect(res.status).toBe(200);
    expect(res.body.can).toMatchObject({ extendTrial: false, cancelSaas: false });
  });

  it('custódia: estender e cancelar respondem 409 SAAS_NOT_DIRECT e nada muda', async () => {
    const { store } = await comMensalidade({ status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), paidUntil: null });
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'd3b2b-final');

    const ext = await request(app).post(`/api/admin/stores/${store.id}/saas/extend-trial`).set('Authorization', bearer(ceo)).send({ days: 7, reason: REASON });
    expect(ext.status).toBe(409);
    expect(ext.body).toEqual({ error: 'A mensalidade só existe no modo direto.', code: 'SAAS_NOT_DIRECT' });

    const can = await request(app).post(`/api/admin/stores/${store.id}/saas/cancel`).set('Authorization', bearer(ceo)).send({ reason: REASON });
    expect(can.status).toBe(409);
    expect(can.body.code).toBe('SAAS_NOT_DIRECT');

    const row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId: store.id } });
    expect(row.status).toBe('trialing');
    expect(await prisma.adminAccountAction.count({ where: { storeId: store.id } })).toBe(0);
    expect((asaasClient.delete as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('C · a reconciliação não ressuscita fatura apagada', () => {
  it.each(['PENDING', 'OVERDUE'])('fatura local DELETED e o Asaas manda %s: segue DELETED, sem past_due, com logger.info', async (status) => {
    const { billing } = await comMensalidade({ status: 'active' });
    const id = `pay_fin_${rand()}`;
    await prisma.saasBillingPayment.create({ data: { billingId: billing.id, asaasPaymentId: id, value: 49.9, dueDate: utcDay(-2), status: 'DELETED' } });
    const info = jest.spyOn(logger, 'info');

    await applySaasPayment(billing.id, { id, status, dueDate: utcDay(-2).toISOString().slice(0, 10), value: 49.9 } as any);

    expect((await prisma.saasBillingPayment.findUniqueOrThrow({ where: { asaasPaymentId: id } })).status).toBe('DELETED');
    const row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    expect(row.status).toBe('active');
    expect(row.overdueSince).toBeNull();
    expect(info.mock.calls.some(([msg]) => String(msg).includes('apagada'))).toBe(true);
  });

  it('fatura DELETED que o Asaas manda paga continua valendo (só os abertos são ignorados)', async () => {
    const { billing } = await comMensalidade({ status: 'active', paidUntil: utcDay(10) });
    const id = `pay_fin_${rand()}`;
    await prisma.saasBillingPayment.create({ data: { billingId: billing.id, asaasPaymentId: id, value: 49.9, dueDate: utcDay(10), status: 'DELETED' } });
    await applySaasPayment(billing.id, { id, status: 'RECEIVED', dueDate: utcDay(10).toISOString().slice(0, 10), value: 49.9 } as any);
    expect((await prisma.saasBillingPayment.findUniqueOrThrow({ where: { asaasPaymentId: id } })).status).toBe('RECEIVED');
  });
});

describe('D1 · histórico Asaas da ficha com select explícito', () => {
  it('o findMany de storeAsaasAudit pede só as colunas usadas', async () => {
    const { store } = await comMensalidade();
    const spy = jest.spyOn(prisma.storeAsaasAudit, 'findMany');
    const res = await request(app).get(`/api/admin/stores/${store.id}`).set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as any).select).toEqual({ action: true, apiKeyLast4: true, actorId: true, createdAt: true });
  });
});
