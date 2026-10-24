/**
 * D3b-4b · P3.1 — Store.needsAttention gravado (spec 8). computeStoreAttention aplica a regra da lista
 * (pausa do admin, recebimento com problema, cancelamento acima de 10% em 30 dias com ao menos 5 pedidos),
 * grava sem mexer em updatedAt, e a pausa e a liberação pelo admin recalculam na mesma transação.
 */
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import logger from '../config/logger';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { cleanupAccountsFixtures, createPerson, daysBefore } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import * as attention from '../services/adminAccounts/storeAttention';
import { computeStoreAttention } from '../services/adminAccounts/storeAttention';

const DOMAIN = '@d3b4bp31.test';
const MARK = 'd3b4bp31';
let ceo: TestUser;
let customerId: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b4b-p31');
  ceo = await createTestUser('ceo', DOMAIN);
  customerId = await createPerson(DOMAIN, { name: 'Cliente p31' });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const stored = (id: string) =>
  prisma.store.findUniqueOrThrow({ where: { id }, select: { needsAttention: true, attentionCheckedAt: true, updatedAt: true, adminPausedAt: true } });

/** `n` pedidos de `daysAgo` dias atrás; os `cancelled` primeiros ficam cancelados. */
async function orders(storeId: string, n: number, cancelled: number, daysAgo = 1) {
  for (let i = 0; i < n; i++) {
    await createOpsOrder({ customerId, storeId, status: i < cancelled ? 'cancelado' : 'entregue', createdAt: daysBefore(new Date(), daysAgo) });
  }
}

describe('computeStoreAttention', () => {
  it('loja sem motivo: false, grava attentionCheckedAt e não mexe em updatedAt', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 limpa' });
    const before = await stored(id);
    const now = new Date();
    expect(await computeStoreAttention(id, undefined, now)).toBe(false);
    const after = await stored(id);
    expect(after.needsAttention).toBe(false);
    expect(after.attentionCheckedAt?.getTime()).toBe(now.getTime());
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('pausa do admin marca; sem a pausa, desmarca', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 pausada' });
    await prisma.store.update({ where: { id }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    expect(await computeStoreAttention(id)).toBe(true);
    expect((await stored(id)).needsAttention).toBe(true);
    await prisma.store.update({ where: { id }, data: { adminPausedAt: null, adminPausedBy: null, adminPauseReason: null } });
    expect(await computeStoreAttention(id)).toBe(false);
    expect((await stored(id)).needsAttention).toBe(false);
  });

  it('cancelamento: 2 de 5 marca; 1 de 10 (10%) não; 4 pedidos não bastam; pedidos de 40 dias não contam', async () => {
    const quarenta = await createOpsStore(DOMAIN, { name: 'p31 40%' });
    await orders(quarenta, 5, 2);
    const dez = await createOpsStore(DOMAIN, { name: 'p31 10%' });
    await orders(dez, 10, 1);
    const poucos = await createOpsStore(DOMAIN, { name: 'p31 poucos' });
    await orders(poucos, 4, 4);
    const antigos = await createOpsStore(DOMAIN, { name: 'p31 antigos' });
    await orders(antigos, 5, 5, 40);
    expect(await computeStoreAttention(quarenta)).toBe(true);
    expect(await computeStoreAttention(dez)).toBe(false);
    expect(await computeStoreAttention(poucos)).toBe(false);
    expect(await computeStoreAttention(antigos)).toBe(false);
  });

  it('recebimento com problema: subconta com erro na custódia com Asaas; conta inválida no direto', async () => {
    const custodia = await createOpsStore(DOMAIN, { name: 'p31 subconta' });
    await prisma.store.update({ where: { id: custodia }, data: { asaas: { status: 'error', lastError: 'Faltam dados' } } });
    const original = env.PAYMENT_GATEWAY;
    try {
      (env as any).PAYMENT_GATEWAY = 'asaas';
      expect(await computeStoreAttention(custodia)).toBe(true);
      (env as any).PAYMENT_GATEWAY = 'mock';
      expect(await computeStoreAttention(custodia)).toBe(false); // sem gateway Asaas: "não se aplica"
    } finally {
      (env as any).PAYMENT_GATEWAY = original;
    }

    await updatePlatformConfig({ settlementMode: 'direto' }, 'd3b4b-p31');
    const direta = await createOpsStore(DOMAIN, { name: 'p31 direta' });
    await prisma.storeAsaasAccount.create({
      data: { storeId: direta, apiKeyEncrypted: 'x', apiKeyLast4: '1234', environment: 'sandbox', status: 'invalid' },
    });
    expect(await computeStoreAttention(direta)).toBe(true);
  });

  it('loja que não existe: false, sem erro', async () => {
    await expect(computeStoreAttention('loja-que-nao-existe-p31')).resolves.toBe(false);
  });

  it('dentro de uma transação, enxerga o que a transação já escreveu', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 tx' });
    await prisma.$transaction(async (tx) => {
      await tx.store.update({ where: { id }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
      expect(await computeStoreAttention(id, tx)).toBe(true);
    });
    expect((await stored(id)).needsAttention).toBe(true);
  });
});

describe('pausa e liberação pelo admin recalculam na hora', () => {
  const pause = (id: string) =>
    request(app).post(`/api/admin/stores/${id}/pause`).set('Authorization', bearer(ceo)).send({ reason: 'Fraude em análise' });
  const unpause = (id: string) =>
    request(app).post(`/api/admin/stores/${id}/unpause`).set('Authorization', bearer(ceo)).send({});

  it('pausar marca e liberar desmarca, sem esperar o job', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 pausa' });
    expect((await pause(id)).status).toBe(200);
    expect((await stored(id)).needsAttention).toBe(true);
    expect((await unpause(id)).status).toBe(200);
    expect((await stored(id)).needsAttention).toBe(false);
  });

  it('liberar uma loja que ainda cancela muito mantém a atenção', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 cancela' });
    await orders(id, 5, 3);
    expect((await pause(id)).status).toBe(200);
    expect((await unpause(id)).status).toBe(200);
    expect((await stored(id)).needsAttention).toBe(true);
  });

  it('se o recálculo falha, a pausa volta (mesma transação) e a rota responde 500', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 falha' });
    jest.spyOn(attention, 'computeStoreAttention').mockRejectedValueOnce(new Error('falha simulada no recálculo'));
    jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    expect((await pause(id)).status).toBe(500);
    expect(await stored(id)).toEqual(expect.objectContaining({ adminPausedAt: null, needsAttention: false }));
  });

  it('se o recálculo falha na liberação, a loja continua pausada e a rota responde 500', async () => {
    const id = await createOpsStore(DOMAIN, { name: 'p31 falha libera' });
    expect((await pause(id)).status).toBe(200);
    jest.spyOn(attention, 'computeStoreAttention').mockRejectedValueOnce(new Error('falha simulada no recálculo'));
    jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);
    expect((await unpause(id)).status).toBe(500);
    expect(await stored(id)).toEqual(expect.objectContaining({ needsAttention: true }));
    expect((await stored(id)).adminPausedAt).not.toBeNull();
  });
});

describe('preenchimento inicial da migration', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../prisma/migrations/20261024120000_d3b4b_lojas_atencao/migration.sql'),
    'utf8',
  );
  const backfill = migration.slice(migration.indexOf('UPDATE "Store"'));

  it('custódia com loja sem asaas e sem outro motivo grava false (nunca NULL)', async () => {
    const limpa = await createOpsStore(DOMAIN, { name: 'p31 backfill limpa' });
    const pausada = await createOpsStore(DOMAIN, { name: 'p31 backfill pausada' });
    await prisma.store.update({ where: { id: pausada }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    const comErro = await createOpsStore(DOMAIN, { name: 'p31 backfill erro' });
    await prisma.store.update({ where: { id: comErro }, data: { asaas: { status: 'error' } } });
    await prisma.store.update({ where: { id: limpa }, data: { asaas: Prisma.DbNull } });

    await prisma.$executeRawUnsafe(backfill);

    expect((await stored(limpa)).needsAttention).toBe(false);
    expect((await stored(pausada)).needsAttention).toBe(true);
    expect((await stored(comErro)).needsAttention).toBe(true);
  });
});
