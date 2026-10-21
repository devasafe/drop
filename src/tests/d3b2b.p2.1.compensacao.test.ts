/**
 * D3b-2b · P2.1 correção 1 — estado parcial no Asaas: se algo falha depois do PUT do nextDueDate,
 * o vencimento volta ao anterior (best-effort). 502 "nada foi alterado" só quando nenhuma fatura
 * foi apagada e a volta deu certo; senão 502 ASAAS_PARTIAL. Asaas mockado.
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
import * as actions from '../services/adminAccounts/actions';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { saoPauloToday } from '../services/asaasLoja/charge';

const DOMAIN = '@d3b2bp21k.test';
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
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const cobranca = async () => {
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: `Loja k ${rand()}`, isOpen: true } });
  const subId = `sub_k_${rand()}`;
  const billing = await prisma.storeSaasBilling.create({
    data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date(Date.now() + 5 * DAY), asaasSubscriptionId: subId },
  });
  return { store, billing, subId, oldDue: saoPauloToday(billing.trialEndsAt) };
};
const extend = (id: string) =>
  request(app).post(`/api/admin/stores/${id}/saas/extend-trial`).set('Authorization', bearer(ceo)).send({ days: 14, reason: REASON });
const billingOf = (storeId: string) => prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId } });
const actionsOf = (storeId: string) => prisma.adminAccountAction.findMany({ where: { storeId } });
const open = (dueDate: string) => ({ id: `pay_k_${rand()}`, status: 'PENDING', dueDate, value: 49.9 });

describe('extend-trial: compensação do vencimento no Asaas', () => {
  it('DELETE falha: o PUT volta ao vencimento anterior, 502 "nada alterado" e o DROP fica igual', async () => {
    const { store, billing, subId, oldDue } = await cobranca();
    payments[subId] = [open(oldDue)];
    (asaasClient.delete as jest.Mock).mockRejectedValue(new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]));
    const res = await extend(store.id);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('ASAAS_UPDATE_FAILED');
    const puts = calls(asaasClient.put);
    expect(puts).toHaveLength(2);
    expect(puts[1]).toEqual([`/subscriptions/${subId}`, { nextDueDate: oldDue }]);
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
    expect(await actionsOf(store.id)).toHaveLength(0);
  });

  it('1ª fatura apagada e a 2ª falha: 502 ASAAS_PARTIAL, vencimento devolvido e DROP igual', async () => {
    const { store, billing, subId, oldDue } = await cobranca();
    const [a, b] = [open(oldDue), open(oldDue)];
    payments[subId] = [a, b];
    (asaasClient.delete as jest.Mock).mockImplementation(async (path: string) => {
      if (path === `/payments/${b.id}`) throw new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]);
      return { deleted: true };
    });
    const res = await extend(store.id);
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'O Asaas ficou parcialmente atualizado. Tente de novo para concluir.', code: 'ASAAS_PARTIAL' });
    expect(calls(asaasClient.put)[1]).toEqual([`/subscriptions/${subId}`, { nextDueDate: oldDue }]);
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
    expect(await actionsOf(store.id)).toHaveLength(0);
  });

  it('a transação falha depois das chamadas ao Asaas: o PUT de volta é chamado e o erro não é engolido', async () => {
    const { store, billing, subId, oldDue } = await cobranca();
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValue(new Error('banco caiu'));
    const res = await extend(store.id);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.code).not.toBe('ASAAS_PARTIAL');
    const puts = calls(asaasClient.put);
    expect(puts).toHaveLength(2);
    expect(puts[1]).toEqual([`/subscriptions/${subId}`, { nextDueDate: oldDue }]);
    expect((await billingOf(store.id)).trialEndsAt.getTime()).toBe(billing.trialEndsAt.getTime());
  });

  it('a compensação também falha: ASAAS_PARTIAL', async () => {
    const { store, subId, oldDue } = await cobranca();
    payments[subId] = [open(oldDue)];
    (asaasClient.delete as jest.Mock).mockRejectedValue(new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]));
    (asaasClient.put as jest.Mock).mockResolvedValueOnce({}).mockRejectedValue(new AsaasApiError(500, [{ code: 'x', description: 'fora do ar' }]));
    const res = await extend(store.id);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('ASAAS_PARTIAL');
  });
});
