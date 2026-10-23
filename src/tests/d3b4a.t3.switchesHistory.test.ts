/** D3b-4a · T3: PUT /admin/switches grava histórico, aceita motivo e trava motoboyShareDirect em 100. */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as ruleChanges from '../services/rules/ruleChanges';

const DOMAIN = '@d3b4at3.test';
let restore: () => Promise<void>;
let ceo: TestUser;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  const cfg = (await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } }))
    ?? (await prisma.platformConfig.create({ data: { updatedBy: 'test' } }));
  await prisma.platformConfig.update({ where: { id: cfg.id }, data: { rankingPrizesEnabled: false, saasTrialDays: 14, motoboyShareDirect: 100 } });
});
afterEach(async () => { jest.restoreAllMocks(); await cleanupUsersByEmailDomain(DOMAIN); });

const put = (body: Record<string, unknown>) =>
  request(app).put('/api/admin/switches').set('Authorization', bearer(ceo)).send(body);
const linhas = () => prisma.platformRuleChange.findMany({ where: { actorId: ceo.userId }, orderBy: { createdAt: 'asc' } });

it('cada campo alterado vira uma linha source=switches com o motivo; igual não grava', async () => {
  expect((await put({ rankingPrizesEnabled: true, saasTrialDays: 14, changeReason: 'campanha' })).status).toBe(200);
  const rows = await linhas();
  expect(rows.map((r) => [r.field, r.before, r.after, r.source, r.reason])).toEqual([
    ['rankingPrizesEnabled', false, true, 'switches', 'campanha'],
  ]);
});

it('dois salvamentos seguidos encadeiam before/after', async () => {
  await put({ saasTrialDays: 20 });
  await put({ saasTrialDays: 30 });
  expect((await linhas()).map((r) => [r.before, r.after])).toEqual([[14, 20], [20, 30]]);
});

it('motoboyShareDirect diferente de 100 → 400 MOTOBOY_SHARE_DIRECT_LOCKED; 100 passa', async () => {
  const r = await put({ motoboyShareDirect: 80 });
  expect(r.status).toBe(400);
  expect(r.body.code).toBe('MOTOBOY_SHARE_DIRECT_LOCKED');
  expect((await put({ motoboyShareDirect: 100 })).status).toBe(200);
  expect(await linhas()).toHaveLength(0);
});

it('só o motivo, sem campo → 400 como hoje; motivo > 500 → 400', async () => {
  expect((await put({ changeReason: 'nada' })).status).toBe(400);
  const longo = await put({ rankingPrizesEnabled: true, changeReason: 'x'.repeat(501) });
  expect(longo.status).toBe(400);
  expect(longo.body).toMatchObject({ code: 'INVALID_FIELD', field: 'changeReason', error: 'O motivo pode ter até 500 caracteres' });
  // 500 caracteres úteis + espaços nas pontas passa (conta o texto aparado)
  expect((await put({ rankingPrizesEnabled: true, changeReason: ` ${'x'.repeat(500)} ` })).status).toBe(200);
  const naoTexto = await put({ rankingPrizesEnabled: false, changeReason: 123 });
  expect(naoTexto.status).toBe(400);
  expect(naoTexto.body).toMatchObject({ code: 'INVALID_FIELD', field: 'changeReason', error: 'Motivo inválido' });
});

it('histórico falhou → nada muda', async () => {
  jest.spyOn(ruleChanges, 'recordRuleChanges').mockRejectedValueOnce(new Error('falha forçada'));
  expect((await put({ rankingPrizesEnabled: true })).status).toBe(500);
  const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  expect(c!.rankingPrizesEnabled).toBe(false);
});
