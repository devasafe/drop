/**
 * Modo SaaS (direto) não tem planos: toda loja tem os direitos do Plano 3 (banner na Home, destaque,
 * "Mais vendidos") e paga só a mensalidade. A troca de plano não existe nesse modo. Na custódia
 * os planos continuam valendo.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { paymentsReadyStoreData } from './helpers/storeConsent';
import { effectiveStorePlan } from '../utils/effectivePlan';

const DOMAIN = '@oprealplano.test';
const BANNER = 'https://res.cloudinary.com/x/banner.png';

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

const mode = (settlementMode: 'direto' | 'custodia') => updatePlatformConfig({ settlementMode } as any, 'test');

async function plan1Store(name = `Plano Um ${Math.random().toString(36).slice(2, 7)}`) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name, isOpen: true, isVerified: true, plan: 1, featuredBannerUrl: BANNER, ...paymentsReadyStoreData() } as any,
  });
  await prisma.storeSubscription.create({ data: { storeId: store.id, storeName: name, currentPlan: 'plan1', commissionRate: 12 } as any });
  return { dono, store };
}

describe('modo SaaS: plano efetivo 3', () => {
  it('effectiveStorePlan: 3 no direto; plano da assinatura na custódia', async () => {
    const { store } = await plan1Store();
    await mode('direto');
    expect(await effectiveStorePlan(store.id)).toBe(3);
    await mode('custodia');
    expect(await effectiveStorePlan(store.id)).toBe(1);
  });

  it('vitrine: loja Plano 1 aparece como plano 3 e com o banner', async () => {
    await mode('direto');
    const { store } = await plan1Store();
    const one = await request(app).get(`/api/stores/${store.id}`);
    expect(one.body.plan).toBe(3);
    expect(one.body.featuredBannerUrl).toBe(BANNER);
    const list = await request(app).get('/api/stores');
    expect(list.body.find((s: any) => s.id === store.id)?.plan).toBe(3);
  });

  it('destaques da Home e "Mais vendidos" valem para a loja Plano 1', async () => {
    await mode('direto');
    const { store } = await plan1Store();
    const featured = await request(app).get('/api/stores/featured');
    expect(featured.body.map((s: any) => s.id)).toContain(store.id);
    const top = await request(app).get(`/api/stores/${store.id}/top-products`);
    expect(top.body.premiumRequired).toBeUndefined();
  });

  it('banner de destaque: a loja Plano 1 pode enviar (sem arquivo → 400, não 403)', async () => {
    await mode('direto');
    const { dono } = await plan1Store();
    const res = await request(app).post('/api/stores/banner?type=featured').set('Authorization', bearer(dono));
    expect(res.status).toBe(400);
  });

  it('troca de plano não existe no modo SaaS', async () => {
    await mode('direto');
    const { dono, store } = await plan1Store();
    const ceo = await createTestUser('ceo', DOMAIN);
    const pedir = await request(app).post('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono)).send({ requestedPlan: 'plan3' });
    expect(pedir.body.code).toBe('FEATURE_DISABLED');
    const aprovar = await request(app).post('/api/settings/approve-plan-change').set('Authorization', bearer(ceo)).send({ storeId: store.id });
    expect(aprovar.body.code).toBe('FEATURE_DISABLED');
    const legado = await request(app).put('/api/store/plan').set('Authorization', bearer(dono)).send({ planId: 'x' });
    expect(legado.body.code).toBe('FEATURE_DISABLED');
  });

  it('admin no modo SaaS: lista e ficha da loja sem "Plano X"; fila sem troca de plano', async () => {
    await mode('direto');
    const { store } = await plan1Store('Plano Admin SaaS');
    await prisma.storeSubscription.update({ where: { storeId: store.id }, data: { planChangeStatus: 'pending', requestedPlan: 'plan3', requestedAt: new Date() } as any });
    const ceo = await createTestUser('ceo', DOMAIN);
    const list = await request(app).get('/api/admin/stores?search=Plano%20Admin%20SaaS').set('Authorization', bearer(ceo));
    const item = (list.body.items ?? list.body.data ?? []).find((s: any) => s.id === store.id);
    expect(item).toBeDefined();
    expect(item.plan).toBeNull();
    const ficha = await request(app).get(`/api/admin/stores/${store.id}`).set('Authorization', bearer(ceo));
    expect(ficha.body.plan.plan).toBeNull();
    const fila = await request(app).get('/api/admin/queue').set('Authorization', bearer(ceo));
    expect(JSON.stringify(fila.body)).not.toContain('Troca de plano · Plano Admin SaaS');
  });

  it('custódia: Plano 1 continua sem banner, sem destaque e sem "Mais vendidos"', async () => {
    await mode('custodia');
    const { store } = await plan1Store();
    const one = await request(app).get(`/api/stores/${store.id}`);
    expect(one.body.plan).toBe(1);
    expect(one.body.featuredBannerUrl).toBeNull();
    const featured = await request(app).get('/api/stores/featured');
    expect(featured.body.map((s: any) => s.id)).not.toContain(store.id);
    const top = await request(app).get(`/api/stores/${store.id}/top-products`);
    expect(top.body.premiumRequired).toBe(true);
  });
});
