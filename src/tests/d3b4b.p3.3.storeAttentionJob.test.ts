/**
 * D3b-4b · P3.3 — job storeAttention (spec 8 e 9). A cada 10 min, recalcula as lojas com pedido em 30 dias,
 * as marcadas e as nunca calculadas. Marca, desmarca e, quando uma loja falha, registra no log e segue.
 */
import { Prisma } from '@prisma/client';
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { cleanupAccountsFixtures, createPerson, daysBefore } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import * as attention from '../services/adminAccounts/storeAttention';
import env from '../config/env';
import { recheckStore, runStoreAttentionCycle, storesToRecheck } from '../jobs/storeAttention.job';

const DOMAIN = '@d3b4bp33.test';
const MARK = 'd3b4bp33';
const HOUR_MS = 3_600_000;
// Calculada há 1 h: dentro das 24 h, o job só a pega pelos critérios da spec (pedido, marcada ou nunca calculada).
const CHECKED_AT = new Date(Date.now() - HOUR_MS);
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

/** Loja já calculada há pouco (dentro das 24 h): o job só a pega pelos critérios da spec. */
async function checkedStore(name: string, needsAttention = false, checkedAt: Date = CHECKED_AT): Promise<string> {
  const id = await createOpsStore(DOMAIN, { name });
  await prisma.$executeRaw`UPDATE "Store" SET "needsAttention" = ${needsAttention}, "attentionCheckedAt" = ${checkedAt} WHERE "id" = ${id}`;
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

  it('pega também a loja calculada há mais de 24 h, mesmo sem pedido e sem marca (rede de segurança)', async () => {
    const now = new Date();
    const velha = await checkedStore('p33 velha', false, new Date(now.getTime() - 25 * HOUR_MS));
    const recente = await checkedStore('p33 recente', false, new Date(now.getTime() - 23 * HOUR_MS));
    const ids = await storesToRecheck(now);
    expect(ids).toContain(velha);
    expect(ids).not.toContain(recente);
  });
});

/** Espera até alguma sessão do banco ficar parada esperando uma trava. */
async function untilSomeoneWaitsForLock(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('ninguém ficou esperando a trava');
}

/**
 * Abre uma transação que grava `write` na loja e segura o commit até `release()`, como a pausa pelo admin
 * ou a troca de modo em andamento.
 */
async function holdWrite(write: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  let locked!: () => void;
  const isLocked = new Promise<void>((r) => { locked = r; });
  const done = prisma.$transaction(async (tx) => {
    await write(tx);
    locked();
    await held;
  }, { timeout: 20_000 });
  await isLocked;
  return { release, done };
}

describe('recheckStore: trava a linha da loja antes de ler', () => {
  it('a pausa gravada ao mesmo tempo não é sobrescrita pelo valor antigo', async () => {
    const id = await checkedStore('p33 trava');
    const pause = await holdWrite((tx) => tx.$executeRaw`UPDATE "Store" SET "adminPausedAt" = now() WHERE "id" = ${id}`);

    const job = recheckStore(id, new Date());
    await untilSomeoneWaitsForLock(); // o job ficou parado na trava da linha
    pause.release();
    await pause.done;
    await job;

    // Sem a trava, o job leria adminPausedAt nulo (o commit ainda não tinha saído) e gravaria false por cima.
    expect((await state(id)).needsAttention).toBe(true);
  });

  it('a marca NULL gravada antes da escrita do job não se perde com um valor velho', async () => {
    const id = await checkedStore('p33 troca');
    // Uma mudança que marca a loja (NULL) e muda o recebimento dela (subconta com erro), ainda sem commit.
    const mark = await holdWrite((tx) =>
      tx.$executeRaw`UPDATE "Store" SET "attentionCheckedAt" = NULL, "asaas" = '{"status":"error"}'::jsonb WHERE "id" = ${id}`);
    const gateway = env.PAYMENT_GATEWAY;
    (env as any).PAYMENT_GATEWAY = 'asaas';
    try {
      const now = new Date();
      const job = recheckStore(id, now);
      await untilSomeoneWaitsForLock();
      mark.release();
      await mark.done;
      // O job só grava o carimbo por cima da marca com o valor do estado novo (custódia: subconta com erro).
      expect(await job).toBe(true);
      expect(await state(id)).toEqual({ needsAttention: true, attentionCheckedAt: now });
    } finally {
      (env as any).PAYMENT_GATEWAY = gateway;
    }
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
    expect(await state(quieta)).toEqual({ needsAttention: false, attentionCheckedAt: CHECKED_AT });
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
    expect(await state(ruim)).toEqual({ needsAttention: true, attentionCheckedAt: CHECKED_AT });
    expect((await state(depois1)).needsAttention).toBe(true);
    expect((await state(depois2)).needsAttention).toBe(false);
    expect(logError).toHaveBeenCalledWith('[store-attention] falha ao recalcular a loja', expect.any(Error), { storeId: ruim });
  });
});
