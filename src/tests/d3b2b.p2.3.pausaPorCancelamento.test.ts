/**
 * D3b-2b · P2.3 — o job da mensalidade pausa pelo admin ("Mensalidade cancelada", ator system) a loja
 * cancelada cuja cobertura acabou, em qualquer modo; rodar de novo não duplica; se o admin liberou a
 * pausa do cancelamento, o job não pausa de novo (Review Focus 2); uma loja com erro não para as
 * outras. Asaas mockado (o ciclo do modo direto passa pelas outras lojas do banco de teste).
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
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, TestUser } from './helpers/authUser';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { runSaasBillingCycle } from '../jobs/saasBilling.job';
import * as storePause from '../services/adminAccounts/storePause';
import { AccountActionError } from '../services/adminAccounts/errors';

const DOMAIN = '@d3b2bp23.test';
const DAY = 86_400_000;
const MOTIVO = 'Mensalidade cancelada';
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
    if (path === '/customers') return { id: `cus_p23_${rand()}` };
    if (path === '/subscriptions') return { id: `sub_p23_${rand()}` };
    return {};
  });
  (asaasClient.get as jest.Mock).mockResolvedValue({ data: [], hasMore: false });
  (asaasClient.put as jest.Mock).mockResolvedValue({});
  (asaasClient.delete as jest.Mock).mockResolvedValue({ deleted: true });
  await updatePlatformConfig({ settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5 } as any, 'd3b2b-p23');
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

/** Loja com a mensalidade cancelada há 20 dias; por padrão pagou até 3 dias atrás (cobertura acabou). */
async function cancelada(opts: { paidUntil?: Date | null; trialEndsAt?: Date; cancelledAt?: Date; store?: Record<string, unknown> } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: `Loja p23 ${rand()}`, isOpen: true, ...opts.store } as any,
  });
  await prisma.storeSaasBilling.create({
    data: {
      storeId: store.id,
      status: 'cancelled',
      trialEndsAt: opts.trialEndsAt ?? new Date(Date.now() - 60 * DAY),
      paidUntil: opts.paidUntil === undefined ? utcDay(-3) : opts.paidUntil,
      cancelledAt: opts.cancelledAt ?? new Date(Date.now() - 20 * DAY),
      cancelledBy: ceo.userId,
    },
  });
  return store;
}
const storeOf = (id: string) => prisma.store.findUniqueOrThrow({ where: { id } });
const pausesOf = (storeId: string) => prisma.adminAccountAction.findMany({ where: { storeId, type: 'store_pause' } });

describe('job da mensalidade · pausa por cancelamento', () => {
  it('cobertura acabou: pausa pelo admin com o motivo e o ator system; segue cancelled; rodar de novo não duplica', async () => {
    const store = await cancelada();
    await runSaasBillingCycle(new Date());

    const s = await storeOf(store.id);
    expect(s.adminPausedAt).not.toBeNull();
    expect(s.adminPausedBy).toBe('system');
    expect(s.adminPauseReason).toBe(MOTIVO);
    expect(s.isOpen).toBe(true);
    expect((await prisma.storeSaasBilling.findUniqueOrThrow({ where: { storeId: store.id } })).status).toBe('cancelled');
    const pauses = await pausesOf(store.id);
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ actorId: 'system', actorRole: 'system', reason: MOTIVO });
    expect(await prisma.notification.count({ where: { userId: dono.userId, title: 'Loja pausada pelo DROP' } })).toBe(1);

    await runSaasBillingCycle(new Date());
    expect(await pausesOf(store.id)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: dono.userId, title: 'Loja pausada pelo DROP' } })).toBe(1);
  });

  it('ainda dentro do período pago ou do teste: não pausa', async () => {
    const paga = await cancelada({ paidUntil: utcDay(5) });
    const emTeste = await cancelada({ paidUntil: null, trialEndsAt: new Date(Date.now() + 2 * DAY) });
    await runSaasBillingCycle(new Date());
    expect((await storeOf(paga.id)).adminPausedAt).toBeNull();
    expect((await storeOf(emTeste.id)).adminPausedAt).toBeNull();
  });

  it('roda também no modo custódia', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'd3b2b-p23');
    const store = await cancelada();
    await runSaasBillingCycle(new Date());
    expect((await storeOf(store.id)).adminPauseReason).toBe(MOTIVO);
  });

  it('o admin liberou a pausa do cancelamento: o job não pausa de novo (duas rodadas)', async () => {
    const store = await cancelada();
    await runSaasBillingCycle(new Date());
    expect((await storeOf(store.id)).adminPausedAt).not.toBeNull();

    await storePause.unpauseStoreByAdmin(store.id, { id: ceo.userId, role: 'ceo' }, 'Combinado com o lojista');
    await runSaasBillingCycle(new Date());
    await runSaasBillingCycle(new Date());
    expect((await storeOf(store.id)).adminPausedAt).toBeNull();
    expect(await pausesOf(store.id)).toHaveLength(1);
  });

  it('liberar OUTRA pausa depois do cancelamento não impede a pausa da mensalidade', async () => {
    const store = await cancelada();
    const admin = { id: ceo.userId, role: 'ceo' };
    await storePause.pauseStoreByAdmin(store.id, admin, 'Denúncia de fraude em análise');
    await storePause.unpauseStoreByAdmin(store.id, admin, 'Denúncia descartada');
    await runSaasBillingCycle(new Date());
    const s = await storeOf(store.id);
    expect(s.adminPauseReason).toBe(MOTIVO);
    expect(s.adminPausedBy).toBe('system');
  });

  it('loja já pausada pelo admin por outro motivo: o job não mexe', async () => {
    const store = await cancelada({ store: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Fraude em análise' } });
    await runSaasBillingCycle(new Date());
    expect((await storeOf(store.id)).adminPauseReason).toBe('Fraude em análise');
    expect(await pausesOf(store.id)).toHaveLength(0);
  });

  it('erro em uma loja não para as outras; ALREADY_PAUSED não vira erro no log', async () => {
    const a = await cancelada();
    const b = await cancelada();
    const c = await cancelada();
    const original = storePause.pauseStoreByAdmin;
    jest.spyOn(storePause, 'pauseStoreByAdmin').mockImplementation(async (id, actor, reason) => {
      if (id === a.id) throw new Error('falha simulada');
      if (id === c.id) throw new AccountActionError(409, 'ALREADY_PAUSED', 'A loja já está pausada pelo DROP.');
      return original(id, actor, reason);
    });
    const errorLog = jest.spyOn(logger, 'error');

    await runSaasBillingCycle(new Date());
    expect((await storeOf(b.id)).adminPauseReason).toBe(MOTIVO);
    expect((await storeOf(a.id)).adminPausedAt).toBeNull();
    const logged = (errorLog.mock.calls as unknown[][]).filter(([msg]) => String(msg).includes('mensalidade cancelada'));
    expect(logged.map(([, , meta]) => (meta as any)?.storeId)).toEqual([a.id]);
  });
});
