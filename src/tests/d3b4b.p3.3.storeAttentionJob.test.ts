/**
 * D3b-4b · P3.3 — job storeAttention (spec 8 e 9). A cada 10 min, recalcula as lojas com pedido em 30 dias,
 * as marcadas e as nunca calculadas. Marca, desmarca e, quando uma loja falha, registra no log e segue.
 */
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { cleanupAccountsFixtures, createPerson, daysBefore } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import * as attention from '../services/adminAccounts/storeAttention';
import { runStoreAttentionCycle, storesToRecheck } from '../jobs/storeAttention.job';

const DOMAIN = '@d3b4bp33.test';
const MARK = 'd3b4bp33';
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');
let customerId: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p33');
  customerId = await createPerson(DOMAIN, { name: 'Cliente p33' });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

/** Loja já calculada antes (attentionCheckedAt antigo): o job só a pega pelos critérios da spec. */
async function checkedStore(name: string, needsAttention = false): Promise<string> {
  const id = await createOpsStore(DOMAIN, { name });
  await prisma.$executeRaw`UPDATE "Store" SET "needsAttention" = ${needsAttention}, "attentionCheckedAt" = ${LONG_AGO} WHERE "id" = ${id}`;
  return id;
}
const state = (id: string) =>
  prisma.store.findUniqueOrThrow({ where: { id }, select: { needsAttention: true, attentionCheckedAt: true } });
async function orders(storeId: string, n: number, cancelled: number, daysAgo = 1) {
  for (let i = 0; i < n; i++) {
    await createOpsOrder({ customerId, storeId, status: i < cancelled ? 'cancelado' : 'entregue', createdAt: daysBefore(new Date(), daysAgo) });
  }
}

describe('storesToRecheck', () => {
  it('pega a loja com pedido em 30 dias, a marcada e a nunca calculada; deixa de fora a calculada sem pedido recente', async () => {
    const comPedido = await checkedStore('p33 com pedido');
    await orders(comPedido, 1, 0, 3);
    const marcada = await checkedStore('p33 marcada', true);
    const nova = await createOpsStore(DOMAIN, { name: 'p33 nova' });
    const quieta = await checkedStore('p33 quieta');
    await orders(quieta, 2, 0, 45);
    const ids = await storesToRecheck(new Date());
    expect(ids).toEqual(expect.arrayContaining([comPedido, marcada, nova]));
    expect(ids).not.toContain(quieta);
  });
});

describe('runStoreAttentionCycle', () => {
  it('marca a loja que passou de 10% de cancelamento e desmarca a que não tem mais motivo', async () => {
    const cancela = await checkedStore('p33 cancela');
    await orders(cancela, 5, 2);
    const curada = await checkedStore('p33 curada', true);
    const quieta = await checkedStore('p33 quieta');
    const nova = await createOpsStore(DOMAIN, { name: 'p33 nova' });
    const now = new Date();

    const result = await runStoreAttentionCycle(now);

    expect(result.failed).toBe(0);
    expect(result.checked).toBeGreaterThanOrEqual(3);
    expect(await state(cancela)).toEqual({ needsAttention: true, attentionCheckedAt: now });
    expect(await state(curada)).toEqual({ needsAttention: false, attentionCheckedAt: now });
    expect(await state(nova)).toEqual({ needsAttention: false, attentionCheckedAt: now });
    expect(await state(quieta)).toEqual({ needsAttention: false, attentionCheckedAt: LONG_AGO });
  });

  it('uma loja que falha vai para o log, o valor antigo fica e as outras seguem', async () => {
    const ruim = await checkedStore('p33 ruim', true);
    const depois1 = await checkedStore('p33 depois 1');
    await orders(depois1, 5, 3);
    const depois2 = await checkedStore('p33 depois 2', true);
    const real = attention.computeStoreAttention;
    const compute = jest.spyOn(attention, 'computeStoreAttention').mockImplementation(async (storeId, tx, now) => {
      if (storeId === ruim) throw new Error('falha simulada nesta loja');
      return real(storeId, tx, now);
    });
    const logError = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);

    const result = await runStoreAttentionCycle(new Date());

    expect(result.failed).toBe(1);
    // ids crescem com a criação (cuid) e o job segue a ordem do id: depois1 vem depois da que falhou.
    const order = compute.mock.calls.map(([id]) => id);
    expect(order.indexOf(ruim)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(depois1)).toBeGreaterThan(order.indexOf(ruim));
    expect(await state(ruim)).toEqual({ needsAttention: true, attentionCheckedAt: LONG_AGO });
    expect((await state(depois1)).needsAttention).toBe(true);
    expect((await state(depois2)).needsAttention).toBe(false);
    expect(logError).toHaveBeenCalledWith('[store-attention] falha ao recalcular a loja', expect.any(Error), { storeId: ruim });
  });
});
