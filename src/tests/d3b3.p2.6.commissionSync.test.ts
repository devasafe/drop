/**
 * D3b-3 · P2.6 — comissão por plano (spec 6).
 * Impacto mostra quem segue o valor e quem é especial. Mudar o valor de um plano exige escolha
 * (409 COMMISSION_SYNC_CHOICE_REQUIRED, nada salvo); valor igual não toca lojas; keep_special
 * preserva especiais; all iguala; config + lojas + linha commission_sync numa transação só.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as moneyActions from '../services/adminMoneyAction.service';

const DOMAIN = '@d3b3p26.test';
const PREFIX = 'd3b3p26';
let restore: () => Promise<void>;
let ceo: TestUser;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restore();
});

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  const cfg = (await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } }))
    ?? (await prisma.platformConfig.create({ data: { updatedBy: 'test' } }));
  // plano 3 com valor incomum: o sync toca o mínimo possível de assinaturas de outras suítes
  await prisma.platformConfig.update({ where: { id: cfg.id }, data: { commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 3.33 } });
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.storeSubscription.deleteMany({ where: { storeId: { startsWith: PREFIX } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

let seq = 0;
const assinatura = (plan: 'plan1' | 'plan2' | 'plan3', rate: number | null, name: string) =>
  prisma.storeSubscription.create({
    data: { storeId: `${PREFIX}-${Date.now()}-${seq++}`, storeName: name, currentPlan: plan, commissionRate: rate },
  });
const taxa = async (id: string) => {
  const s = await prisma.storeSubscription.findUnique({ where: { id } });
  return s!.commissionRate === null ? null : Number(s!.commissionRate);
};
const config = async () => {
  const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  return { p1: Number(c!.commissionPlan1), p2: Number(c!.commissionPlan2), p3: Number(c!.commissionPlan3) };
};
const salvar = (who: TestUser, body: Record<string, unknown>) =>
  request(app).put('/api/settings/platform-config').set('Authorization', bearer(who)).send(body);
const linhasDaSuite = () => prisma.adminMoneyAction.findMany({ where: { type: 'commission_sync', actorId: ceo.userId } });

async function cenario() {
  return {
    a: await assinatura('plan3', 3.33, 'Loja A'),
    b: await assinatura('plan3', 3.33, 'Loja B'),
    semTaxa: await assinatura('plan3', null, 'Loja Sem Taxa'),
    especial: await assinatura('plan3', 7.5, 'Loja Especial'),
    outroPlano: await assinatura('plan2', 15, 'Loja Plano 2'),
  };
}

describe('GET /settings/commission-impact', () => {
  it('mostra valor antigo/novo, quantas seguem o valor e quais são especiais', async () => {
    const s = await cenario();
    const r = await request(app).get('/api/settings/commission-impact?plan=plan3&value=4.444').set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ oldValue: 3.33, newValue: 4.44 });
    expect(r.body.atOldValue).toBeGreaterThanOrEqual(3);
    const ids = r.body.special.map((x: any) => x.storeId);
    expect(r.body.special).toEqual(expect.arrayContaining([{ storeId: s.especial.storeId, storeName: 'Loja Especial', rate: 7.5 }]));
    expect(ids).not.toContain(s.a.storeId);
    expect(ids).not.toContain(s.semTaxa.storeId);
    expect(ids).not.toContain(s.outroPlano.storeId);
  });

  it('plano ou valor inválido → 400; sem settings:manage → 403', async () => {
    const q = (qs: string, who = ceo) => request(app).get(`/api/settings/commission-impact?${qs}`).set('Authorization', bearer(who));
    expect((await q('plan=plan9&value=10')).body).toEqual({ error: 'Plano inválido' });
    for (const qs of ['plan=plan1', 'plan=plan1&value=abc', 'plan=plan1&value=-1', 'plan=plan1&value=101']) {
      const r = await q(qs);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'Valor inválido' });
    }
    // gerente_motoboys: outras suítes deixam o gerente_geral com settings:manage no banco compartilhado.
    const gerente = await createTestUser('gerente_motoboys', DOMAIN);
    expect((await q('plan=plan1&value=12', gerente)).status).toBe(403);
  });
});

describe('PUT /settings/platform-config com comissão', () => {
  it('valor mudou sem escolha → 409 COMMISSION_SYNC_CHOICE_REQUIRED e nada é salvo', async () => {
    const s = await cenario();
    const feeAntes = Number((await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } }))!.cancelFeeStorePercent);
    const r = await salvar(ceo, { commissionPlan3: 4.44, cancelFeeStorePercent: feeAntes + 1 });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      error: 'Escolha o que fazer com as lojas dos planos com comissão alterada',
      code: 'COMMISSION_SYNC_CHOICE_REQUIRED',
      plans: ['plan3'],
    });
    expect((await config()).p3).toBe(3.33);
    const c = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    expect(Number(c!.cancelFeeStorePercent)).toBe(feeAntes);
    expect(await taxa(s.a.id)).toBe(3.33);
    expect(await linhasDaSuite()).toHaveLength(0);
  });

  it('dois planos mudaram e só um tem escolha → 409 com o plano que falta', async () => {
    await cenario();
    const r = await salvar(ceo, { commissionPlan2: 18, commissionPlan3: 4.44, commissionSync: { plan3: 'all' } });
    expect(r.status).toBe(409);
    expect(r.body.plans).toEqual(['plan2']);
    expect(await config()).toEqual({ p1: 10, p2: 15, p3: 3.33 });
  });

  it('valor igual (mesmo com escolha) não toca nas lojas e não grava linha', async () => {
    const s = await cenario();
    const antes = await prisma.storeSubscription.findUnique({ where: { id: s.especial.id } });
    const r = await salvar(ceo, { commissionPlan3: 3.33, commissionPlan2: '15.00', commissionSync: { plan3: 'all' } });
    expect(r.status).toBe(200);
    expect(r.body.commissionSync).toEqual([]);
    expect(await taxa(s.especial.id)).toBe(7.5);
    const depois = await prisma.storeSubscription.findUnique({ where: { id: s.especial.id } });
    expect(depois!.updatedAt.getTime()).toBe(antes!.updatedAt.getTime());
    expect(await linhasDaSuite()).toHaveLength(0);
  });

  it('keep_special → só as lojas que seguiam o valor antigo mudam; uma linha commission_sync', async () => {
    const s = await cenario();
    const r = await salvar(ceo, { commissionPlan3: 4.44, commissionSync: { plan3: 'keep_special' } });
    expect(r.status).toBe(200);
    expect((await config()).p3).toBe(4.44);
    expect(await taxa(s.a.id)).toBe(4.44);
    expect(await taxa(s.b.id)).toBe(4.44);
    expect(await taxa(s.semTaxa.id)).toBe(4.44);
    expect(await taxa(s.especial.id)).toBe(7.5);
    expect(await taxa(s.outroPlano.id)).toBe(15);

    const sync = r.body.commissionSync;
    expect(sync).toHaveLength(1);
    expect(sync[0]).toMatchObject({ plan: 'plan3', oldValue: 3.33, newValue: 4.44, choice: 'keep_special' });
    expect(sync[0].storesUpdated).toBeGreaterThanOrEqual(3);
    expect(r.body.message).toBe(`Configurações salvas e ${sync[0].storesUpdated} lojas sincronizadas`);

    const l = await linhasDaSuite();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      targetType: 'plan_commission', targetId: 'plan3',
      before: { value: 3.33 }, after: { value: 4.44, choice: 'keep_special', storesUpdated: sync[0].storesUpdated },
    });
  });

  it('all → todas as lojas do plano igualam, inclusive a especial', async () => {
    const s = await cenario();
    const r = await salvar(ceo, { commissionPlan3: 4.44, commissionSync: { plan3: 'all' } });
    expect(r.status).toBe(200);
    expect(await taxa(s.especial.id)).toBe(4.44);
    expect(await taxa(s.a.id)).toBe(4.44);
    expect(await taxa(s.outroPlano.id)).toBe(15);
  });

  it('falha ao gravar a linha desfaz o salvamento da config e das lojas', async () => {
    const s = await cenario();
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    const r = await salvar(ceo, { commissionPlan3: 4.44, commissionSync: { plan3: 'all' } });
    expect(r.status).toBe(500);
    expect((await config()).p3).toBe(3.33);
    expect(await taxa(s.a.id)).toBe(3.33);
    expect(await taxa(s.especial.id)).toBe(7.5);
  });

  it('escolha inválida → 400; comissão fora de 0–100 → 400', async () => {
    expect((await salvar(ceo, { commissionPlan3: 4.44, commissionSync: { plan3: 'tudo' } })).body).toEqual({ error: 'Escolha de sincronização inválida' });
    expect((await salvar(ceo, { commissionPlan3: 4.44, commissionSync: { plan4: 'all' } })).status).toBe(400);
    const r = await salvar(ceo, { commissionPlan3: 150, commissionSync: { plan3: 'all' } });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'A comissão precisa ser um número entre 0 e 100', field: 'commissionPlan3' });
    expect((await config()).p3).toBe(3.33);
  });

  it('salvar sem comissão continua como antes (patch parcial, sem 409)', async () => {
    const r = await salvar(ceo, { poolTimeoutMin: 17 });
    expect(r.status).toBe(200);
    expect(r.body.commissionSync).toEqual([]);
    expect(r.body.config.poolTimeoutMin).toBe(17);
  });
});
