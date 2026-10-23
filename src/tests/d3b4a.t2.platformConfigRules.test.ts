/** D3b-4a · T2: PUT /settings/platform-config valida cada campo e grava o histórico (spec 5.1, 5.2). */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as ruleChanges from '../services/rules/ruleChanges';

const DOMAIN = '@d3b4at2.test';
let restore: () => Promise<void>;
let ceo: TestUser;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  const cfg = (await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } }))
    ?? (await prisma.platformConfig.create({ data: { updatedBy: 'test' } }));
  await prisma.platformConfig.update({ where: { id: cfg.id }, data: { poolTimeoutMin: 15, motoboyCutPerKm: 1, cardFeeFixed: 0.49, seasonalTheme: 'none' } });
});
afterEach(async () => { jest.restoreAllMocks(); await cleanupUsersByEmailDomain(DOMAIN); });

const put = (body: Record<string, unknown>) =>
  request(app).put('/api/settings/platform-config').set('Authorization', bearer(ceo)).send(body);
const linhas = () => prisma.platformRuleChange.findMany({ where: { actorId: ceo.userId }, orderBy: { field: 'asc' } });

describe('faixas (spec 5.2)', () => {
  it.each([
    ['lateCancellationFeePercent', 100, 100.01],
    ['cardFeePercent', 0, -0.01],
    ['motoboyCutPerDelivery', 1000, 1000.01],
    ['cardInstallmentMinValue', 100000, 100000.01],
    ['poolTimeoutMin', 240, 241],
    ['storeAcceptTimeoutMin', 1, 0],
    ['cardInstallmentMaxCount', 12, 13],
    ['cardInstallmentMaxCount', 1, 0],
  ])('%s: %p aceita, %p → 400 com o campo', async (field, ok, bad) => {
    expect((await put({ [field]: ok })).status).toBe(200);
    const r = await put({ [field]: bad });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'INVALID_FIELD', field });
    expect(r.body.error).toMatch(/[A-Za-zÀ-ú]/);
  });

  it('inteiro recusa fração; texto numérico vira número; fração arredonda a 2 casas', async () => {
    expect((await put({ poolTimeoutMin: 12.5 })).body).toMatchObject({ code: 'INVALID_FIELD', field: 'poolTimeoutMin' });
    expect((await put({ poolTimeoutMin: 'abc' })).status).toBe(400);
    expect((await put({ poolTimeoutMin: '20' })).status).toBe(200);
    expect((await put({ motoboyCutPerKm: 1.234 })).status).toBe(200);
    const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    expect(c!.poolTimeoutMin).toBe(20);
    expect(Number(c!.motoboyCutPerKm)).toBe(1.23);
  });

  it('seasonalTheme fora da lista → 400; motivo > 500 → 400', async () => {
    expect((await put({ seasonalTheme: 'carnaval' })).body).toMatchObject({ code: 'INVALID_FIELD', field: 'seasonalTheme' });
    expect((await put({ poolTimeoutMin: 20, changeReason: 'x'.repeat(501) })).body).toMatchObject({ code: 'INVALID_FIELD', field: 'changeReason' });
  });

  it('chave desconhecida → 400; coluna da config que não se edita aqui é ignorada (aba velha)', async () => {
    expect((await put({ inventado: 1 })).body).toMatchObject({ code: 'INVALID_FIELD', field: 'inventado' });
    const atual = (await request(app).get('/api/settings/platform-config')).body;
    const r = await put({ ...atual, poolTimeoutMin: 30 });
    expect(r.status).toBe(200);
    expect((await linhas()).map((l) => l.field)).toEqual(['poolTimeoutMin']);
  });

  it('códigos antigos continuam: saque mínimo e comissão', async () => {
    expect((await put({ motoboyMinimumWithdraw: -1 })).body).toMatchObject({ code: 'INVALID_MINIMUM_WITHDRAW', field: 'motoboyMinimumWithdraw' });
    expect((await put({ commissionPlan1: 101 })).body).toMatchObject({ error: 'A comissão precisa ser um número entre 0 e 100', field: 'commissionPlan1' });
  });
});

describe('histórico (spec 5.1)', () => {
  it('uma linha por campo alterado, mesmo batchId, com motivo; igual não grava', async () => {
    const r = await put({ poolTimeoutMin: 20, cardFeeFixed: 0, motoboyCutPerKm: 1, changeReason: 'teste de cartão' });
    expect(r.status).toBe(200);
    const rows = await linhas();
    expect(rows.map((x) => [x.field, x.before, x.after])).toEqual([['cardFeeFixed', 0.49, 0], ['poolTimeoutMin', 15, 20]]);
    expect(new Set(rows.map((x) => x.batchId)).size).toBe(1);
    expect(rows.every((x) => x.reason === 'teste de cartão' && x.source === 'rules' && x.actorRole === 'ceo')).toBe(true);
  });

  it('salvar igual, ou só com motivo, não grava nada', async () => {
    expect((await put({ poolTimeoutMin: 15 })).status).toBe(200);
    expect((await put({ changeReason: 'nada' })).status).toBe(200);
    expect(await linhas()).toHaveLength(0);
  });

  it('dois salvamentos seguidos: o before do segundo é o after do primeiro', async () => {
    await put({ poolTimeoutMin: 20 });
    await put({ poolTimeoutMin: 25 });
    const rows = await prisma.platformRuleChange.findMany({ where: { actorId: ceo.userId }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((x) => [x.before, x.after])).toEqual([[15, 20], [20, 25]]);
  });

  it('tela do Tema sazonal (só seasonalTheme) salva e registra', async () => {
    expect((await put({ seasonalTheme: 'natal' })).status).toBe(200);
    expect((await linhas()).map((x) => [x.field, x.before, x.after])).toEqual([['seasonalTheme', 'none', 'natal']]);
  });

  it('histórico falhou → a regra não muda', async () => {
    jest.spyOn(ruleChanges, 'recordRuleChanges').mockRejectedValueOnce(new Error('falha forçada'));
    expect((await put({ poolTimeoutMin: 20 })).status).toBe(500);
    const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    expect(c!.poolTimeoutMin).toBe(15);
  });
});
