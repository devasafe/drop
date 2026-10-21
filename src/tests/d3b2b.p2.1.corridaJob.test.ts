/**
 * D3b-2b · P2.1 correção 1 — o job não pode gravar com base numa leitura velha depois de um
 * "estender teste": a assinatura criada com o vencimento antigo é desfeita (b) e a pausa não
 * atinge a loja que acabou de ser estendida (d). Asaas mockado.
 */
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

const DOMAIN = '@d3b2bp21c1.test';
const DAY = 86_400_000;
const NOW = new Date('2026-10-01T15:00:00.000Z');
let restore: () => Promise<void>;

const rand = () => Math.random().toString(36).slice(2, 10);

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  jest.clearAllMocks();
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'test');
  (asaasClient.get as jest.Mock).mockResolvedValue({ data: [], hasMore: false });
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

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

async function loja(data: Record<string, unknown>) {
  const owner = await createTestUser('lojista', DOMAIN, { verified: true });
  await prisma.user.update({ where: { id: owner.userId }, data: { cpf: randomCpf() } });
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: `Loja c1 ${rand()}`, isOpen: true } });
  const billing = await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'trialing', ...data } as any });
  return { store, billing };
}

describe('job × estender teste', () => {
  it('b) estender entre a leitura e a gravação: a assinatura criada com o vencimento velho é apagada e a linha fica sem id', async () => {
    const { billing } = await loja({ trialEndsAt: new Date(NOW.getTime() + 5 * DAY) });
    const subId = `sub_c1_${rand()}`;
    (asaasClient.post as jest.Mock).mockImplementation(async (path: string, body: any) => {
      if (path === '/customers') return { id: `cus_c1_${rand()}` };
      if (path === '/subscriptions') {
        if (body?.externalReference === `saas-sub:${billing.id}`) {
          await prisma.storeSaasBilling.update({ where: { id: billing.id }, data: { trialEndsAt: new Date(NOW.getTime() + 19 * DAY) } });
          return { id: subId };
        }
        return { id: `sub_outra_${rand()}` };
      }
      return {};
    });
    await runSaasBillingCycle(NOW);
    expect((asaasClient.delete as jest.Mock).mock.calls).toContainEqual([`/subscriptions/${subId}`]);
    const row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    expect(row.asaasSubscriptionId).toBeNull();
  });

  it('d) estender entre a leitura e a pausa: a loja estendida não é pausada', async () => {
    const { billing } = await loja({ trialEndsAt: new Date(NOW.getTime() - 20 * DAY) });
    (asaasClient.post as jest.Mock).mockResolvedValue({ id: `x_${rand()}` });
    const original = prisma.storeSaasBilling.updateMany.bind(prisma.storeSaasBilling);
    jest.spyOn(prisma.storeSaasBilling, 'updateMany').mockImplementation((async (args: any) => {
      if (args?.where?.id === billing.id && args?.data?.status === 'paused') {
        await prisma.storeSaasBilling.update({ where: { id: billing.id }, data: { trialEndsAt: new Date(NOW.getTime() + 10 * DAY) } });
      }
      return original(args);
    }) as any);
    await runSaasBillingCycle(NOW);
    const row = await prisma.storeSaasBilling.findUniqueOrThrow({ where: { id: billing.id } });
    expect(row.status).toBe('trialing');
  });
});
